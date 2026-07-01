import type {
  ChannelId,
  DiscordChannelSnapshot,
  PermissionName,
  PermissionOverwrite,
  PermissionSnapshot,
  RoleId,
} from '@dpd/shared';

export type PermissionSource =
  | 'global-role'
  | 'category-overwrite'
  | 'channel-overwrite'
  | 'inherited'
  | 'administrator-bypass';

export interface PermissionTraceEntry {
  source: PermissionSource;
  permission: PermissionName;
  allowedBefore: boolean;
  allowedAfter: boolean;
  reason: string;
}

export interface PermissionExplanation {
  permission: PermissionName;
  allowed: boolean;
  source: PermissionSource;
  trace: PermissionTraceEntry[];
}

export interface ChannelPermissionResult {
  channel: DiscordChannelSnapshot;
  category?: DiscordChannelSnapshot;
  roleId: RoleId;
  permissions: Record<string, PermissionExplanation>;
  hasChannelSpecificOverride: boolean;
  memberOverwriteCount: number;
}

export interface TreeNodeResult extends ChannelPermissionResult {
  children: ChannelPermissionResult[];
}

export interface AuditFinding {
  severity: 'Info' | 'Warning' | 'Critical';
  title: string;
  description: string;
  channelId?: ChannelId;
  roleId?: RoleId;
}

export interface SnapshotDiffOperation {
  kind: 'set-role-permissions' | 'set-role-channel-overwrite' | 'delete-role-channel-overwrite';
  targetId: string;
  before: unknown;
  after: unknown;
  warnings: string[];
}

const defaultPermissions = ['ViewChannel', 'SendMessages'] satisfies PermissionName[];

function hasPermission(list: PermissionName[], permission: PermissionName): boolean {
  return list.includes(permission);
}

function findRoleOverwrite(overwrites: PermissionOverwrite[], roleId: RoleId): PermissionOverwrite | undefined {
  return overwrites.find((o) => o.targetType === 'role' && o.targetId === roleId);
}

function sorted(list: PermissionName[] | undefined): PermissionName[] {
  return [...(list ?? [])].sort();
}

function roleOverwritesEqual(a?: PermissionOverwrite, b?: PermissionOverwrite): boolean {
  return sorted(a?.allow).join('\0') === sorted(b?.allow).join('\0')
    && sorted(a?.deny).join('\0') === sorted(b?.deny).join('\0');
}

function applyOverwrite(
  current: boolean,
  permission: PermissionName,
  overwrite: PermissionOverwrite | undefined,
  source: PermissionSource,
  label: string,
  trace: PermissionTraceEntry[],
): boolean {
  if (!overwrite) return current;
  const before = current;
  let after = current;
  if (hasPermission(overwrite.deny, permission)) after = false;
  if (hasPermission(overwrite.allow, permission)) after = true;
  if (after !== before) {
    trace.push({ source, permission, allowedBefore: before, allowedAfter: after, reason: label });
  }
  return after;
}

export function calculateChannelPermissions(
  snapshot: PermissionSnapshot,
  roleId: RoleId,
  channelId: ChannelId,
  permissions: PermissionName[] = defaultPermissions,
): ChannelPermissionResult {
  const role = snapshot.roles.find((r) => r.id === roleId);
  const channel = snapshot.channels.find((c) => c.id === channelId);
  if (!role) throw new Error(`Unknown role: ${roleId}`);
  if (!channel) throw new Error(`Unknown channel: ${channelId}`);

  const category = channel.parentId ? snapshot.channels.find((c) => c.id === channel.parentId) : undefined;
  const memberOverwriteCount = channel.overwrites.filter((o) => o.targetType === 'member').length;
  const categoryEveryone = category ? findRoleOverwrite(category.overwrites, snapshot.guild.everyoneRoleId) : undefined;
  const categoryRole = category ? findRoleOverwrite(category.overwrites, roleId) : undefined;
  const channelEveryone = findRoleOverwrite(channel.overwrites, snapshot.guild.everyoneRoleId);
  const channelRole = findRoleOverwrite(channel.overwrites, roleId);
  const hasChannelSpecificOverride = !roleOverwritesEqual(categoryEveryone, channelEveryone) || !roleOverwritesEqual(categoryRole, channelRole);

  const result: Record<string, PermissionExplanation> = {};

  for (const permission of permissions) {
    if (hasPermission(role.permissions, 'Administrator')) {
      result[permission] = {
        permission,
        allowed: true,
        source: 'administrator-bypass',
        trace: [{
          source: 'administrator-bypass',
          permission,
          allowedBefore: hasPermission(role.permissions, permission),
          allowedAfter: true,
          reason: 'Role has Administrator, which bypasses channel restrictions.',
        }],
      };
      continue;
    }

    const trace: PermissionTraceEntry[] = [];
    let allowed = hasPermission(role.permissions, permission);
    trace.push({
      source: 'global-role',
      permission,
      allowedBefore: false,
      allowedAfter: allowed,
      reason: allowed ? 'Allowed by global role permission.' : 'Not present in global role permissions.',
    });

    allowed = applyOverwrite(allowed, permission, categoryEveryone, 'category-overwrite', '@everyone category overwrite', trace);
    allowed = applyOverwrite(allowed, permission, categoryRole, 'category-overwrite', 'Selected role category overwrite', trace);
    allowed = applyOverwrite(allowed, permission, channelEveryone, 'channel-overwrite', '@everyone channel overwrite', trace);
    allowed = applyOverwrite(allowed, permission, channelRole, 'channel-overwrite', 'Selected role channel overwrite', trace);

    result[permission] = {
      permission,
      allowed,
      source: trace.at(-1)?.source ?? 'inherited',
      trace,
    };
  }

  return {
    channel,
    ...(category ? { category } : {}),
    roleId,
    permissions: result,
    hasChannelSpecificOverride,
    memberOverwriteCount,
  };
}

export function calculateGuildTree(snapshot: PermissionSnapshot, roleId: RoleId): TreeNodeResult[] {
  const categories = snapshot.channels.filter((c) => c.type === 'category');
  const categoryNodes = categories.map((category) => ({
    ...calculateChannelPermissions(snapshot, roleId, category.id),
    children: snapshot.channels
      .filter((channel) => channel.parentId === category.id)
      .map((channel) => calculateChannelPermissions(snapshot, roleId, channel.id)),
  }));
  const uncategorized = snapshot.channels.filter((channel) => channel.type !== 'category' && !channel.parentId);
  if (uncategorized.length === 0) return categoryNodes;
  const root = uncategorized[0]!;
  return [
    ...categoryNodes,
    {
      ...calculateChannelPermissions(snapshot, roleId, root.id),
      channel: { ...root, id: '__uncategorized__' as ChannelId, name: 'Uncategorized', type: 'category', overwrites: [] },
      children: uncategorized.map((channel) => calculateChannelPermissions(snapshot, roleId, channel.id)),
    },
  ];
}

function sameOverwriteForRole(a: DiscordChannelSnapshot | undefined, b: DiscordChannelSnapshot, roleId: RoleId): boolean {
  return roleOverwritesEqual(a ? findRoleOverwrite(a.overwrites, roleId) : undefined, findRoleOverwrite(b.overwrites, roleId));
}

function roleOverwriteKey(overwrite: PermissionOverwrite): string {
  return `${overwrite.targetType}:${overwrite.targetId}`;
}

export function diffSnapshots(current: PermissionSnapshot, candidate: PermissionSnapshot): SnapshotDiffOperation[] {
  if (current.guild.id !== candidate.guild.id) throw new Error('Imported snapshot guildId does not match current guild.');
  const operations: SnapshotDiffOperation[] = [];

  for (const nextRole of candidate.roles) {
    const currentRole = current.roles.find((role) => role.id === nextRole.id);
    if (!currentRole) throw new Error(`Unknown role in import: ${nextRole.id}`);
    if (sorted(currentRole.permissions).join('\0') !== sorted(nextRole.permissions).join('\0')) {
      operations.push({
        kind: 'set-role-permissions',
        targetId: nextRole.id,
        before: currentRole.permissions,
        after: nextRole.permissions,
        warnings: [
          ...(nextRole.id === current.guild.everyoneRoleId ? ['Changing @everyone requires reinforced confirmation.'] : []),
          ...(currentRole.permissions.includes('Administrator') !== nextRole.permissions.includes('Administrator') ? ['Changing Administrator requires reinforced confirmation.'] : []),
        ],
      });
    }
  }

  for (const nextChannel of candidate.channels) {
    const currentChannel = current.channels.find((channel) => channel.id === nextChannel.id);
    if (!currentChannel) throw new Error(`Unknown channel in import: ${nextChannel.id}`);
    const currentRoleOverwrites = new Map(currentChannel.overwrites.filter((o) => o.targetType === 'role').map((o) => [roleOverwriteKey(o), o]));
    const nextRoleOverwrites = new Map(nextChannel.overwrites.filter((o) => o.targetType === 'role').map((o) => [roleOverwriteKey(o), o]));
    for (const [key, nextOverwrite] of nextRoleOverwrites) {
      const before = currentRoleOverwrites.get(key);
      if (!roleOverwritesEqual(before, nextOverwrite)) {
        operations.push({
          kind: 'set-role-channel-overwrite',
          targetId: `${nextChannel.id}:${key}`,
          before,
          after: nextOverwrite,
          warnings: nextOverwrite.targetId === current.guild.everyoneRoleId ? ['Changing @everyone overwrite requires reinforced confirmation.'] : [],
        });
      }
    }
    for (const [key, before] of currentRoleOverwrites) {
      if (!nextRoleOverwrites.has(key)) {
        operations.push({ kind: 'delete-role-channel-overwrite', targetId: `${nextChannel.id}:${key}`, before, after: null, warnings: before.targetId === current.guild.everyoneRoleId ? ['Deleting @everyone overwrite requires reinforced confirmation.'] : [] });
      }
    }
  }
  return operations;
}

export function auditSnapshot(snapshot: PermissionSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const nonAdminRoles = snapshot.roles.filter((role) => !hasPermission(role.permissions, 'Administrator'));
  for (const role of snapshot.roles) {
    if (hasPermission(role.permissions, 'Administrator')) {
      findings.push({ severity: 'Warning', title: 'Administrator role', description: `${role.name} bypasses channel restrictions.`, roleId: role.id });
    }
  }
  for (const channel of snapshot.channels) {
    if (channel.type === 'category') continue;
    const category = channel.parentId ? snapshot.channels.find((c) => c.id === channel.parentId) : undefined;
    const memberCount = channel.overwrites.filter((o) => o.targetType === 'member').length;
    if (memberCount > 0) {
      findings.push({ severity: 'Warning', title: 'Member overwrite exception', description: `${channel.name} has ${memberCount} read-only member overwrite exception(s).`, channelId: channel.id });
    }
    if (channel.overwrites.length > 6) {
      findings.push({ severity: 'Info', title: 'Many overwrites', description: `${channel.name} has many permission overwrites.`, channelId: channel.id });
    }
    if (category && !sameOverwriteForRole(category, channel, snapshot.guild.everyoneRoleId)) {
      findings.push({ severity: 'Info', title: 'Channel-specific @everyone overwrite', description: `${channel.name} differs from its category for @everyone.`, channelId: channel.id });
    }
    const everyone = calculateChannelPermissions(snapshot, snapshot.guild.everyoneRoleId, channel.id);
    if (everyone.permissions.ViewChannel?.allowed && !everyone.permissions.SendMessages?.allowed) {
      findings.push({ severity: 'Info', title: '@everyone visible read-only', description: `${channel.name} is visible to @everyone but not writable.`, channelId: channel.id });
    }
    const visibleToNonAdmin = nonAdminRoles.some((role) => calculateChannelPermissions(snapshot, role.id, channel.id).permissions.ViewChannel?.allowed);
    if (!visibleToNonAdmin) {
      findings.push({ severity: 'Critical', title: 'No non-admin access', description: `${channel.name} is hidden from every non-admin role in this snapshot.`, channelId: channel.id });
    }
  }
  return findings;
}
