import { describe, expect, it } from 'vitest';
import type { PermissionSnapshot, RoleId, ChannelId, UserId } from '@dpd/shared';
import { auditSnapshot, calculateChannelPermissions } from './index';

const rid = (id: string) => id as RoleId;
const cid = (id: string) => id as ChannelId;
const uid = (id: string) => id as UserId;

function snapshot(): PermissionSnapshot {
  return {
    schemaVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    guild: { id: 'g1' as any, name: 'Guild', everyoneRoleId: rid('everyone') },
    roles: [
      { id: rid('everyone'), name: '@everyone', position: 0, managed: false, permissions: [] },
      { id: rid('member'), name: 'Member', position: 1, managed: false, permissions: ['ViewChannel', 'SendMessages'] },
      { id: rid('admin'), name: 'Admin', position: 2, managed: false, permissions: ['Administrator'] },
    ],
    channels: [
      { id: cid('cat'), name: 'Staff', type: 'category', overwrites: [
        { targetType: 'role', targetId: rid('everyone'), allow: [], deny: ['ViewChannel'] },
        { targetType: 'role', targetId: rid('member'), allow: ['ViewChannel'], deny: [] },
      ] },
      { id: cid('chan'), name: 'staff-chat', type: 'text', parentId: cid('cat'), overwrites: [] },
      { id: cid('ann'), name: 'announcements', type: 'text', parentId: cid('cat'), overwrites: [
        { targetType: 'role', targetId: rid('member'), allow: ['ViewChannel'], deny: ['SendMessages'] },
        { targetType: 'member', targetId: uid('u1'), allow: ['ViewChannel'], deny: [], },
      ] },
    ],
  };
}

describe('permission engine', () => {
  it('uses global role permissions', () => {
    const result = calculateChannelPermissions(snapshot(), rid('member'), cid('chan'));
    expect(result.permissions.SendMessages?.allowed).toBe(true);
  });

  it('applies @everyone deny then role allow from category', () => {
    const result = calculateChannelPermissions(snapshot(), rid('member'), cid('chan'));
    expect(result.permissions.ViewChannel?.allowed).toBe(true);
    expect(result.permissions.ViewChannel?.trace.map((t) => t.source)).toContain('category-overwrite');
  });

  it('applies channel override after category', () => {
    const result = calculateChannelPermissions(snapshot(), rid('member'), cid('ann'));
    expect(result.permissions.SendMessages?.allowed).toBe(false);
    expect(result.hasChannelSpecificOverride).toBe(true);
  });

  it('handles Administrator bypass', () => {
    const result = calculateChannelPermissions(snapshot(), rid('admin'), cid('ann'));
    expect(result.permissions.ViewChannel?.allowed).toBe(true);
    expect(result.permissions.ViewChannel?.source).toBe('administrator-bypass');
  });

  it('reports member overwrite exceptions without applying them', () => {
    const snap = snapshot();
    const result = calculateChannelPermissions(snap, rid('member'), cid('ann'));
    expect(result.memberOverwriteCount).toBe(1);
    expect(auditSnapshot(snap).some((f) => f.title === 'Member overwrite exception')).toBe(true);
  });
});
