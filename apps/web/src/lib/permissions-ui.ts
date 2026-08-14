import {
  CONNECT,
  SEND_MESSAGES,
  SPEAK,
  VIEW_CHANNEL,
  permissionBits,
  permissionGroups,
  permissionLabel,
  type Bitfield,
  type ChannelKind,
  type PermissionGroup,
} from '@dpd/shared';
import type { Dict } from './i18n';

export const groupOrder: PermissionGroup[] = [
  'general',
  'text',
  'threads',
  'voice',
  'stage',
  'events',
  'membership',
  'server',
];

export const groupLabels: Record<PermissionGroup, keyof Dict['explorer'] | string> = {
  general: 'General',
  text: 'Text',
  threads: 'Threads',
  voice: 'Voice',
  stage: 'Stage',
  events: 'Events',
  membership: 'Membership',
  server: 'Server',
};

export interface PermissionRow {
  bit: Bitfield;
  label: string;
}

export function permissionRows(group: PermissionGroup): PermissionRow[] {
  return permissionGroups[group].map((name) => ({
    bit: permissionBits[name],
    label: permissionLabel(permissionBits[name]),
  }));
}

/** Which groups make sense for a channel type, so a voice channel stops showing thread permissions. */
export function groupsForKind(kind: ChannelKind): PermissionGroup[] {
  switch (kind) {
    case 'voice':
      return ['general', 'voice', 'text', 'events'];
    case 'stage':
      return ['general', 'voice', 'stage', 'events'];
    case 'forum':
    case 'media':
      return ['general', 'text', 'threads'];
    case 'category':
      return groupOrder;
    default:
      return ['general', 'text', 'threads'];
  }
}

export type TriState = 'allow' | 'deny' | 'inherit';

export function overwriteState(allow: Bitfield, deny: Bitfield, bit: Bitfield): TriState {
  if ((allow & bit) === bit) return 'allow';
  if ((deny & bit) === bit) return 'deny';
  return 'inherit';
}

export interface Verdict {
  key: string;
  tone: 'allow' | 'deny' | 'warning';
}

/**
 * The plain-language summary shown above the permission list, so the answer to
 * "can this role see and use this channel" does not require reading fifty rows.
 */
export function verdicts(raw: Bitfield, kind: ChannelKind): Verdict[] {
  const can = (bit: Bitfield) => (raw & bit) === bit;
  const visible = can(VIEW_CHANNEL);
  const out: Verdict[] = [
    visible
      ? { key: 'verdictVisible', tone: 'allow' }
      : { key: 'verdictHidden', tone: 'deny' },
  ];
  if (!visible) return out;

  if (kind === 'voice' || kind === 'stage') {
    if (!can(CONNECT)) out.push({ key: 'verdictNoVoice', tone: 'deny' });
    else if (can(SPEAK)) out.push({ key: 'verdictVoice', tone: 'allow' });
    else out.push({ key: 'verdictVoiceListen', tone: 'warning' });
    return out;
  }

  out.push(
    can(SEND_MESSAGES)
      ? { key: 'verdictCanWrite', tone: 'allow' }
      : { key: 'verdictReadOnly', tone: 'warning' },
  );
  return out;
}
