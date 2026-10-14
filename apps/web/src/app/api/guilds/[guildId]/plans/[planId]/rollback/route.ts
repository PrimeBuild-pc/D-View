import { NextResponse } from 'next/server';
import { prisma, toJson } from '@dpd/database';
import { indexSnapshot } from '@dpd/permission-engine';
import { toBits } from '@dpd/shared';
import { guildAccess } from '@/lib/guild';
import { invalidOrigin } from '@/lib/request';
import { deserialiseOperation, loadBotContext, loadSnapshot, serialiseOperation, warningsFor } from '@/lib/plans';

/**
 * Rollback generates a new plan rather than executing anything itself, so it goes
 * through the same review, confirmation and drift checks as any other change.
 *
 * Only operations that actually landed are inverted, and only the bits they
 * touched are restored. Restoring the whole pre-apply bitfield would overwrite
 * whatever a third party changed in between — the same lost-update bug backwards.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ guildId: string; planId: string }> },
) {
  const { guildId, planId } = await params;
  if (invalidOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const access = await guildAccess(guildId);
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { session } = access;

  const plan = await prisma.permissionChangePlan.findFirst({
    where: { id: planId, guildId },
    include: {
      operations: { orderBy: { order: 'asc' } },
      executions: { orderBy: { startedAt: 'desc' }, take: 1, include: { results: true } },
    },
  });
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

  if (plan.status === 'executing' || plan.status === 'draft') {
    return NextResponse.json({ error: 'Wait for this plan to finish before generating a rollback.' }, { status: 409 });
  }
  const results = plan.executions[0]?.results ?? [];
  const appliedById = new Map(results.filter((result) => result.status === 'applied').map((r) => [r.operationId, r]));
  if (appliedById.size === 0) {
    return NextResponse.json({ error: 'This plan has no applied operations to roll back.' }, { status: 400 });
  }

  const loaded = await loadSnapshot(guildId);
  if (loaded.status !== 'ok') return NextResponse.json({ error: 'No usable snapshot' }, { status: 409 });

  const inverted = plan.operations
    .filter((row) => appliedById.has(row.id))
    .map((row) => {
      const operation = deserialiseOperation(row);
      const observed = appliedById.get(row.id)!;
      // The authority for inversion is what was live immediately before the
      // write, recorded per operation at apply time — not the snapshot.
      const allow = toBits(observed.liveBeforeAllow ?? row.expectedAllow) & operation.touched;
      const deny = toBits(observed.liveBeforeDeny ?? row.expectedDeny) & operation.touched;
      // Legacy results cannot distinguish an absent overwrite from an explicit zero one.
      const existedBefore = observed.liveBeforeExists ?? (toBits(observed.liveBeforeAllow ?? row.expectedAllow) !== 0n ||
        toBits(observed.liveBeforeDeny ?? row.expectedDeny) !== 0n);
      return {
        ...operation,
        kind:
          operation.kind === 'set-role-permissions'
            ? ('set-role-permissions' as const)
            : existedBefore
              ? ('set-channel-overwrite' as const)
              : ('delete-channel-overwrite' as const),
        nextAllow: allow,
        nextDeny: deny,
        expectedAllow: toBits(observed.liveAfterAllow ?? '0'),
        expectedDeny: toBits(observed.liveAfterDeny ?? '0'),
      };
    });

  const bot = await loadBotContext(guildId, indexSnapshot(loaded.snapshot));
  if (!bot) return NextResponse.json({ error: 'Cannot verify bot capabilities.' }, { status: 502 });
  const warnings = warningsFor(inverted, loaded.snapshot, bot);

  const rollback = await prisma.permissionChangePlan.create({
    data: {
      guildId,
      createdByDiscordUserId: session.user.id,
      reason: `Rollback of plan ${planId}`,
      baseSnapshotId: loaded.id,
      rollbackOfPlanId: planId,
      warnings: toJson(warnings),
      operations: { create: inverted.map(serialiseOperation) },
    },
    select: { id: true },
  });

  return NextResponse.json({ planId: rollback.id, warnings });
}
