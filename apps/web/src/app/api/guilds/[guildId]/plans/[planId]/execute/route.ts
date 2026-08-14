import { NextResponse } from 'next/server';
import { prisma, toJson } from '@dpd/database';
import {
  applyMask,
  assertOnlyTouched,
  fromBits,
  toBits,
  type Bitfield,
} from '@dpd/shared';
import type { ChangeOperation } from '@dpd/permission-engine';
import {
  DiscordError,
  DiscordGlobalRateLimit,
  discord,
  spaceWrites,
  type DiscordChannelPayload,
  type DiscordRolePayload,
} from '@/lib/discord';
import { canWriteGuild, getSession } from '@/lib/session';
import { deserialiseOperation } from '@/lib/plans';
import { writeWindow } from '@/lib/writes';

export const maxDuration = 300;

type OpStatus = 'applied' | 'skipped-noop' | 'skipped-conflict' | 'failed' | 'unknown';

interface OpOutcome {
  operationId: string;
  status: OpStatus;
  liveBeforeAllow?: string;
  liveBeforeDeny?: string;
  liveAfterAllow?: string;
  liveAfterDeny?: string;
  httpStatus?: number;
  discordCode?: number;
  detail?: string;
}

const redirect = (request: Request, guildId: string, planId: string, status: string) =>
  NextResponse.redirect(new URL(`/guilds/${guildId}/changes/${planId}?execute=${status}`, request.url), 303);

/** Read live values for exactly the target an operation touches. */
async function readLive(
  guildId: string,
  operation: ChangeOperation,
): Promise<{ allow: Bitfield; deny: Bitfield } | null> {
  if (operation.kind === 'set-role-permissions') {
    const roles = await discord<DiscordRolePayload[]>(`/guilds/${guildId}/roles`);
    const role = roles.find((candidate) => candidate.id === operation.roleId);
    return role ? { allow: toBits(role.permissions), deny: 0n } : null;
  }
  const channel = await discord<DiscordChannelPayload>(`/channels/${operation.channelId}`);
  const overwrite = (channel.permission_overwrites ?? []).find((o) => o.id === operation.targetId);
  return { allow: toBits(overwrite?.allow), deny: toBits(overwrite?.deny) };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ guildId: string; planId: string }> },
) {
  const { guildId, planId } = await params;

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canWriteGuild(guild));
  if (!allowed || !session) return redirect(request, guildId, planId, 'unauthorized');

  const form = await request.formData();
  const plan = await prisma.permissionChangePlan.findFirst({
    where: { id: planId, guildId },
    include: { operations: { orderBy: { order: 'asc' } }, guild: true },
  });
  if (!plan) return redirect(request, guildId, planId, 'missing');

  // Reinforced confirmation: typing the server's name, not a fixed word. It
  // forces the operator to look at what they are actually pointing at.
  if ((form.get('confirm') as string | null)?.trim() !== plan.guild.name) {
    return redirect(request, guildId, planId, 'confirm');
  }
  // Checked here, not just in the UI: the window may have closed between
  // opening the plan page and pressing apply.
  if (!(await writeWindow(guildId)).enabled) return redirect(request, guildId, planId, 'disabled');
  if (!process.env.DISCORD_BOT_TOKEN) return redirect(request, guildId, planId, 'missing-token');

  // Compare-and-swap: the row count IS the guard. A read-then-write check races
  // a double submit and applies the plan twice.
  const claimed = await prisma.permissionChangePlan.updateMany({
    where: { id: planId, guildId, status: 'draft' },
    data: { status: 'executing' },
  });
  if (claimed.count !== 1) return redirect(request, guildId, planId, 'already-running');

  const latest = await prisma.permissionSnapshot.findFirst({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
  });
  if (latest) {
    await prisma.permissionSnapshot.create({
      data: { guildId, version: latest.version, data: toJson(latest.data ?? {}), reason: `pre-apply-plan:${planId}` },
    });
  }

  const execution = await prisma.permissionChangeExecution.create({
    data: { planId, status: 'running' },
    select: { id: true },
  });

  const outcomes: OpOutcome[] = [];
  let aborted = false;

  for (const row of plan.operations) {
    if (!row.included) {
      outcomes.push({ operationId: row.id, status: 'skipped-noop', detail: 'excluded from the plan' });
      continue;
    }
    const operation = deserialiseOperation(row);

    try {
      const live = await readLive(guildId, operation);
      if (!live) {
        outcomes.push({ operationId: row.id, status: 'failed', detail: 'target no longer exists' });
        continue;
      }

      // Lost update: the plan's recorded `before` is compared against reality
      // before writing. There is no ETag on these endpoints, so a TOCTOU window
      // remains — it is narrowed by reading per operation, not claimed away.
      const drifted =
        (live.allow & operation.touched) !== (operation.expectedAllow & operation.touched) ||
        (live.deny & operation.touched) !== (operation.expectedDeny & operation.touched);
      if (drifted) {
        outcomes.push({
          operationId: row.id,
          status: 'skipped-conflict',
          liveBeforeAllow: fromBits(live.allow),
          liveBeforeDeny: fromBits(live.deny),
          detail: 'changed on Discord since this plan was created',
        });
        continue;
      }

      const nextAllow = applyMask(live.allow, operation.touched, operation.nextAllow);
      const nextDeny = applyMask(live.deny, operation.touched, operation.nextDeny);
      assertOnlyTouched(live.allow, nextAllow, operation.touched);
      assertOnlyTouched(live.deny, nextDeny, operation.touched);

      const unchanged =
        operation.kind !== 'delete-channel-overwrite' && nextAllow === live.allow && nextDeny === live.deny;
      if (unchanged) {
        outcomes.push({ operationId: row.id, status: 'skipped-noop' });
        continue;
      }

      const reason = `D-View plan ${planId} by ${session.user.username}${plan.reason ? `: ${plan.reason}` : ''}`;

      if (operation.kind === 'set-role-permissions') {
        await discord(`/guilds/${guildId}/roles/${operation.roleId}`, {
          method: 'PATCH',
          body: { permissions: fromBits(nextAllow) },
          auditLogReason: reason,
        });
      } else if (operation.kind === 'delete-channel-overwrite') {
        await discord(`/channels/${operation.channelId}/permissions/${operation.targetId}`, {
          method: 'DELETE',
          auditLogReason: reason,
        });
      } else {
        await discord(`/channels/${operation.channelId}/permissions/${operation.targetId}`, {
          method: 'PUT',
          body: {
            type: operation.targetType === 'member' ? 1 : 0,
            allow: fromBits(nextAllow),
            deny: fromBits(nextDeny),
          },
          auditLogReason: reason,
        });
      }

      outcomes.push({
        operationId: row.id,
        status: 'applied',
        liveBeforeAllow: fromBits(live.allow),
        liveBeforeDeny: fromBits(live.deny),
        liveAfterAllow: fromBits(nextAllow),
        liveAfterDeny: fromBits(nextDeny),
      });
      await spaceWrites();
    } catch (error) {
      if (error instanceof DiscordGlobalRateLimit) {
        // Continuing would push us toward Discord's 10k-invalid-requests IP ban.
        outcomes.push({ operationId: row.id, status: 'unknown', detail: error.message });
        aborted = true;
        break;
      }
      if (error instanceof DiscordError) {
        const hierarchy = error.status === 403;
        outcomes.push({
          operationId: row.id,
          status: 'failed',
          httpStatus: error.status,
          ...(error.code !== undefined ? { discordCode: error.code } : {}),
          detail: hierarchy
            ? 'Discord refused: a bot can only grant or deny permissions it holds itself, and cannot edit a role above its own.'
            : error.detail,
        });
        continue;
      }
      // A network failure gives no evidence either way, so the write is recorded
      // as unknown and reclassified by the verification pass below. Guessing here
      // would let a rollback invert an operation that never happened.
      outcomes.push({
        operationId: row.id,
        status: 'unknown',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Verification pass: re-read every target we are unsure about.
  for (const outcome of outcomes) {
    if (outcome.status !== 'unknown') continue;
    const row = plan.operations.find((candidate) => candidate.id === outcome.operationId);
    if (!row) continue;
    const operation = deserialiseOperation(row);
    try {
      const live = await readLive(guildId, operation);
      if (!live) continue;
      const expectedAllow = applyMask(operation.expectedAllow, operation.touched, operation.nextAllow);
      const expectedDeny = applyMask(operation.expectedDeny, operation.touched, operation.nextDeny);
      const landed =
        (live.allow & operation.touched) === (expectedAllow & operation.touched) &&
        (live.deny & operation.touched) === (expectedDeny & operation.touched);
      outcome.status = landed ? 'applied' : 'failed';
      outcome.liveAfterAllow = fromBits(live.allow);
      outcome.liveAfterDeny = fromBits(live.deny);
    } catch {
      // Still unknown. Better to say so than to guess.
    }
  }

  await prisma.permissionChangeOperationResult.createMany({
    data: outcomes.map((outcome) => ({ ...outcome, executionId: execution.id })),
  });

  const applied = outcomes.filter((outcome) => outcome.status === 'applied').length;
  const failed = outcomes.filter((outcome) => outcome.status === 'failed' || outcome.status === 'unknown').length;
  const planStatus = failed === 0 ? 'applied' : applied > 0 || aborted ? 'partial' : 'failed';

  await prisma.permissionChangeExecution.update({
    where: { id: execution.id },
    data: { status: planStatus, finishedAt: new Date() },
  });
  await prisma.permissionChangePlan.update({ where: { id: planId }, data: { status: planStatus } });

  return redirect(request, guildId, planId, planStatus);
}
