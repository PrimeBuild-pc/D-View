import { NextResponse } from 'next/server';
import { prisma, toJson } from '@dpd/database';
import { applyMask, assertOnlyTouched, fromBits, isThread, toBits, type Bitfield } from '@dpd/shared';
import type { ChangeOperation } from '@dpd/permission-engine';
import { DiscordError, DiscordGlobalRateLimit, discord, spaceWrites,
  type DiscordChannelPayload, type DiscordRolePayload, type DiscordMemberPayload } from '@/lib/discord';
import { authorizeGuild, guildAccess } from '@/lib/guild';
import { deserialiseOperation } from '@/lib/plans';
import { appUrl, invalidOrigin, readForm, requestError } from '@/lib/request';
import { snapshotGuild } from '@/lib/snapshots';
import { writeState } from '@/lib/writes';
import { EXECUTION_DEADLINE_MS } from '@/lib/recovery';

export const maxDuration = 300;
type OpStatus = 'applied' | 'skipped-noop' | 'skipped-conflict' | 'failed' | 'unknown';
interface Live { allow: Bitfield; deny: Bitfield; exists: boolean }
interface OpOutcome {
  operationId: string; status: OpStatus; liveBeforeAllow?: string; liveBeforeDeny?: string;
  liveAfterAllow?: string; liveAfterDeny?: string; liveBeforeExists?: boolean; liveAfterExists?: boolean;
  httpStatus?: number; discordCode?: number; detail?: string;
}
const redirect = (guildId: string, planId: string, status: string) =>
  NextResponse.redirect(new URL(`/guilds/${guildId}/changes/${planId}?execute=${status}`, appUrl()), 303);

async function readLive(guildId: string, operation: ChangeOperation): Promise<Live | null> {
  if (operation.kind === 'set-role-permissions') {
    const roles = await discord<DiscordRolePayload[]>(`/guilds/${guildId}/roles`);
    const role = roles.find((candidate) => candidate.id === operation.roleId);
    if (role?.managed) throw new Error('Managed roles cannot be edited.');
    return role ? { allow: toBits(role.permissions), deny: 0n, exists: true } : null;
  }
  const channel = await discord<DiscordChannelPayload>(`/channels/${operation.channelId}`);
  if (channel.guild_id !== guildId || isThread(channel.type)) throw new Error('Channel is outside this server or cannot have overwrites.');
  if (operation.targetType === 'role') {
    const roles = await discord<DiscordRolePayload[]>(`/guilds/${guildId}/roles`);
    if (!roles.some((role) => role.id === operation.targetId)) return null;
  } else if (operation.kind !== 'delete-channel-overwrite') {
    const member = await discord<DiscordMemberPayload>(`/guilds/${guildId}/members/${operation.targetId}`);
    if (member.user.id !== operation.targetId) return null;
  }
  const overwrite = (channel.permission_overwrites ?? []).find((o) => o.id === operation.targetId);
  if (overwrite && overwrite.type !== (operation.targetType === 'member' ? 1 : 0)) throw new Error('Overwrite target type changed.');
  return { allow: toBits(overwrite?.allow), deny: toBits(overwrite?.deny), exists: Boolean(overwrite) };
}

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string; planId: string }> }) {
  const { guildId, planId } = await params;
  if (invalidOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  const access = await guildAccess(guildId);
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { session } = access;
  let form: FormData;
  try { form = await readForm(request); } catch (error) { return requestError(error); }
  const plan = await prisma.permissionChangePlan.findFirst({
    where: { id: planId, guildId }, include: { operations: { orderBy: { order: 'asc' } }, guild: true },
  });
  if (!plan) return redirect(guildId, planId, 'missing');
  if (form.get('confirm')?.toString().trim() !== access.guild.name) return redirect(guildId, planId, 'confirm');
  if (!(await writeState(guildId)).enabled) return redirect(guildId, planId, 'disabled');
  if (!process.env.DISCORD_BOT_TOKEN) return redirect(guildId, planId, 'missing-token');
  if (plan.status !== 'draft') return redirect(guildId, planId, 'already-running');

  let execution: { id: string } | null;
  try {
    const targets = new Set<string>();
    for (const row of plan.operations) {
      deserialiseOperation(row);
      const key = row.roleId ? `role:${row.roleId}` : `${row.channelId}:${row.targetId}`;
      if (targets.has(key)) return NextResponse.json({ error: 'Duplicate targets. Create a new plan.' }, { status: 409 });
      targets.add(key);
    }
    // Capture reality, not the possibly months-old cached snapshot, before claiming the plan.
    const before = await snapshotGuild(guildId);
    execution = await prisma.$transaction(async (tx) => {
      // The guild row serializes claims: different plans for one server must not run together.
      await tx.discordGuild.update({ where: { id: guildId }, data: { name: before.guild.name, ownerId: before.guild.ownerId } });
      if (await tx.permissionChangePlan.findFirst({ where: { guildId, status: 'executing' }, select: { id: true } })) return null;
      const claimed = await tx.permissionChangePlan.updateMany({
        where: { id: planId, guildId, status: 'draft' }, data: { status: 'executing' },
      });
      if (claimed.count !== 1) return null;
      await tx.permissionSnapshot.create({
        data: { guildId, version: before.schemaVersion, data: toJson(before), reason: `pre-apply-plan:${planId}` },
      });
      return tx.permissionChangeExecution.create({ data: { planId, status: 'running' }, select: { id: true } });
    });
  } catch (error) { return requestError(error); }
  if (!execution) return redirect(guildId, planId, 'already-running');

  const outcomes: OpOutcome[] = [];
  const started = Date.now();
  let abortReason = '';
  for (const row of plan.operations) {
    let live: Live | null = null;
    let attempted = false;
    const operation = deserialiseOperation(row);
    let outcome: OpOutcome = { operationId: row.id, status: 'failed' };
    try {
      if (abortReason || !row.included) {
        outcome = { operationId: row.id, status: abortReason ? 'failed' : 'skipped-noop',
          detail: abortReason || 'excluded from the plan' };
      } else if (Date.now() - started > EXECUTION_DEADLINE_MS || !(await writeState(guildId)).enabled ||
        !(await authorizeGuild(session, guildId))) {
        abortReason = 'Stopped: execution deadline, write lock or authorization changed.';
        outcome.detail = abortReason;
      } else {
        live = await readLive(guildId, operation);
        if (!live) {
          outcome.detail = 'target no longer exists';
        } else {
          outcome.liveBeforeAllow = fromBits(live.allow);
          outcome.liveBeforeDeny = fromBits(live.deny);
          outcome.liveBeforeExists = live.exists;
          const drifted = (live.allow & operation.touched) !== (operation.expectedAllow & operation.touched) ||
            (live.deny & operation.touched) !== (operation.expectedDeny & operation.touched);
          if (drifted) {
            outcome.status = 'skipped-conflict';
            outcome.detail = 'changed on Discord since this plan was created';
          } else {
            const nextAllow = applyMask(live.allow, operation.touched, operation.nextAllow);
            const nextDeny = applyMask(live.deny, operation.touched, operation.nextDeny);
            assertOnlyTouched(live.allow, nextAllow, operation.touched);
            assertOnlyTouched(live.deny, nextDeny, operation.touched);
            const deletion = operation.kind === 'delete-channel-overwrite';
            const remove = deletion && nextAllow === 0n && nextDeny === 0n;
            const unchanged = nextAllow === live.allow && nextDeny === live.deny &&
              (operation.kind === 'set-role-permissions' || (remove ? !live.exists : live.exists));
            if (unchanged) {
              outcome.status = 'skipped-noop';
            } else {
              const reason = `D-View plan ${planId} by ${session.user.id}${plan.reason ? `: ${plan.reason}` : ''}`;
              // Record before sending: a crash must leave evidence of a potentially landed write.
              await prisma.permissionChangeOperationResult.upsert({
                where: { executionId_operationId: { executionId: execution.id, operationId: row.id } },
                create: { ...outcome, status: 'unknown', executionId: execution.id },
                update: { ...outcome, status: 'unknown' },
              });
              if (Date.now() - started > EXECUTION_DEADLINE_MS) throw new Error('Execution deadline expired.');
              const [authorized, current] = await Promise.all([
                authorizeGuild(session, guildId),
                prisma.permissionChangeExecution.findUnique({ where: { id: execution.id }, select: { status: true } }),
              ]);
              const state = await writeState(guildId);
              if (!authorized || session.expiresAt <= Date.now() || !state.enabled || (state.until && state.until.getTime() <= Date.now()) ||
                current?.status !== 'running' || Date.now() - started > EXECUTION_DEADLINE_MS) {
                abortReason = 'Execution stopped before writing: authorization, write lock or execution changed.';
                throw new Error(abortReason);
              }
              attempted = true;
              if (operation.kind === 'set-role-permissions') {
                await discord(`/guilds/${guildId}/roles/${operation.roleId}`, {
                  method: 'PATCH', body: { permissions: fromBits(nextAllow) }, auditLogReason: reason,
                });
              } else if (remove) {
                await discord(`/channels/${operation.channelId}/permissions/${operation.targetId}`, {
                  method: 'DELETE', auditLogReason: reason,
                });
              } else {
                // DELETE would also remove concurrently added, untouched bits. Keep them with PUT.
                await discord(`/channels/${operation.channelId}/permissions/${operation.targetId}`, {
                  method: 'PUT', body: { type: operation.targetType === 'member' ? 1 : 0,
                    allow: fromBits(nextAllow), deny: fromBits(nextDeny) }, auditLogReason: reason,
                });
              }
              outcome.status = 'applied';
              outcome.liveAfterAllow = fromBits(nextAllow);
              outcome.liveAfterDeny = fromBits(nextDeny);
              outcome.liveAfterExists = !remove;
              await spaceWrites();
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof DiscordGlobalRateLimit) {
        abortReason = 'Discord global rate limit: remaining operations were not attempted.';
        outcome.detail = abortReason;
      } else if (error instanceof DiscordError) {
        outcome.status = attempted && error.status >= 500 ? 'unknown' : 'failed';
        outcome.httpStatus = error.status;
        if (error.code !== undefined) outcome.discordCode = error.code;
        outcome.detail = error.status === 403 ? 'Discord refused the bot permissions or role hierarchy.' : error.detail;
      } else {
        outcome.status = attempted ? 'unknown' : 'failed';
        outcome.detail = attempted ? 'Write response unavailable; verifying live state.' : abortReason || 'Cannot validate live target.';
      }
    }

    if (outcome.status === 'unknown' && live) {
      try {
        const observed = await readLive(guildId, operation);
        if (observed) {
          const removing = operation.kind === 'delete-channel-overwrite' &&
            applyMask(live.allow, operation.touched, operation.nextAllow) === 0n &&
            applyMask(live.deny, operation.touched, operation.nextDeny) === 0n;
          const landed = (removing ? !observed.exists : observed.exists) &&
            (observed.allow & operation.touched) === (operation.nextAllow & operation.touched) &&
            (observed.deny & operation.touched) === (operation.nextDeny & operation.touched);
          outcome.status = landed ? 'applied' : 'unknown';
          outcome.liveAfterAllow = fromBits(observed.allow);
          outcome.liveAfterDeny = fromBits(observed.deny);
          outcome.liveAfterExists = observed.exists;
        }
      } catch { /* Still unknown: do not make rollback invert a guessed write. */ }
    }
    // Persist each result promptly; a process exit must not erase evidence of previous writes.
    try {
      await prisma.$transaction(async (tx) => {
        // Serialize late responses with recovery; neither side may lose evidence of an applied operation.
        const running = await tx.permissionChangeExecution.updateMany({
          where: { id: execution.id, status: 'running' }, data: { status: 'running' },
        });
        await tx.permissionChangeOperationResult.upsert({
          where: { executionId_operationId: { executionId: execution.id, operationId: row.id } },
          create: { ...outcome, executionId: execution.id }, update: outcome,
        });
        if (running.count === 0 && outcome.status === 'applied') await tx.permissionChangePlan.updateMany({
          where: { id: planId, guildId, status: 'failed' }, data: { status: 'partial' },
        });
      });
    } catch (error) { return requestError(error); }
    outcomes.push(outcome);
  }
  const applied = outcomes.filter((outcome) => outcome.status === 'applied').length;
  const failed = outcomes.filter((outcome) => ['failed', 'unknown', 'skipped-conflict'].includes(outcome.status)).length;
  const status = failed === 0 ? 'applied' : applied > 0 ? 'partial' : 'failed';
  try {
    await prisma.$transaction(async (tx) => {
      const active = await tx.permissionChangeExecution.updateMany({
        where: { id: execution.id, status: 'running' }, data: { status, finishedAt: new Date() },
      });
      if (active.count === 1) await tx.permissionChangePlan.updateMany({
        where: { id: planId, guildId, status: 'executing' }, data: { status },
      });
    });
  } catch (error) { return requestError(error); }
  return redirect(guildId, planId, status);
}
