import { z } from 'zod';

export * from './permissions';

/**
 * Discord channel type numbers we care about, kept raw in the snapshot.
 *
 * The previous sync mapped a handful of numbers to three names and returned `[]`
 * for everything else, so forum, stage, media and thread channels vanished from
 * the snapshot entirely — and the audit then reported those servers as clean.
 * Unrecognised types are now preserved and surfaced as 'unsupported' instead.
 */
export const channelTypeNumbers = {
  text: 0,
  voice: 2,
  category: 4,
  announcement: 5,
  announcementThread: 10,
  publicThread: 11,
  privateThread: 12,
  stage: 13,
  directory: 14,
  forum: 15,
  media: 16,
} as const;

export type ChannelKind =
  | 'category'
  | 'text'
  | 'announcement'
  | 'voice'
  | 'stage'
  | 'forum'
  | 'media'
  | 'thread'
  | 'unsupported';

export function channelKind(type: number): ChannelKind {
  switch (type) {
    case channelTypeNumbers.category:
      return 'category';
    case channelTypeNumbers.text:
      return 'text';
    case channelTypeNumbers.announcement:
      return 'announcement';
    case channelTypeNumbers.voice:
      return 'voice';
    case channelTypeNumbers.stage:
      return 'stage';
    case channelTypeNumbers.forum:
      return 'forum';
    case channelTypeNumbers.media:
      return 'media';
    case channelTypeNumbers.announcementThread:
    case channelTypeNumbers.publicThread:
    case channelTypeNumbers.privateThread:
      return 'thread';
    default:
      return 'unsupported';
  }
}

/** Threads have no overwrites of their own; they resolve against their parent channel. */
export function isThread(type: number): boolean {
  return (
    type === channelTypeNumbers.announcementThread ||
    type === channelTypeNumbers.publicThread ||
    type === channelTypeNumbers.privateThread
  );
}

export type OverwriteTargetType = 'role' | 'member';

export interface PermissionOverwrite {
  targetType: OverwriteTargetType;
  targetId: string;
  allow: string;
  deny: string;
}

export interface DiscordRoleSnapshot {
  id: string;
  name: string;
  color?: string;
  position: number;
  managed: boolean;
  permissions: string;
}

export interface DiscordChannelSnapshot {
  id: string;
  name: string;
  type: number;
  parentId?: string;
  position: number;
  overwrites: PermissionOverwrite[];
}

export interface PermissionSnapshot {
  schemaVersion: '2.0.0';
  exportedAt: string;
  guild: {
    id: string;
    name: string;
    ownerId: string;
    everyoneRoleId: string;
  };
  roles: DiscordRoleSnapshot[];
  channels: DiscordChannelSnapshot[];
  metadata?: Record<string, unknown>;
}

export const SNAPSHOT_SCHEMA_VERSION = '2.0.0';

/**
 * Permissions travel as decimal strings — Discord's own wire format.
 *
 * There is deliberately no enum of permission names here. A name enum cannot
 * represent a permission Discord ships after this build, so every export/import
 * round trip through one silently drops the permissions it does not recognise.
 */
export const permissionBitsSchema = z.string().regex(/^\d+$/, 'Expected a decimal permission bitfield');

export const permissionOverwriteSchema = z.object({
  targetType: z.enum(['role', 'member']),
  targetId: z.string().min(1),
  allow: permissionBitsSchema,
  deny: permissionBitsSchema,
});

export const roleSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  position: z.number().int(),
  managed: z.boolean(),
  permissions: permissionBitsSchema,
});

export const channelSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.number().int(),
  parentId: z.string().optional(),
  position: z.number().int(),
  overwrites: z.array(permissionOverwriteSchema),
});

export const permissionSnapshotSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  exportedAt: z.iso.datetime(),
  guild: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    ownerId: z.string().min(1),
    everyoneRoleId: z.string().min(1),
  }),
  roles: z.array(roleSnapshotSchema),
  channels: z.array(channelSnapshotSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Snapshots written before the bitfield migration are not upgradable: they stored
 * permission *names*, and the name table they were written against had already
 * dropped every permission it did not know. Reconstructing bits from them would
 * reintroduce that loss at the exact point it does the most damage, so they are
 * rejected and the guild is re-synced instead.
 */
export function snapshotVersionOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const version = (data as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'string' ? version : null;
}

export function isCurrentSnapshot(data: unknown): boolean {
  return snapshotVersionOf(data) === SNAPSHOT_SCHEMA_VERSION;
}
