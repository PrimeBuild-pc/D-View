import { z } from 'zod';
import { prisma } from '@dpd/database';
import {
  ADMINISTRATOR,
  VIEW_CHANNEL,
  applyMask,
  fromBits,
  isCurrentSnapshot,
  permissionBits,
  permissionSnapshotSchema,
  toBits,
  type Bitfield,
  type PermissionSnapshot,
} from '@dpd/shared';
import { explainChannelPermissions, indexSnapshot, type ChangeOperation, type GuildIndex } from '@dpd/permission-engine';
import { discord, type DiscordMemberPayload } from './discord';

// ---------------------------------------------------------------------------
// Snapshot loading
// ---------------------------------------------------------------------------

export type SnapshotLoad =
  | { status: 'ok'; snapshot: PermissionSnapshot; id: string; createdAt: Date }
  | { status: 'none' }
  | { status: 'outdated'; version: string | null };

/**
 * Loading is version-guarded rather than parsing blindly.
 *
 * Snapshots written before the bitfield migration stored permission *names* and
 * cannot be upgraded without reintroducing the loss that made them wrong. Parsing
 * one would throw and take the page down instead of degrading, so they are
 * reported and the guild is re-synced.
 */
export async function loadSnapshot(guildId: string, snapshotId?: string): Promise<SnapshotLoad> {
  const row = snapshotId
    ? await prisma.permissionSnapshot.findFirst({ where: { id: snapshotId, guildId } })
    : await prisma.permissionSnapshot.findFirst({ where: { guildId }, orderBy: { createdAt: 'desc' } });
  if (!row) return { status: 'none' };
  if (!isCurrentSnapshot(row.data)) {
    return { status: 'outdated', version: (row.data as { schemaVersion?: string })?.schemaVersion ?? null };
  }
  const parsed = permissionSnapshotSchema.safeParse(row.data);
  if (!parsed.success) return { status: 'outdated', version: row.version };
  return { status: 'ok', snapshot: parsed.data as PermissionSnapshot, id: row.id, createdAt: row.createdAt };
}

// ---------------------------------------------------------------------------
// Edit intents
// ---------------------------------------------------------------------------

const bitsField = z.string().regex(/^\d+$/);

/**
 * What the client is allowed to send.
 *
 * It sends *intent*, never operations. Previously the client supplied `kind`,
 * `targetId`, `before`, `after` and even `warnings` verbatim, so it could submit
 * an @everyone change declaring no warnings and the confirmation screen would
 * show none.
 */
export const editSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('role'),
    roleId: z.string().min(1),
    touched: bitsField,
    nextAllow: bitsField,
  }),
  z.object({
    kind: z.literal('overwrite'),
    channelId: z.string().min(1),
    targetType: z.enum(['role', 'member']),
    targetId: z.string().min(1),
    touched: bitsField,
    nextAllow: bitsField,
    nextDeny: bitsField,
  }),
  z.object({
    kind: z.literal('delete-overwrite'),
    channelId: z.string().min(1),
    targetType: z.enum(['role', 'member']),
    targetId: z.string().min(1),
  }),
]);

export const createPlanSchema = z.object({
  baseSnapshotId: z.string().min(1),
  reason: z.string().max(400).optional(),
  edits: z.array(editSchema).min(1).max(500),
});

export type PlanEdit = z.infer<typeof editSchema>;

export class PlanValidationError extends Error {}

/**
 * Turn intents into operations, resolving every id against the guild.
 *
 * Resolving rather than trusting is what closes the cross-guild write hole: the
 * old code parsed a `channelId:targetType:targetId` string out of the plan and
 * never checked the channel belonged to this guild, so an admin of any guild the
 * bot was in could write to channels in another one.
 */
export async function resolveEdits(
  guildId: string,
  edits: readonly PlanEdit[],
  snapshot: PermissionSnapshot,
): Promise<ChangeOperation[]> {
  const [roles, channels] = await Promise.all([
    prisma.discordRole.findMany({ where: { guildId }, select: { id: true } }),
    prisma.discordChannel.findMany({ where: { guildId }, select: { id: true } }),
  ]);
  const roleIds = new Set(roles.map((role) => role.id));
  const channelIds = new Set(channels.map((channel) => channel.id));
  const index = indexSnapshot(snapshot);

  return edits.map((edit): ChangeOperation => {
    if (edit.kind === 'role') {
      if (!roleIds.has(edit.roleId)) throw new PlanValidationError(`Role ${edit.roleId} does not belong to this guild.`);
      const touched = toBits(edit.touched);
      const live = index.rolePermissions.get(edit.roleId) ?? 0n;
      return {
        kind: 'set-role-permissions',
        roleId: edit.roleId,
        touched,
        nextAllow: toBits(edit.nextAllow) & touched,
        nextDeny: 0n,
        expectedAllow: live,
        expectedDeny: 0n,
      };
    }

    if (!channelIds.has(edit.channelId)) {
      throw new PlanValidationError(`Channel ${edit.channelId} does not belong to this guild.`);
    }
    if (edit.targetType === 'role' && !roleIds.has(edit.targetId)) {
      throw new PlanValidationError(`Role ${edit.targetId} does not belong to this guild.`);
    }
    const existing = index.overwrites.get(edit.channelId)?.get(edit.targetId);

    if (edit.kind === 'delete-overwrite') {
      return {
        kind: 'delete-channel-overwrite',
        channelId: edit.channelId,
        targetType: edit.targetType,
        targetId: edit.targetId,
        touched: (existing?.allow ?? 0n) | (existing?.deny ?? 0n),
        nextAllow: 0n,
        nextDeny: 0n,
        expectedAllow: existing?.allow ?? 0n,
        expectedDeny: existing?.deny ?? 0n,
      };
    }

    const touched = toBits(edit.touched);
    return {
      kind: 'set-channel-overwrite',
      channelId: edit.channelId,
      targetType: edit.targetType,
      targetId: edit.targetId,
      touched,
      nextAllow: toBits(edit.nextAllow) & touched,
      nextDeny: toBits(edit.nextDeny) & touched,
      expectedAllow: existing?.allow ?? 0n,
      expectedDeny: existing?.deny ?? 0n,
    };
  });
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

export type WarningCode =
  | 'everyone-role'
  | 'administrator-grant'
  | 'privilege-escalation'
  | 'role-above-bot'
  | 'channel-hidden-from-all'
  | 'bot-self-lockout';

export interface PlanWarning {
  code: WarningCode;
  severity: 'critical' | 'warning';
  params: Record<string, string | number>;
  operationIndex?: number;
}

const escalationBits =
  permissionBits.ManageRoles |
  permissionBits.ManageGuild |
  permissionBits.ManageWebhooks |
  permissionBits.BanMembers |
  permissionBits.KickMembers |
  permissionBits.ModerateMembers;

export interface BotContext {
  userId: string;
  roleIds: string[];
  highestRolePosition: number;
}

export async function loadBotContext(guildId: string, index: GuildIndex): Promise<BotContext | null> {
  try {
    const me = await discord<DiscordMemberPayload>(`/guilds/${guildId}/members/@me`);
    const highest = me.roles.reduce((max, roleId) => Math.max(max, index.roles.get(roleId)?.position ?? 0), 0);
    return { userId: me.user.id, roleIds: me.roles, highestRolePosition: highest };
  } catch {
    return null;
  }
}

/**
 * Warnings are always recomputed here, never taken from the request.
 *
 * `channel-hidden-from-all` and `bot-self-lockout` are the ones worth the extra
 * work: the first catches a change that quietly orphans a channel, the second
 * catches a plan that strips the bot's own ManageRoles and so makes every later
 * operation in the same plan fail.
 */
export function warningsFor(
  operations: readonly ChangeOperation[],
  snapshot: PermissionSnapshot,
  bot: BotContext | null,
): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const index = indexSnapshot(snapshot);
  const everyoneId = snapshot.guild.everyoneRoleId;

  operations.forEach((operation, operationIndex) => {
    const targetsEveryone = operation.roleId === everyoneId || operation.targetId === everyoneId;
    if (targetsEveryone) {
      warnings.push({ code: 'everyone-role', severity: 'critical', params: {}, operationIndex });
    }

    const granting = operation.nextAllow & operation.touched;
    if ((granting & ADMINISTRATOR) === ADMINISTRATOR) {
      warnings.push({ code: 'administrator-grant', severity: 'critical', params: {}, operationIndex });
    }
    if ((granting & escalationBits) !== 0n) {
      warnings.push({ code: 'privilege-escalation', severity: 'warning', params: {}, operationIndex });
    }

    if (bot && operation.kind === 'set-role-permissions' && operation.roleId) {
      const position = index.roles.get(operation.roleId)?.position ?? 0;
      if (position >= bot.highestRolePosition) {
        warnings.push({
          code: 'role-above-bot',
          severity: 'critical',
          params: { role: index.roles.get(operation.roleId)?.name ?? operation.roleId },
          operationIndex,
        });
      }
    }

    if (bot && operation.roleId && bot.roleIds.includes(operation.roleId)) {
      const live = index.rolePermissions.get(operation.roleId) ?? 0n;
      const next = applyMask(live, operation.touched, operation.nextAllow);
      if ((live & permissionBits.ManageRoles) !== 0n && (next & permissionBits.ManageRoles) === 0n) {
        warnings.push({ code: 'bot-self-lockout', severity: 'critical', params: {}, operationIndex });
      }
    }
  });

  // Simulate the whole plan once, then look for channels nobody can reach.
  const after = simulate(snapshot, operations);
  const afterIndex = indexSnapshot(after);
  const candidates = new Set(operations.map((operation) => operation.channelId).filter(Boolean) as string[]);
  const nonAdminRoles = [...afterIndex.roles.values()].filter(
    (role) => ((afterIndex.rolePermissions.get(role.id) ?? 0n) & ADMINISTRATOR) !== ADMINISTRATOR && !role.managed,
  );
  for (const channelId of candidates) {
    const reachable = nonAdminRoles.some(
      (role) =>
        (explainChannelPermissions(afterIndex, channelId, { kind: 'role', roleId: role.id }).raw & VIEW_CHANNEL) ===
        VIEW_CHANNEL,
    );
    if (!reachable) {
      warnings.push({
        code: 'channel-hidden-from-all',
        severity: 'critical',
        params: { channel: afterIndex.channels.get(channelId)?.name ?? channelId },
      });
    }
  }

  return warnings;
}

/** Apply operations to a snapshot in memory, for previews and warning checks. */
export function simulate(snapshot: PermissionSnapshot, operations: readonly ChangeOperation[]): PermissionSnapshot {
  const next: PermissionSnapshot = structuredClone(snapshot);
  for (const operation of operations) {
    if (operation.kind === 'set-role-permissions' && operation.roleId) {
      const role = next.roles.find((candidate) => candidate.id === operation.roleId);
      if (role) role.permissions = fromBits(applyMask(toBits(role.permissions), operation.touched, operation.nextAllow));
      continue;
    }
    const channel = next.channels.find((candidate) => candidate.id === operation.channelId);
    if (!channel || !operation.targetId) continue;
    const position = channel.overwrites.findIndex((o) => o.targetId === operation.targetId);
    if (operation.kind === 'delete-channel-overwrite') {
      if (position >= 0) channel.overwrites.splice(position, 1);
      continue;
    }
    const current = position >= 0 ? channel.overwrites[position]! : undefined;
    const allow = applyMask(toBits(current?.allow), operation.touched, operation.nextAllow);
    const deny = applyMask(toBits(current?.deny), operation.touched, operation.nextDeny);
    const updated = {
      targetType: operation.targetType ?? 'role',
      targetId: operation.targetId,
      allow: fromBits(allow),
      deny: fromBits(deny),
    };
    if (position >= 0) channel.overwrites[position] = updated;
    else channel.overwrites.push(updated);
  }
  return next;
}

export const serialiseOperation = (operation: ChangeOperation, order: number) => ({
  kind: operation.kind,
  roleId: operation.roleId ?? null,
  channelId: operation.channelId ?? null,
  targetType: operation.targetType ?? null,
  targetId: operation.targetId ?? null,
  touchedBits: fromBits(operation.touched),
  nextAllow: fromBits(operation.nextAllow),
  nextDeny: fromBits(operation.nextDeny),
  expectedAllow: fromBits(operation.expectedAllow),
  expectedDeny: fromBits(operation.expectedDeny),
  order,
});

export const deserialiseOperation = (row: {
  kind: string;
  roleId: string | null;
  channelId: string | null;
  targetType: string | null;
  targetId: string | null;
  touchedBits: string;
  nextAllow: string;
  nextDeny: string;
  expectedAllow: string;
  expectedDeny: string;
}): ChangeOperation => ({
  kind: row.kind as ChangeOperation['kind'],
  ...(row.roleId ? { roleId: row.roleId } : {}),
  ...(row.channelId ? { channelId: row.channelId } : {}),
  ...(row.targetType ? { targetType: row.targetType as 'role' | 'member' } : {}),
  ...(row.targetId ? { targetId: row.targetId } : {}),
  touched: toBits(row.touchedBits),
  nextAllow: toBits(row.nextAllow),
  nextDeny: toBits(row.nextDeny),
  expectedAllow: toBits(row.expectedAllow),
  expectedDeny: toBits(row.expectedDeny),
});

export function requiresReinforcedConfirmation(warnings: readonly PlanWarning[]): boolean {
  return warnings.some((warning) => warning.severity === 'critical');
}

export type { Bitfield };
