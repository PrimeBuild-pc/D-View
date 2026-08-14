import { describe, expect, it } from 'vitest';
import {
  ADMINISTRATOR,
  CHANNEL_SCOPED,
  KNOWN_BITS,
  VIEW_CHANNEL,
  applyMask,
  assertOnlyTouched,
  fromBits,
  permissionBits,
  permissionLabel,
  splitBits,
  toBits,
  type PermissionSnapshot,
} from '@dpd/shared';
import {
  auditSnapshot,
  buildTree,
  channelSyncState,
  computeChannelPermissions,
  decisiveStep,
  diffSnapshots,
  explainChannelPermissions,
  indexSnapshot,
  invertOperations,
  type PermissionSubject,
} from './index';

const GUILD = '1000';
const OWNER = 'owner-user';

const bits = (...names: (keyof typeof permissionBits)[]) =>
  fromBits(names.reduce((all, name) => all | permissionBits[name], 0n));

/**
 * Fixture shaped like real Discord data.
 *
 * The important detail is `staff-chat`: it is *synced* to its category, which on
 * Discord means it carries physical copies of the category's overwrites. The
 * previous fixture gave it an empty overwrite array and still expected category
 * inheritance to hide it — encoding the very bug this engine had.
 */
function snapshot(): PermissionSnapshot {
  const hideFromEveryone = { targetType: 'role' as const, targetId: GUILD, allow: '0', deny: bits('ViewChannel') };
  return {
    schemaVersion: '2.0.0',
    exportedAt: '2026-08-14T00:00:00.000Z',
    guild: { id: GUILD, name: 'Test Guild', ownerId: OWNER, everyoneRoleId: GUILD },
    roles: [
      { id: GUILD, name: '@everyone', position: 0, managed: false, permissions: bits('ViewChannel', 'SendMessages', 'ReadMessageHistory') },
      { id: 'member', name: 'Member', position: 1, managed: false, permissions: bits('AddReactions') },
      { id: 'muted', name: 'Muted', position: 2, managed: false, permissions: '0' },
      { id: 'mod', name: 'Moderator', position: 3, managed: false, permissions: bits('ManageMessages') },
      { id: 'admin', name: 'Admin', position: 4, managed: false, permissions: bits('Administrator') },
    ],
    channels: [
      { id: 'cat-staff', name: 'Staff', type: 4, position: 0, overwrites: [hideFromEveryone] },
      // Synced child: Discord copied the parent's overwrites onto it.
      { id: 'staff-chat', name: 'staff-chat', type: 0, parentId: 'cat-staff', position: 0, overwrites: [hideFromEveryone] },
      // De-synced child: its own array is authoritative and grants nothing, so
      // @everyone can see it even though the category hides everything else.
      { id: 'leaked', name: 'leaked', type: 0, parentId: 'cat-staff', position: 1, overwrites: [] },
      { id: 'general', name: 'general', type: 0, position: 2, overwrites: [] },
      { id: 'voice', name: 'Voice', type: 2, position: 3, overwrites: [] },
    ],
  };
}

const index = () => indexSnapshot(snapshot());
const asRole = (roleId: string): PermissionSubject => ({ kind: 'role', roleId });

describe('bitfields', () => {
  it('round-trips every known bit without loss', () => {
    for (const bit of splitBits(KNOWN_BITS)) {
      expect(toBits(fromBits(bit))).toBe(bit);
    }
    expect(toBits(fromBits(KNOWN_BITS))).toBe(KNOWN_BITS);
  });

  it('preserves bits this build does not know about', () => {
    const future = 1n << 60n;
    expect(toBits(fromBits(future))).toBe(future);
    expect(permissionLabel(future)).toBe('Unknown (1 << 60)');
  });

  it('never uses a negative sentinel for "all permissions"', () => {
    expect(KNOWN_BITS).toBeGreaterThan(0n);
    expect(KNOWN_BITS & ADMINISTRATOR).toBe(ADMINISTRATOR);
  });

  it('applyMask leaves untouched bits alone', () => {
    const live = permissionBits.ManageRoles | permissionBits.KickMembers;
    const touched = permissionBits.SendMessages;
    const next = applyMask(live, touched, permissionBits.SendMessages);
    expect(next & permissionBits.ManageRoles).toBe(permissionBits.ManageRoles);
    expect(next & permissionBits.KickMembers).toBe(permissionBits.KickMembers);
    expect(next & permissionBits.SendMessages).toBe(permissionBits.SendMessages);
  });

  it('assertOnlyTouched rejects a write that would alter untouched bits', () => {
    const live = permissionBits.ManageRoles;
    expect(() => assertOnlyTouched(live, 0n, permissionBits.SendMessages)).toThrow(/outside the operation's mask/);
    expect(() => assertOnlyTouched(live, live | permissionBits.SendMessages, permissionBits.SendMessages)).not.toThrow();
  });
});

describe('base permissions', () => {
  it('includes @everyone, not just the inspected role', () => {
    // Muted has no permissions of its own; it still inherits @everyone's.
    const result = computeChannelPermissions(index(), 'general', asRole('muted'));
    expect(result & VIEW_CHANNEL).toBe(VIEW_CHANNEL);
    expect(result & permissionBits.SendMessages).toBe(permissionBits.SendMessages);
  });

  it('unions the subject role on top of @everyone', () => {
    const result = computeChannelPermissions(index(), 'general', asRole('member'));
    expect(result & permissionBits.AddReactions).toBe(permissionBits.AddReactions);
    expect(result & permissionBits.ReadMessageHistory).toBe(permissionBits.ReadMessageHistory);
  });
});

describe('category is not consulted at read time', () => {
  it('hides a synced child, because the overwrite was copied onto it', () => {
    const result = computeChannelPermissions(index(), 'staff-chat', asRole('member'));
    expect(result & VIEW_CHANNEL).toBe(0n);
  });

  it('does NOT hide a de-synced child whose own overwrites grant access', () => {
    // The old engine applied the category as an inheritance layer and reported
    // this channel as hidden. Discord shows it.
    const result = computeChannelPermissions(index(), 'leaked', asRole('member'));
    expect(result & VIEW_CHANNEL).toBe(VIEW_CHANNEL);
  });
});

describe('overwrite ordering', () => {
  it('applies the union of denies before the union of allows', () => {
    const data = snapshot();
    data.channels.push({
      id: 'contested',
      name: 'contested',
      type: 0,
      position: 9,
      overwrites: [
        { targetType: 'role', targetId: 'member', allow: '0', deny: bits('SendMessages') },
        { targetType: 'role', targetId: 'mod', allow: bits('SendMessages'), deny: '0' },
      ],
    });
    const subject: PermissionSubject = { kind: 'member', userId: 'u', roleIds: ['member', 'mod'], isOwner: false };
    const result = computeChannelPermissions(indexSnapshot(data), 'contested', subject);
    // Allow-union is applied last, so the grant wins over the other role's deny.
    expect(result & permissionBits.SendMessages).toBe(permissionBits.SendMessages);
  });

  it('does not let an @everyone overwrite allow leak into the role allow-union', () => {
    const data = snapshot();
    data.channels.push({
      id: 'trap',
      name: 'trap',
      type: 0,
      position: 9,
      overwrites: [
        { targetType: 'role', targetId: GUILD, allow: bits('MentionEveryone'), deny: '0' },
        { targetType: 'role', targetId: 'member', allow: '0', deny: bits('MentionEveryone') },
      ],
    });
    const subject: PermissionSubject = { kind: 'member', userId: 'u', roleIds: [GUILD, 'member'], isOwner: false };
    const result = computeChannelPermissions(indexSnapshot(data), 'trap', subject);
    // @everyone's allow lands at step 4 and the role deny clears it at step 6.
    // If @everyone were also treated as one of the subject's roles, its allow
    // would rejoin the union at step 7 and wrongly win.
    expect(result & permissionBits.MentionEveryone).toBe(0n);
  });
});

describe('bypasses', () => {
  it('grants everything to the guild owner', () => {
    const subject: PermissionSubject = { kind: 'member', userId: OWNER, roleIds: [], isOwner: true };
    expect(computeChannelPermissions(index(), 'staff-chat', subject)).toBe(KNOWN_BITS);
  });

  it('grants everything to Administrator regardless of channel overwrites', () => {
    expect(computeChannelPermissions(index(), 'staff-chat', asRole('admin'))).toBe(KNOWN_BITS);
  });
});

describe('member overwrites', () => {
  it('applies a member overwrite last, overriding role denies', () => {
    const data = snapshot();
    data.channels[1]!.overwrites.push({
      targetType: 'member',
      targetId: 'guest',
      allow: bits('ViewChannel'),
      deny: '0',
    });
    const subject: PermissionSubject = { kind: 'member', userId: 'guest', roleIds: ['member'], isOwner: false };
    const result = computeChannelPermissions(indexSnapshot(data), 'staff-chat', subject);
    expect(result & VIEW_CHANNEL).toBe(VIEW_CHANNEL);
  });

  it('ignores member overwrites in the role-centric view', () => {
    const data = snapshot();
    data.channels[1]!.overwrites.push({
      targetType: 'member',
      targetId: 'guest',
      allow: bits('ViewChannel'),
      deny: '0',
    });
    const result = computeChannelPermissions(indexSnapshot(data), 'staff-chat', asRole('member'));
    expect(result & VIEW_CHANNEL).toBe(0n);
  });
});

describe('implicit ViewChannel denial', () => {
  it('suppresses channel permissions in effective but not in raw', () => {
    const result = explainChannelPermissions(index(), 'staff-chat', asRole('member'));
    expect(result.raw & permissionBits.SendMessages).toBe(permissionBits.SendMessages);
    expect(result.effective & permissionBits.SendMessages).toBe(0n);
    expect(result.effective & CHANNEL_SCOPED).toBe(0n);
  });

  it('leaves guild-scoped permissions intact', () => {
    const data = snapshot();
    data.roles[1]!.permissions = bits('AddReactions', 'KickMembers');
    const result = explainChannelPermissions(indexSnapshot(data), 'staff-chat', asRole('member'));
    expect(result.effective & permissionBits.KickMembers).toBe(permissionBits.KickMembers);
  });
});

describe('traces', () => {
  it('names the step that decided a permission', () => {
    const result = explainChannelPermissions(index(), 'staff-chat', asRole('member'));
    expect(decisiveStep(result.steps, VIEW_CHANNEL)?.stage).toBe('overwrite-everyone-deny');
  });

  it('emits codes, never prose', () => {
    const result = explainChannelPermissions(index(), 'general', asRole('member'));
    for (const step of result.steps) {
      expect(step.stage).toMatch(/^[a-z-]+$/);
    }
  });
});

describe('sync state', () => {
  it('is per channel, not per role', () => {
    const idx = index();
    expect(channelSyncState(idx, 'staff-chat')).toBe('synced');
    expect(channelSyncState(idx, 'leaked')).toBe('desynced');
    expect(channelSyncState(idx, 'general')).toBe('no-parent');
  });
});

describe('tree', () => {
  it('groups orphans without inventing permissions for the group', () => {
    const tree = buildTree(index(), asRole('member'));
    const orphans = tree.find((node) => node.category === null);
    expect(orphans).toBeDefined();
    expect(orphans!.permissions).toBeNull();
    expect(orphans!.children.map((c) => c.channel.id).sort()).toEqual(['general', 'voice']);
  });
});

describe('audit', () => {
  it('puts critical findings first', () => {
    const findings = auditSnapshot(snapshot());
    const severities = findings.map((f) => f.severity);
    expect(severities).toEqual([...severities].sort((a, b) => (a === b ? 0 : a === 'critical' ? -1 : b === 'critical' ? 1 : a === 'warning' ? -1 : 1)));
    expect(findings[0]?.severity).toBe('critical');
  });

  it('flags a public channel inside a private category', () => {
    const findings = auditSnapshot(snapshot());
    expect(findings.some((f) => f.code === 'public-channel-in-private-category' && f.channelId === 'leaked')).toBe(true);
  });

  it('flags a dangerous @everyone permission', () => {
    const data = snapshot();
    data.roles[0]!.permissions = bits('ViewChannel', 'ManageRoles');
    const findings = auditSnapshot(data);
    expect(findings.some((f) => f.code === 'everyone-dangerous-permission')).toBe(true);
  });

  it('flags an overwrite that both allows and denies the same bit', () => {
    const data = snapshot();
    data.channels[3]!.overwrites.push({
      targetType: 'role',
      targetId: 'member',
      allow: bits('SendMessages'),
      deny: bits('SendMessages'),
    });
    expect(auditSnapshot(data).some((f) => f.code === 'conflicting-overwrite')).toBe(true);
  });

  it('emits parameters instead of English sentences', () => {
    for (const finding of auditSnapshot(snapshot())) {
      expect(finding.code).toMatch(/^[a-z-]+$/);
      expect(finding.params).toBeTypeOf('object');
    }
  });
});

describe('diffing', () => {
  it('touches only the bits that actually differ', () => {
    const current = snapshot();
    const candidate = snapshot();
    candidate.roles[1]!.permissions = bits('AddReactions', 'EmbedLinks');
    const [operation] = diffSnapshots(current, candidate);
    expect(operation).toBeDefined();
    expect(operation!.touched).toBe(permissionBits.EmbedLinks);
    expect(operation!.nextAllow).toBe(permissionBits.EmbedLinks);
  });

  it('preserves bits that changed on Discord between planning and applying', () => {
    // This is where the "the snapshot may be months old" guarantee actually
    // lives. The plan is computed now; by the time it is applied, the live role
    // has gained a permission nobody planned for — including one this build has
    // no name for. Because `touched` was frozen at planning time, the apply
    // cannot reach those bits.
    const current = snapshot();
    const candidate = snapshot();
    candidate.roles[3]!.permissions = bits('ManageMessages', 'EmbedLinks');
    const [operation] = diffSnapshots(current, candidate);
    expect(operation!.touched).toBe(permissionBits.EmbedLinks);

    const futureBit = 1n << 60n;
    const liveAtApplyTime = toBits(current.roles[3]!.permissions) | permissionBits.BanMembers | futureBit;
    const applied = applyMask(liveAtApplyTime, operation!.touched, operation!.nextAllow);

    expect(applied & permissionBits.EmbedLinks).toBe(permissionBits.EmbedLinks);
    expect(applied & permissionBits.BanMembers).toBe(permissionBits.BanMembers);
    expect(applied & futureBit).toBe(futureBit);
    expect(() => assertOnlyTouched(liveAtApplyTime, applied, operation!.touched)).not.toThrow();
  });

  it('produces no operations for an identical snapshot', () => {
    expect(diffSnapshots(snapshot(), snapshot())).toEqual([]);
  });

  it('inverts an applied operation back to the observed value, masked', () => {
    const current = snapshot();
    const candidate = snapshot();
    candidate.roles[1]!.permissions = bits('AddReactions', 'EmbedLinks');
    const operations = diffSnapshots(current, candidate);
    const [inverse] = invertOperations(operations);
    expect(inverse!.touched).toBe(permissionBits.EmbedLinks);
    expect(inverse!.nextAllow).toBe(0n);
  });
});
