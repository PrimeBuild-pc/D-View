import {
  ADMINISTRATOR,
  CHANNEL_SCOPED,
  KNOWN_BITS,
  VIEW_CHANNEL,
  channelKind,
  isThread,
  permissionBits,
  toBits,
  type Bitfield,
  type ChannelKind,
  type DiscordChannelSnapshot,
  type DiscordRoleSnapshot,
  type PermissionSnapshot,
} from '@dpd/shared';

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

export interface ChannelOverwriteBits {
  targetType: 'role' | 'member';
  targetId: string;
  allow: Bitfield;
  deny: Bitfield;
}

export interface GuildIndex {
  guild: PermissionSnapshot['guild'];
  roles: Map<string, DiscordRoleSnapshot>;
  rolePermissions: Map<string, Bitfield>;
  channels: Map<string, DiscordChannelSnapshot>;
  /** channelId -> targetId -> bits. Replaces the linear scans the old engine did per permission. */
  overwrites: Map<string, Map<string, ChannelOverwriteBits>>;
  childrenByParent: Map<string, DiscordChannelSnapshot[]>;
}

export function indexSnapshot(snapshot: PermissionSnapshot): GuildIndex {
  const roles = new Map<string, DiscordRoleSnapshot>();
  const rolePermissions = new Map<string, Bitfield>();
  for (const role of snapshot.roles) {
    roles.set(role.id, role);
    rolePermissions.set(role.id, toBits(role.permissions));
  }

  const channels = new Map<string, DiscordChannelSnapshot>();
  const overwrites = new Map<string, Map<string, ChannelOverwriteBits>>();
  const childrenByParent = new Map<string, DiscordChannelSnapshot[]>();
  for (const channel of snapshot.channels) {
    channels.set(channel.id, channel);
    const byTarget = new Map<string, ChannelOverwriteBits>();
    for (const overwrite of channel.overwrites) {
      byTarget.set(overwrite.targetId, {
        targetType: overwrite.targetType,
        targetId: overwrite.targetId,
        allow: toBits(overwrite.allow),
        deny: toBits(overwrite.deny),
      });
    }
    overwrites.set(channel.id, byTarget);
    if (channel.parentId) {
      const siblings = childrenByParent.get(channel.parentId) ?? [];
      siblings.push(channel);
      childrenByParent.set(channel.parentId, siblings);
    }
  }

  return { guild: snapshot.guild, roles, rolePermissions, channels, overwrites, childrenByParent };
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

/**
 * One subject type serves both views, so there is exactly one implementation of
 * Discord's algorithm.
 *
 * - Role view answers "what does this role grant here, in isolation".
 * - Member view answers what Discord actually resolves for a person.
 */
export type PermissionSubject =
  | { kind: 'role'; roleId: string }
  | { kind: 'member'; userId: string; roleIds: readonly string[]; isOwner: boolean };

/**
 * Discord's `member.roles` never contains @everyone, and the algorithm applies it
 * separately at two different points. Letting it into the role list double-applies
 * it, and the result genuinely diverges: if @everyone's overwrite allows a bit and
 * another role denies it, the correct answer is denied — the allow-union at step 7
 * must not contain @everyone's allow. Filtering is enforced here rather than
 * trusted to callers.
 */
function subjectRoleIds(index: GuildIndex, subject: PermissionSubject): string[] {
  const everyoneId = index.guild.everyoneRoleId;
  const ids = subject.kind === 'role' ? [subject.roleId] : subject.roleIds;
  return ids.filter((id) => id !== everyoneId);
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export type Stage =
  | 'owner'
  | 'base-everyone'
  | 'base-roles'
  | 'administrator'
  | 'overwrite-everyone-deny'
  | 'overwrite-everyone-allow'
  | 'overwrite-roles-deny'
  | 'overwrite-roles-allow'
  | 'overwrite-member-deny'
  | 'overwrite-member-allow'
  | 'implicit-view-deny';

export interface PermissionStep {
  stage: Stage;
  /** Role or user ids responsible for this step, for naming them in the UI. */
  sourceIds: string[];
  before: Bitfield;
  after: Bitfield;
}

export interface ChannelPermissions {
  channelId: string;
  /** Discord's answer. This is what a write must be derived from. */
  raw: Bitfield;
  /** Presentation only: channel permissions suppressed when ViewChannel is denied. */
  effective: Bitfield;
  steps: PermissionStep[];
}

export function computeBasePermissions(index: GuildIndex, subject: PermissionSubject): Bitfield {
  if (subject.kind === 'member' && subject.isOwner) return KNOWN_BITS;
  let permissions = index.rolePermissions.get(index.guild.everyoneRoleId) ?? 0n;
  for (const roleId of subjectRoleIds(index, subject)) {
    permissions |= index.rolePermissions.get(roleId) ?? 0n;
  }
  if ((permissions & ADMINISTRATOR) === ADMINISTRATOR) return KNOWN_BITS;
  return permissions;
}

/**
 * Resolve the channel whose overwrites actually govern access.
 *
 * Threads carry no overwrites and inherit from their parent. Categories do NOT
 * work this way: Discord's `compute_overwrites` never reads `parent_id`, because
 * category "syncing" copies overwrites onto the child at edit time. Treating a
 * category as a read-time fallback invents permissions on de-synced channels.
 */
function governingChannel(index: GuildIndex, channelId: string): DiscordChannelSnapshot | undefined {
  const channel = index.channels.get(channelId);
  if (!channel) return undefined;
  if (isThread(channel.type) && channel.parentId) {
    return index.channels.get(channel.parentId) ?? channel;
  }
  return channel;
}

export function explainChannelPermissions(
  index: GuildIndex,
  channelId: string,
  subject: PermissionSubject,
): ChannelPermissions {
  const steps: PermissionStep[] = [];
  const channel = governingChannel(index, channelId);
  if (!channel) throw new Error(`Unknown channel: ${channelId}`);

  const everyoneId = index.guild.everyoneRoleId;
  const roleIds = subjectRoleIds(index, subject);

  if (subject.kind === 'member' && subject.isOwner) {
    steps.push({ stage: 'owner', sourceIds: [subject.userId], before: 0n, after: KNOWN_BITS });
    return { channelId, raw: KNOWN_BITS, effective: KNOWN_BITS, steps };
  }

  // 1. @everyone role permissions.
  let permissions = index.rolePermissions.get(everyoneId) ?? 0n;
  steps.push({ stage: 'base-everyone', sourceIds: [everyoneId], before: 0n, after: permissions });

  // 2. Union of the subject's own roles.
  if (roleIds.length > 0) {
    const before = permissions;
    for (const roleId of roleIds) permissions |= index.rolePermissions.get(roleId) ?? 0n;
    if (permissions !== before) {
      steps.push({ stage: 'base-roles', sourceIds: [...roleIds], before, after: permissions });
    }
  }

  // 3. Administrator bypasses every channel overwrite.
  if ((permissions & ADMINISTRATOR) === ADMINISTRATOR) {
    const adminSource = [everyoneId, ...roleIds].filter(
      (id) => ((index.rolePermissions.get(id) ?? 0n) & ADMINISTRATOR) === ADMINISTRATOR,
    );
    steps.push({ stage: 'administrator', sourceIds: adminSource, before: permissions, after: KNOWN_BITS });
    return { channelId, raw: KNOWN_BITS, effective: KNOWN_BITS, steps };
  }

  const byTarget = index.overwrites.get(channel.id) ?? new Map<string, ChannelOverwriteBits>();

  // 4. @everyone channel overwrite: deny then allow.
  const everyoneOverwrite = byTarget.get(everyoneId);
  if (everyoneOverwrite) {
    if (everyoneOverwrite.deny !== 0n) {
      const before = permissions;
      permissions &= ~everyoneOverwrite.deny;
      if (permissions !== before) {
        steps.push({ stage: 'overwrite-everyone-deny', sourceIds: [everyoneId], before, after: permissions });
      }
    }
    if (everyoneOverwrite.allow !== 0n) {
      const before = permissions;
      permissions |= everyoneOverwrite.allow;
      if (permissions !== before) {
        steps.push({ stage: 'overwrite-everyone-allow', sourceIds: [everyoneId], before, after: permissions });
      }
    }
  }

  // 5-7. Union all role denies, apply, then union all role allows, apply.
  // Applying deny-then-allow per role instead would give a different answer
  // whenever two of the subject's roles disagree about the same bit.
  let allow = 0n;
  let deny = 0n;
  const denySources: string[] = [];
  const allowSources: string[] = [];
  for (const roleId of roleIds) {
    const overwrite = byTarget.get(roleId);
    if (!overwrite) continue;
    if (overwrite.deny !== 0n) {
      deny |= overwrite.deny;
      denySources.push(roleId);
    }
    if (overwrite.allow !== 0n) {
      allow |= overwrite.allow;
      allowSources.push(roleId);
    }
  }
  if (deny !== 0n) {
    const before = permissions;
    permissions &= ~deny;
    if (permissions !== before) {
      steps.push({ stage: 'overwrite-roles-deny', sourceIds: denySources, before, after: permissions });
    }
  }
  if (allow !== 0n) {
    const before = permissions;
    permissions |= allow;
    if (permissions !== before) {
      steps.push({ stage: 'overwrite-roles-allow', sourceIds: allowSources, before, after: permissions });
    }
  }

  // 8. Member-specific overwrite wins last.
  if (subject.kind === 'member') {
    const memberOverwrite = byTarget.get(subject.userId);
    if (memberOverwrite) {
      if (memberOverwrite.deny !== 0n) {
        const before = permissions;
        permissions &= ~memberOverwrite.deny;
        if (permissions !== before) {
          steps.push({ stage: 'overwrite-member-deny', sourceIds: [subject.userId], before, after: permissions });
        }
      }
      if (memberOverwrite.allow !== 0n) {
        const before = permissions;
        permissions |= memberOverwrite.allow;
        if (permissions !== before) {
          steps.push({ stage: 'overwrite-member-allow', sourceIds: [subject.userId], before, after: permissions });
        }
      }
    }
  }

  const raw = permissions;

  // 10. Without ViewChannel the channel-scoped permissions cannot be exercised.
  // Display only — writing this value back would strip bits nobody edited.
  let effective = raw;
  if ((raw & VIEW_CHANNEL) !== VIEW_CHANNEL) {
    effective = raw & ~CHANNEL_SCOPED;
    if (effective !== raw) {
      steps.push({ stage: 'implicit-view-deny', sourceIds: [], before: raw, after: effective });
    }
  }

  return { channelId, raw, effective, steps };
}

export function computeChannelPermissions(
  index: GuildIndex,
  channelId: string,
  subject: PermissionSubject,
): Bitfield {
  return explainChannelPermissions(index, channelId, subject).raw;
}

/** The steps that actually moved this bit, in order. The last one is decisive. */
export function traceForBit(steps: readonly PermissionStep[], bit: Bitfield): PermissionStep[] {
  return steps.filter((step) => ((step.before ^ step.after) & bit) !== 0n);
}

export function decisiveStep(steps: readonly PermissionStep[], bit: Bitfield): PermissionStep | undefined {
  return traceForBit(steps, bit).at(-1);
}

// ---------------------------------------------------------------------------
// Sync state
// ---------------------------------------------------------------------------

export type SyncState = 'synced' | 'desynced' | 'no-parent';

function normalisedOverwrites(index: GuildIndex, channelId: string): string {
  const byTarget = index.overwrites.get(channelId) ?? new Map<string, ChannelOverwriteBits>();
  return [...byTarget.values()]
    .filter((o) => o.allow !== 0n || o.deny !== 0n)
    .map((o) => `${o.targetType}:${o.targetId}:${o.allow}:${o.deny}`)
    .sort()
    .join('|');
}

/**
 * Whether a channel still matches its category.
 *
 * This is a property of the channel, not of whichever role you happen to be
 * inspecting — the old `hasChannelSpecificOverride` took a role id and so gave a
 * different answer per role for a single objective fact.
 */
export function channelSyncState(index: GuildIndex, channelId: string): SyncState {
  const channel = index.channels.get(channelId);
  if (!channel?.parentId) return 'no-parent';
  return normalisedOverwrites(index, channelId) === normalisedOverwrites(index, channel.parentId)
    ? 'synced'
    : 'desynced';
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

export interface TreeChannel {
  channel: DiscordChannelSnapshot;
  kind: ChannelKind;
  syncState: SyncState;
  permissions: ChannelPermissions;
  memberOverwriteCount: number;
}

export interface TreeCategory {
  category: DiscordChannelSnapshot | null;
  permissions: ChannelPermissions | null;
  children: TreeChannel[];
}

const UNCATEGORISED = '__uncategorised__';

export function buildTree(index: GuildIndex, subject: PermissionSubject): TreeCategory[] {
  const describe = (channel: DiscordChannelSnapshot): TreeChannel => ({
    channel,
    kind: channelKind(channel.type),
    syncState: channelSyncState(index, channel.id),
    permissions: explainChannelPermissions(index, channel.id, subject),
    memberOverwriteCount: [...(index.overwrites.get(channel.id)?.values() ?? [])].filter(
      (o) => o.targetType === 'member',
    ).length,
  });

  const byPosition = (a: DiscordChannelSnapshot, b: DiscordChannelSnapshot) => a.position - b.position;
  const categories = [...index.channels.values()]
    .filter((channel) => channelKind(channel.type) === 'category')
    .sort(byPosition);

  const nodes: TreeCategory[] = categories.map((category) => ({
    category,
    permissions: explainChannelPermissions(index, category.id, subject),
    children: (index.childrenByParent.get(category.id) ?? [])
      .filter((channel) => !isThread(channel.type))
      .sort(byPosition)
      .map(describe),
  }));

  const orphans = [...index.channels.values()]
    .filter(
      (channel) => channelKind(channel.type) !== 'category' && !channel.parentId && !isThread(channel.type),
    )
    .sort(byPosition);

  // The old engine faked this node by cloning the first orphan's permissions onto
  // it, which reported that channel's access as the group's. There is no real
  // channel here, so there are no permissions to report.
  if (orphans.length > 0) {
    nodes.unshift({ category: null, permissions: null, children: orphans.map(describe) });
  }

  return nodes;
}

export { UNCATEGORISED };

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditSeverity = 'critical' | 'warning' | 'info';

export type AuditCode =
  | 'everyone-dangerous-permission'
  | 'no-non-admin-access'
  | 'administrator-role'
  | 'public-channel-in-private-category'
  | 'conflicting-overwrite'
  | 'member-overwrite-exception'
  | 'desynced-channels'
  | 'redundant-overwrite'
  | 'many-overwrites'
  | 'everyone-read-only'
  | 'unsupported-channel-type';

export interface AuditFinding {
  code: AuditCode;
  severity: AuditSeverity;
  /** Values for the localised message. The engine never emits prose. */
  params: Record<string, string | number>;
  channelId?: string;
  roleId?: string;
}

const severityRank: Record<AuditSeverity, number> = { critical: 0, warning: 1, info: 2 };

const dangerousForEveryone = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageWebhooks',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
  'MentionEveryone',
] as const;

const MANY_OVERWRITES = 6;

export function auditSnapshot(snapshot: PermissionSnapshot): AuditFinding[] {
  const index = indexSnapshot(snapshot);
  const findings: AuditFinding[] = [];
  const everyoneId = index.guild.everyoneRoleId;
  const everyonePermissions = index.rolePermissions.get(everyoneId) ?? 0n;

  for (const name of dangerousForEveryone) {
    const bit = permissionBits[name];
    if ((everyonePermissions & bit) === bit) {
      findings.push({
        code: 'everyone-dangerous-permission',
        severity: 'critical',
        params: { permission: name },
        roleId: everyoneId,
      });
    }
  }

  const nonAdminRoles: DiscordRoleSnapshot[] = [];
  for (const role of index.roles.values()) {
    const permissions = index.rolePermissions.get(role.id) ?? 0n;
    if ((permissions & ADMINISTRATOR) === ADMINISTRATOR) {
      if (role.id !== everyoneId) {
        findings.push({
          code: 'administrator-role',
          severity: 'warning',
          params: { role: role.name },
          roleId: role.id,
        });
      }
    } else if (!role.managed) {
      nonAdminRoles.push(role);
    }
  }

  for (const channel of index.channels.values()) {
    const kind = channelKind(channel.type);
    if (kind === 'unsupported') {
      findings.push({
        code: 'unsupported-channel-type',
        severity: 'info',
        params: { channel: channel.name, type: channel.type },
        channelId: channel.id,
      });
      continue;
    }
    if (kind === 'category' || isThread(channel.type)) continue;

    const overwrites = [...(index.overwrites.get(channel.id)?.values() ?? [])];

    const memberOverwrites = overwrites.filter((o) => o.targetType === 'member');
    if (memberOverwrites.length > 0) {
      findings.push({
        code: 'member-overwrite-exception',
        severity: 'warning',
        params: { channel: channel.name, count: memberOverwrites.length },
        channelId: channel.id,
      });
    }

    for (const overwrite of overwrites) {
      if ((overwrite.allow & overwrite.deny) !== 0n) {
        findings.push({
          code: 'conflicting-overwrite',
          severity: 'warning',
          params: { channel: channel.name, target: overwrite.targetId },
          channelId: channel.id,
        });
      }
      if (overwrite.allow === 0n && overwrite.deny === 0n) {
        findings.push({
          code: 'redundant-overwrite',
          severity: 'info',
          params: { channel: channel.name, target: overwrite.targetId },
          channelId: channel.id,
        });
      }
    }

    if (overwrites.length > MANY_OVERWRITES) {
      findings.push({
        code: 'many-overwrites',
        severity: 'info',
        params: { channel: channel.name, count: overwrites.length },
        channelId: channel.id,
      });
    }

    const everyoneSubject: PermissionSubject = { kind: 'role', roleId: everyoneId };
    const everyoneHere = explainChannelPermissions(index, channel.id, everyoneSubject).raw;
    const everyoneSees = (everyoneHere & VIEW_CHANNEL) === VIEW_CHANNEL;

    if (everyoneSees && (everyoneHere & permissionBits.SendMessages) !== permissionBits.SendMessages) {
      findings.push({
        code: 'everyone-read-only',
        severity: 'info',
        params: { channel: channel.name },
        channelId: channel.id,
      });
    }

    if (channel.parentId && everyoneSees) {
      const parentVisible =
        (explainChannelPermissions(index, channel.parentId, everyoneSubject).raw & VIEW_CHANNEL) ===
        VIEW_CHANNEL;
      if (!parentVisible) {
        findings.push({
          code: 'public-channel-in-private-category',
          severity: 'warning',
          params: { channel: channel.name, category: index.channels.get(channel.parentId)?.name ?? '' },
          channelId: channel.id,
        });
      }
    }

    const visibleToSomeone =
      everyoneSees ||
      nonAdminRoles.some(
        (role) =>
          (explainChannelPermissions(index, channel.id, { kind: 'role', roleId: role.id }).raw &
            VIEW_CHANNEL) ===
          VIEW_CHANNEL,
      );
    if (!visibleToSomeone) {
      findings.push({
        code: 'no-non-admin-access',
        severity: 'critical',
        params: { channel: channel.name },
        channelId: channel.id,
      });
    }
  }

  // De-sync is reported once, as a ratio. Emitting it per channel drowned the
  // audit: on a normally-customised server almost every channel differs from its
  // category, so the rule fired ~90% of the time and buried the critical findings
  // under its own output. The per-channel detail lives in the explorer, which has
  // a filter for exactly this.
  const parented = [...index.channels.values()].filter(
    (channel) => channelKind(channel.type) !== 'category' && !isThread(channel.type) && channel.parentId,
  );
  const desynced = parented.filter((channel) => channelSyncState(index, channel.id) === 'desynced');
  if (desynced.length > 0) {
    findings.push({
      code: 'desynced-channels',
      severity: 'info',
      params: { count: desynced.length, total: parented.length },
    });
  }

  // Critical first. The old engine emitted every Administrator warning before any
  // channel finding, so on a server with a handful of admin roles the UI's
  // eight-item cap hid every critical result.
  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

export type ChangeKind = 'set-role-permissions' | 'set-channel-overwrite' | 'delete-channel-overwrite';

/**
 * A planned change, expressed as a masked intent.
 *
 * `touched` covers only the bits that actually differ, so applying a months-old
 * snapshot cannot clobber permissions that were introduced — or edited by someone
 * else — in the meantime.
 */
export interface ChangeOperation {
  kind: ChangeKind;
  roleId?: string;
  channelId?: string;
  targetType?: 'role' | 'member';
  targetId?: string;
  touched: Bitfield;
  nextAllow: Bitfield;
  nextDeny: Bitfield;
  expectedAllow: Bitfield;
  expectedDeny: Bitfield;
}

export function diffSnapshots(current: PermissionSnapshot, candidate: PermissionSnapshot): ChangeOperation[] {
  if (current.guild.id !== candidate.guild.id) {
    throw new Error('Imported snapshot guild id does not match the selected guild.');
  }
  const operations: ChangeOperation[] = [];
  const currentIndex = indexSnapshot(current);

  for (const role of candidate.roles) {
    const live = currentIndex.rolePermissions.get(role.id);
    if (live === undefined) throw new Error(`Unknown role in import: ${role.id}`);
    const next = toBits(role.permissions);
    const touched = live ^ next;
    if (touched === 0n) continue;
    operations.push({
      kind: 'set-role-permissions',
      roleId: role.id,
      touched,
      nextAllow: next & touched,
      nextDeny: 0n,
      expectedAllow: live,
      expectedDeny: 0n,
    });
  }

  for (const channel of candidate.channels) {
    if (!currentIndex.channels.has(channel.id)) throw new Error(`Unknown channel in import: ${channel.id}`);
    const live = currentIndex.overwrites.get(channel.id) ?? new Map<string, ChannelOverwriteBits>();
    const next = new Map(channel.overwrites.map((o) => [o.targetId, o]));

    for (const [targetId, overwrite] of next) {
      const before = live.get(targetId);
      const beforeAllow = before?.allow ?? 0n;
      const beforeDeny = before?.deny ?? 0n;
      const nextAllow = toBits(overwrite.allow);
      const nextDeny = toBits(overwrite.deny);
      const touched = (beforeAllow ^ nextAllow) | (beforeDeny ^ nextDeny);
      if (touched === 0n) continue;
      operations.push({
        kind: 'set-channel-overwrite',
        channelId: channel.id,
        targetType: overwrite.targetType,
        targetId,
        touched,
        nextAllow: nextAllow & touched,
        nextDeny: nextDeny & touched,
        expectedAllow: beforeAllow,
        expectedDeny: beforeDeny,
      });
    }

    for (const [targetId, overwrite] of live) {
      if (next.has(targetId)) continue;
      operations.push({
        kind: 'delete-channel-overwrite',
        channelId: channel.id,
        targetType: overwrite.targetType,
        targetId,
        touched: overwrite.allow | overwrite.deny,
        nextAllow: 0n,
        nextDeny: 0n,
        expectedAllow: overwrite.allow,
        expectedDeny: overwrite.deny,
      });
    }
  }

  return operations;
}

/**
 * Build the plan that undoes an applied one.
 *
 * Only the touched bits are restored. Restoring the whole pre-apply bitfield would
 * overwrite anything a third party changed in the meantime — the same lost-update
 * bug, running backwards.
 */
export function invertOperations(
  applied: readonly (ChangeOperation & { liveBefore?: { allow: Bitfield; deny: Bitfield } })[],
): ChangeOperation[] {
  return applied.map((operation) => {
    const allow = operation.liveBefore?.allow ?? operation.expectedAllow;
    const deny = operation.liveBefore?.deny ?? operation.expectedDeny;
    if (operation.kind === 'delete-channel-overwrite') {
      return { ...operation, kind: 'set-channel-overwrite', nextAllow: allow & operation.touched, nextDeny: deny & operation.touched };
    }
    return { ...operation, nextAllow: allow & operation.touched, nextDeny: deny & operation.touched };
  });
}
