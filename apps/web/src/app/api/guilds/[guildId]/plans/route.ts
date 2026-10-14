import { NextResponse } from 'next/server';
import { prisma, toJson } from '@dpd/database';
import { indexSnapshot } from '@dpd/permission-engine';
import { guildAccess } from '@/lib/guild';
import { invalidOrigin, readJson, requestError } from '@/lib/request';
import {
  PlanValidationError,
  createPlanSchema,
  loadBotContext,
  loadSnapshot,
  resolveEdits,
  serialiseOperation,
  warningsFor,
} from '@/lib/plans';

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  if (invalidOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });

  const access = await guildAccess(guildId);
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { session } = access;
  let body: unknown;
  try { body = await readJson(request); } catch (error) { return requestError(error); }
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const loaded = await loadSnapshot(guildId, parsed.data.baseSnapshotId);
  if (loaded.status === 'none') return NextResponse.json({ error: 'No snapshot found' }, { status: 404 });
  if (loaded.status === 'outdated') {
    return NextResponse.json({ error: 'Snapshot predates the current schema. Re-sync this guild.' }, { status: 409 });
  }

  try {
    // Operations are rebuilt from the snapshot, so nothing the client claimed
    // about before/after — or about risk — is trusted.
    const operations = await resolveEdits(guildId, parsed.data.edits, loaded.snapshot);
    if (operations.length === 0) return NextResponse.json({ error: 'No operations' }, { status: 400 });

    const bot = await loadBotContext(guildId, indexSnapshot(loaded.snapshot));
    if (!bot) return NextResponse.json({ error: 'Cannot verify bot capabilities. Try again later.' }, { status: 502 });
    const warnings = warningsFor(operations, loaded.snapshot, bot);

    const plan = await prisma.permissionChangePlan.create({
      data: {
        guildId,
        createdByDiscordUserId: session.user.id,
        reason: parsed.data.reason?.trim() || null,
        baseSnapshotId: loaded.id,
        warnings: toJson(warnings),
        operations: { create: operations.map(serialiseOperation) },
      },
      select: { id: true },
    });

    return NextResponse.json({ planId: plan.id, warnings });
  } catch (error) {
    if (error instanceof PlanValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return requestError(error);
  }
}
