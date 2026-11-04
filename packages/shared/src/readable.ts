import { z } from 'zod';
import {
  channelKind,
  isThread,
  type DiscordChannelSnapshot,
  type PermissionOverwrite,
  type PermissionSnapshot,
} from './index';
import {
  KNOWN_BITS,
  fromBits,
  permissionBits,
  toBits,
  type Bitfield,
  type PermissionName,
} from './permissions';

/**
 * A human/LLM-editable view of a snapshot: categories contain their channels, and
 * roles, overwrite targets and permissions are names instead of IDs and bitfields.
 *
 * It is never applied directly. `fromReadable` turns an edited file back into a full
 * snapshot on top of the current one, and that goes through the normal import
 * validation, plan review and confirmation. Permission bits this build does not know
 * by name are carried over from the current snapshot, so the round trip is lossless.
 */
export const READABLE_FORMAT = 'd-view-readable';
export const READABLE_FORMAT_VERSION = 1;

const EVERYONE = '@everyone';

export interface ReadableOverwrite {
  role?: string;
  member?: string;
  allow: PermissionName[];
  deny: PermissionName[];
}

export interface ReadableChannel {
  id: string;
  name: string;
  type: string;
  syncedWithCategory?: boolean;
  overwrites?: ReadableOverwrite[];
  channels?: ReadableChannel[];
}

export interface ReadablePermissionMap {
  format: typeof READABLE_FORMAT;
  formatVersion: typeof READABLE_FORMAT_VERSION;
  howToEdit: string[];
  guild: { id: string; name: string };
  validPermissions: PermissionName[];
  roles: {
    id: string;
    name: string;
    position: number;
    managed: boolean;
    permissions: PermissionName[];
  }[];
  channels: ReadableChannel[];
}

const HOW_TO_EDIT = [
  'This file mirrors the server: roles (highest first) and categories with the channels inside them.',
  'To change permissions, edit the "permissions" list of a role, or the "allow"/"deny" lists of a channel or category overwrite.',
  'Use only names from "validPermissions". A permission may not be in both allow and deny; anything in neither list is inherited (neutral).',
  'Overwrites target a role by name ("@everyone" is the default role) or a member by ID. Add or remove overwrite entries freely.',
  'A channel with "syncedWithCategory": true copies its category overwrites. Set it to false and give it its own "overwrites" to make it behave differently.',
  'Do not change any "id". Renaming, moving, creating or deleting roles and channels is ignored or rejected: only permissions are imported.',
  'Roles or channels you remove from this file are left unchanged. Import the edited file in D-View: it shows every change for review before anything is applied.',
];

const permissionNames = Object.keys(permissionBits) as PermissionName[];

function namesOf(bits: Bitfield): PermissionName[] {
  return permissionNames.filter((name) => (bits & permissionBits[name]) !== 0n);
}

function sameOverwrites(
  a: PermissionOverwrite[],
  b: PermissionOverwrite[],
): boolean {
  const key = (o: PermissionOverwrite) =>
    `${o.targetType}:${o.targetId}:${o.allow}:${o.deny}`;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  );
}

export function toReadable(
  snapshot: PermissionSnapshot,
): ReadablePermissionMap {
  const roleName = new Map(
    snapshot.roles.map((role) => [
      role.id,
      role.id === snapshot.guild.id ? EVERYONE : role.name,
    ]),
  );
  const overwrites = (list: PermissionOverwrite[]): ReadableOverwrite[] =>
    list.map((o) => ({
      ...(o.targetType === 'role'
        ? { role: roleName.get(o.targetId) ?? o.targetId }
        : { member: o.targetId }),
      allow: namesOf(toBits(o.allow)),
      deny: namesOf(toBits(o.deny)),
    }));
  const byPosition = (a: DiscordChannelSnapshot, b: DiscordChannelSnapshot) =>
    a.position - b.position;
  const visible = snapshot.channels
    .filter((channel) => !isThread(channel.type))
    .sort(byPosition);
  const categories = new Map(
    visible
      .filter((c) => channelKind(c.type) === 'category')
      .map((c) => [c.id, c]),
  );

  const leaf = (channel: DiscordChannelSnapshot): ReadableChannel => {
    const parent = channel.parentId
      ? categories.get(channel.parentId)
      : undefined;
    const synced =
      parent !== undefined &&
      sameOverwrites(parent.overwrites, channel.overwrites);
    return {
      id: channel.id,
      name: channel.name,
      type: channelKind(channel.type),
      ...(parent ? { syncedWithCategory: synced } : {}),
      ...(synced ? {} : { overwrites: overwrites(channel.overwrites) }),
    };
  };

  const tree: ReadableChannel[] = [
    ...visible
      .filter(
        (c) =>
          !categories.has(c.id) && !(c.parentId && categories.has(c.parentId)),
      )
      .map(leaf),
    ...[...categories.values()].map((category) => ({
      id: category.id,
      name: category.name,
      type: 'category',
      overwrites: overwrites(category.overwrites),
      channels: visible.filter((c) => c.parentId === category.id).map(leaf),
    })),
  ];

  return {
    format: READABLE_FORMAT,
    formatVersion: READABLE_FORMAT_VERSION,
    howToEdit: HOW_TO_EDIT,
    guild: { id: snapshot.guild.id, name: snapshot.guild.name },
    validPermissions: permissionNames,
    roles: [...snapshot.roles]
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.id === snapshot.guild.id ? EVERYONE : role.name,
        position: role.position,
        managed: role.managed,
        permissions: namesOf(toBits(role.permissions)),
      })),
    channels: tree,
  };
}

const names = z.array(z.string()).max(64);
const readableOverwriteSchema = z.object({
  role: z.string().optional(),
  member: z.string().optional(),
  allow: names.default([]),
  deny: names.default([]),
});
type ParsedOverwrite = z.infer<typeof readableOverwriteSchema>;
interface ParsedChannel {
  id: string;
  syncedWithCategory?: boolean | undefined;
  overwrites?: ParsedOverwrite[] | undefined;
  channels?: ParsedChannel[] | undefined;
}
const readableChannelSchema: z.ZodType<ParsedChannel> = z.lazy(() =>
  z.object({
    id: z.string(),
    syncedWithCategory: z.boolean().optional(),
    overwrites: z.array(readableOverwriteSchema).max(1000).optional(),
    channels: z.array(readableChannelSchema).max(1000).optional(),
  }),
);
const readableSchema = z.object({
  format: z.literal(READABLE_FORMAT),
  formatVersion: z.literal(READABLE_FORMAT_VERSION),
  guild: z.object({ id: z.string() }),
  roles: z
    .array(z.object({ id: z.string(), permissions: names }))
    .max(250)
    .default([]),
  channels: z.array(readableChannelSchema).max(1000).default([]),
});

export function isReadableMap(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { format?: unknown }).format === READABLE_FORMAT
  );
}

/**
 * Applies an edited readable file on top of `base` and returns the resulting full
 * snapshot. Throws an Error whose message explains the first problem found.
 */
export function fromReadable(
  data: unknown,
  base: PermissionSnapshot,
): PermissionSnapshot {
  const parsed = readableSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new Error(
      `Readable file is malformed at "${issue.path.join('.')}": ${issue.message}`,
    );
  }
  const file = parsed.data;
  if (file.guild.id !== base.guild.id)
    throw new Error('This file belongs to a different server.');

  const unknownNames = new Set<string>();
  const bitsOf = (list: string[]): Bitfield =>
    list.reduce((all, name) => {
      const bit = permissionBits[name as PermissionName];
      if (bit === undefined) unknownNames.add(name);
      return all | (bit ?? 0n);
    }, 0n);
  // Bits this build cannot name are kept exactly as they are live.
  const keepUnknown = (known: Bitfield, live: string | undefined) =>
    known | (toBits(live) & ~KNOWN_BITS);

  const rolesById = new Map(base.roles.map((role) => [role.id, role]));
  const rolesByName = new Map<string, string[]>();
  for (const role of base.roles) {
    const key = role.id === base.guild.id ? EVERYONE : role.name;
    rolesByName.set(key, [...(rolesByName.get(key) ?? []), role.id]);
  }
  const roles = new Map(base.roles.map((role) => [role.id, { ...role }]));
  for (const edited of file.roles) {
    const role = roles.get(edited.id);
    if (!role)
      throw new Error(
        `Unknown role id ${edited.id}: roles cannot be created by import.`,
      );
    role.permissions = fromBits(
      keepUnknown(
        bitsOf(edited.permissions),
        rolesById.get(edited.id)!.permissions,
      ),
    );
  }

  const channelsById = new Map(
    base.channels.map((channel) => [channel.id, channel]),
  );
  const channels = new Map(
    base.channels.map((channel) => [channel.id, { ...channel }]),
  );

  const resolveOverwrites = (
    channelId: string,
    list: ParsedOverwrite[],
  ): PermissionOverwrite[] => {
    const live = new Map(
      channelsById.get(channelId)!.overwrites.map((o) => [o.targetId, o]),
    );
    return list.map((entry) => {
      let targetType: 'role' | 'member';
      let targetId: string;
      if (entry.role !== undefined && entry.member === undefined) {
        const matches =
          rolesByName.get(entry.role) ??
          (rolesById.has(entry.role) ? [entry.role] : []);
        if (matches.length !== 1) {
          throw new Error(
            matches.length
              ? `Role name "${entry.role}" is ambiguous; use its id instead.`
              : `Unknown role "${entry.role}".`,
          );
        }
        [targetType, targetId] = ['role', matches[0]!];
      } else if (
        entry.member !== undefined &&
        entry.role === undefined &&
        /^\d{1,20}$/.test(entry.member)
      ) {
        [targetType, targetId] = ['member', entry.member];
      } else {
        throw new Error(
          `Each overwrite in channel ${channelId} needs exactly one "role" name or "member" id.`,
        );
      }
      const previous = live.get(targetId);
      const allow = keepUnknown(bitsOf(entry.allow), previous?.allow);
      const deny = keepUnknown(bitsOf(entry.deny), previous?.deny);
      if ((allow & deny) !== 0n)
        throw new Error(
          `Channel ${channelId}: a permission is both allowed and denied.`,
        );
      return {
        targetType,
        targetId,
        allow: fromBits(allow),
        deny: fromBits(deny),
      };
    });
  };

  const apply = (
    node: ParsedChannel,
    categoryOverwrites?: PermissionOverwrite[],
  ) => {
    const channel = channels.get(node.id);
    if (!channel)
      throw new Error(
        `Unknown channel id ${node.id}: channels cannot be created by import.`,
      );
    let own: PermissionOverwrite[] | undefined;
    if (node.syncedWithCategory === true) {
      const parent = channel.parentId
        ? channels.get(channel.parentId)
        : undefined;
      own = categoryOverwrites ?? parent?.overwrites;
    } else if (node.overwrites) {
      own = resolveOverwrites(node.id, node.overwrites);
    }
    if (own) channel.overwrites = own;
    for (const child of node.channels ?? [])
      apply(child, own ?? channel.overwrites);
  };
  for (const node of file.channels) apply(node);

  if (unknownNames.size) {
    throw new Error(
      `Unknown permission names: ${[...unknownNames].join(', ')}. Use only names from "validPermissions".`,
    );
  }
  return {
    ...base,
    exportedAt: new Date().toISOString(),
    roles: [...roles.values()],
    channels: [...channels.values()],
  };
}
