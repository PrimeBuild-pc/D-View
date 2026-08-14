/**
 * Discord permission bits.
 *
 * Verified against https://docs.discord.com/developers/topics/permissions.
 * Bit 47 is a documented gap (a retired permission) and is deliberately absent.
 *
 * IMPORTANT: this table is for DISPLAY ONLY. Nothing on the write path may depend
 * on it being complete. Discord adds bits over time, and the previous design —
 * mapping permission names to bits and rebuilding a bitfield from the names it
 * recognised — silently dropped every unmapped permission from live roles. Writes
 * now use masked intents (see `applyMask`) so unknown bits are preserved untouched.
 */

export type Bitfield = bigint;

/** A Discord permission bitfield in its wire format: a decimal string. */
export type PermissionBits = string;

export const permissionBits = {
  CreateInstantInvite: 1n << 0n,
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  PrioritySpeaker: 1n << 8n,
  Stream: 1n << 9n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  SendTTSMessages: 1n << 12n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  MentionEveryone: 1n << 17n,
  UseExternalEmojis: 1n << 18n,
  ViewGuildInsights: 1n << 19n,
  Connect: 1n << 20n,
  Speak: 1n << 21n,
  MuteMembers: 1n << 22n,
  DeafenMembers: 1n << 23n,
  MoveMembers: 1n << 24n,
  UseVAD: 1n << 25n,
  ChangeNickname: 1n << 26n,
  ManageNicknames: 1n << 27n,
  ManageRoles: 1n << 28n,
  ManageWebhooks: 1n << 29n,
  ManageGuildExpressions: 1n << 30n,
  UseApplicationCommands: 1n << 31n,
  RequestToSpeak: 1n << 32n,
  ManageEvents: 1n << 33n,
  ManageThreads: 1n << 34n,
  CreatePublicThreads: 1n << 35n,
  CreatePrivateThreads: 1n << 36n,
  UseExternalStickers: 1n << 37n,
  SendMessagesInThreads: 1n << 38n,
  UseEmbeddedActivities: 1n << 39n,
  ModerateMembers: 1n << 40n,
  ViewCreatorMonetizationAnalytics: 1n << 41n,
  UseSoundboard: 1n << 42n,
  CreateGuildExpressions: 1n << 43n,
  CreateEvents: 1n << 44n,
  UseExternalSounds: 1n << 45n,
  SendVoiceMessages: 1n << 46n,
  // 1n << 47n is a retired permission and has no name.
  SetVoiceChannelStatus: 1n << 48n,
  SendPolls: 1n << 49n,
  UseExternalApps: 1n << 50n,
  PinMessages: 1n << 51n,
  BypassSlowmode: 1n << 52n,
} as const;

export type PermissionName = keyof typeof permissionBits;

export const ADMINISTRATOR = permissionBits.Administrator;
export const VIEW_CHANNEL = permissionBits.ViewChannel;
export const MANAGE_ROLES = permissionBits.ManageRoles;
export const MANAGE_GUILD = permissionBits.ManageGuild;
export const SEND_MESSAGES = permissionBits.SendMessages;
export const CONNECT = permissionBits.Connect;
export const SPEAK = permissionBits.Speak;

export const NO_BITS: Bitfield = 0n;

/**
 * Every bit this build knows about. Used as the "all permissions" value for owner
 * and Administrator short-circuits.
 *
 * Never use `~0n` for that: a two's-complement-infinite bigint reaching a diff or a
 * PATCH body sends garbage bits to Discord.
 */
export const KNOWN_BITS: Bitfield = Object.values(permissionBits).reduce((all, bit) => all | bit, 0n);

/**
 * Permissions that only mean anything at guild scope — the docs mark these as
 * applying to no channel type. They cannot be granted or denied by a channel
 * overwrite, so denying ViewChannel does not suppress them.
 */
export const GUILD_SCOPED: Bitfield = [
  permissionBits.KickMembers,
  permissionBits.BanMembers,
  permissionBits.Administrator,
  permissionBits.ManageGuild,
  permissionBits.ViewAuditLog,
  permissionBits.ViewGuildInsights,
  permissionBits.ChangeNickname,
  permissionBits.ManageNicknames,
  permissionBits.ManageGuildExpressions,
  permissionBits.ModerateMembers,
  permissionBits.ViewCreatorMonetizationAnalytics,
  permissionBits.CreateGuildExpressions,
].reduce((all, bit) => all | bit, 0n);

/**
 * Anything not guild-scoped is channel-scoped. Deriving it this way means a bit
 * Discord adds after this build ships is treated as channel-scoped, which is the
 * conservative direction: it gets suppressed along with a ViewChannel denial
 * rather than being reported as granted in a channel the subject cannot see.
 */
export const CHANNEL_SCOPED: Bitfield = KNOWN_BITS & ~GUILD_SCOPED;

/** UI grouping. Display concern only — never load-bearing for calculation. */
export const permissionGroups = {
  general: ['ViewChannel', 'CreateInstantInvite', 'ManageChannels', 'ManageRoles', 'ManageWebhooks'],
  membership: ['KickMembers', 'BanMembers', 'ModerateMembers', 'ChangeNickname', 'ManageNicknames'],
  server: [
    'Administrator',
    'ManageGuild',
    'ViewAuditLog',
    'ViewGuildInsights',
    'ManageGuildExpressions',
    'CreateGuildExpressions',
    'ViewCreatorMonetizationAnalytics',
  ],
  text: [
    'SendMessages',
    'SendTTSMessages',
    'ManageMessages',
    'EmbedLinks',
    'AttachFiles',
    'ReadMessageHistory',
    'MentionEveryone',
    'AddReactions',
    'UseExternalEmojis',
    'UseExternalStickers',
    'UseApplicationCommands',
    'SendVoiceMessages',
    'SendPolls',
    'UseExternalApps',
    'PinMessages',
    'BypassSlowmode',
  ],
  threads: ['ManageThreads', 'CreatePublicThreads', 'CreatePrivateThreads', 'SendMessagesInThreads'],
  voice: [
    'Connect',
    'Speak',
    'Stream',
    'UseVAD',
    'PrioritySpeaker',
    'MuteMembers',
    'DeafenMembers',
    'MoveMembers',
    'UseSoundboard',
    'UseExternalSounds',
    'UseEmbeddedActivities',
    'SetVoiceChannelStatus',
  ],
  stage: ['RequestToSpeak'],
  events: ['ManageEvents', 'CreateEvents'],
} as const satisfies Record<string, readonly PermissionName[]>;

export type PermissionGroup = keyof typeof permissionGroups;

const labelByBit = new Map<Bitfield, PermissionName>(
  Object.entries(permissionBits).map(([name, bit]) => [bit, name as PermissionName]),
);

/** Enumerate the individual bits set in a bitfield, including ones we have no name for. */
export function splitBits(value: Bitfield): Bitfield[] {
  const bits: Bitfield[] = [];
  for (let index = 0n; value >> index > 0n; index += 1n) {
    const bit = 1n << index;
    if ((value & bit) === bit) bits.push(bit);
  }
  return bits;
}

/**
 * Human label for a single bit. Unmapped bits render as `Unknown (1 << n)` rather
 * than disappearing, so drift against Discord becomes visible in the UI instead of
 * silent.
 */
export function permissionLabel(bit: Bitfield): string {
  const known = labelByBit.get(bit);
  if (known) return known;
  let index = 0n;
  let probe = bit;
  while (probe > 1n) {
    probe >>= 1n;
    index += 1n;
  }
  return `Unknown (1 << ${index})`;
}

export function bitForName(name: PermissionName): Bitfield {
  return permissionBits[name];
}

export function has(value: Bitfield, bit: Bitfield): boolean {
  return (value & bit) === bit;
}

export function toBits(value: PermissionBits | Bitfield | undefined): Bitfield {
  if (value === undefined) return 0n;
  return typeof value === 'bigint' ? value : BigInt(value);
}

export function fromBits(value: Bitfield): PermissionBits {
  return value.toString();
}

/**
 * A masked intent: the only unit of change D-View ever writes.
 *
 * `touched` is the set of bits this operation is permitted to alter. Everything
 * outside it is carried over from the live value verbatim, which is what keeps
 * permissions Discord invented after the snapshot was taken from being wiped.
 */
export interface PermissionMask {
  touched: Bitfield;
  nextAllow: Bitfield;
  nextDeny: Bitfield;
}

export function applyMask(live: Bitfield, touched: Bitfield, next: Bitfield): Bitfield {
  return (live & ~touched) | (next & touched);
}

/**
 * Last line of defence before any write. Catches every mutation of the
 * permission-stripping bug class, including ones this design did not anticipate.
 */
export function assertOnlyTouched(live: Bitfield, next: Bitfield, touched: Bitfield): void {
  if (((next ^ live) & ~touched) !== 0n) {
    throw new Error(
      `Refusing write: it would alter bits outside the operation's mask (live=${live}, next=${next}, touched=${touched}).`,
    );
  }
}
