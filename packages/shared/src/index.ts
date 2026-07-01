import { z } from 'zod';

export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type GuildId = Brand<string, 'GuildId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type ChannelId = Brand<string, 'ChannelId'>;
export type UserId = Brand<string, 'UserId'>;

export const basePermissions = [
  'ViewChannel',
  'SendMessages',
  'ReadMessageHistory',
  'AddReactions',
  'CreatePublicThreads',
  'CreatePrivateThreads',
  'SendMessagesInThreads',
  'Connect',
  'Speak',
  'ManageMessages',
  'ManageThreads',
  'MentionEveryone',
  'ManageChannels',
  'Administrator',
] as const;

export type PermissionName = (typeof basePermissions)[number] | string;
export type ChannelType = 'category' | 'text' | 'voice';
export type OverwriteTargetType = 'role' | 'member';

export interface PermissionOverwrite {
  targetType: OverwriteTargetType;
  targetId: RoleId | UserId;
  allow: PermissionName[];
  deny: PermissionName[];
}

export interface DiscordRoleSnapshot {
  id: RoleId;
  name: string;
  color?: string;
  position: number;
  managed: boolean;
  permissions: PermissionName[];
}

export interface DiscordChannelSnapshot {
  id: ChannelId;
  name: string;
  type: ChannelType;
  parentId?: ChannelId;
  overwrites: PermissionOverwrite[];
}

export interface PermissionSnapshot {
  schemaVersion: '1.0.0';
  exportedAt: string;
  guild: {
    id: GuildId;
    name: string;
    everyoneRoleId: RoleId;
  };
  roles: DiscordRoleSnapshot[];
  channels: DiscordChannelSnapshot[];
  metadata?: Record<string, unknown>;
}

export const discordPermissionBits: Record<string, bigint> = {
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  AddReactions: 1n << 6n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  ManageMessages: 1n << 13n,
  ReadMessageHistory: 1n << 16n,
  MentionEveryone: 1n << 17n,
  Connect: 1n << 20n,
  Speak: 1n << 21n,
  ManageThreads: 1n << 34n,
  CreatePublicThreads: 1n << 35n,
  CreatePrivateThreads: 1n << 36n,
  SendMessagesInThreads: 1n << 38n,
};

export function permissionsFromBitfield(bitfield: bigint | string | number): PermissionName[] {
  const bits = BigInt(bitfield);
  return Object.entries(discordPermissionBits)
    .filter(([, bit]) => (bits & bit) === bit)
    .map(([name]) => name);
}

export function permissionsToBitfield(permissions: PermissionName[]): string {
  return permissions
    .reduce((bits, permission) => bits | (discordPermissionBits[permission] ?? 0n), 0n)
    .toString();
}

export const permissionNameSchema = z.string().min(1);

export const permissionOverwriteSchema = z.object({
  targetType: z.enum(['role', 'member']),
  targetId: z.string().min(1),
  allow: z.array(permissionNameSchema),
  deny: z.array(permissionNameSchema),
});

export const roleSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  position: z.number().int(),
  managed: z.boolean(),
  permissions: z.array(permissionNameSchema),
});

export const channelSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['category', 'text', 'voice']),
  parentId: z.string().optional(),
  overwrites: z.array(permissionOverwriteSchema),
});

export const permissionSnapshotSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  exportedAt: z.string().datetime(),
  guild: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    everyoneRoleId: z.string().min(1),
  }),
  roles: z.array(roleSnapshotSchema),
  channels: z.array(channelSnapshotSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
