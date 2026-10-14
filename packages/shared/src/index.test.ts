import { describe, expect, it } from 'vitest';
import { permissionSnapshotSchema, type PermissionSnapshot } from './index';

const snapshot = (): PermissionSnapshot => ({
  schemaVersion: '2.0.0', exportedAt: '2026-01-01T00:00:00.000Z',
  guild: { id: '1', name: 'Test', ownerId: '2', everyoneRoleId: '1' },
  roles: [{ id: '1', name: '@everyone', position: 0, managed: false, permissions: '0' }],
  channels: [{ id: '3', name: 'lobby', type: 0, position: 0, overwrites: [] }],
});

describe('snapshot import validation', () => {
  it('preserves decimal future permission bits', () => {
    const data = snapshot();
    data.roles[0]!.permissions = (1n << 100n).toString();
    expect(permissionSnapshotSchema.parse(data).roles[0]!.permissions).toBe(data.roles[0]!.permissions);
  });
  it('rejects duplicate role, channel and overwrite IDs', () => {
    const data = snapshot();
    data.roles.push(data.roles[0]!);
    expect(permissionSnapshotSchema.safeParse(data).success).toBe(false);
    data.roles.pop();
    data.channels.push(data.channels[0]!);
    expect(permissionSnapshotSchema.safeParse(data).success).toBe(false);
    data.channels.pop();
    data.channels[0]!.overwrites = Array(2).fill({ targetType: 'role', targetId: '1', allow: '0', deny: '0' });
    expect(permissionSnapshotSchema.safeParse(data).success).toBe(false);
  });
  it('rejects unknown role targets and contradictory overwrite bits', () => {
    const data = snapshot();
    data.channels[0]!.overwrites = [{ targetType: 'role', targetId: '99', allow: '0', deny: '0' }];
    expect(permissionSnapshotSchema.safeParse(data).success).toBe(false);
    data.channels[0]!.overwrites = [{ targetType: 'role', targetId: '1', allow: '8', deny: '8' }];
    expect(permissionSnapshotSchema.safeParse(data).success).toBe(false);
  });
  it('rejects unsafe snowflakes, incorrect @everyone and huge bitfields', () => {
    const data = snapshot();
    data.channels[0]!.id = '../other';
    expect(permissionSnapshotSchema.safeParse(data).success).toBe(false);
    data.channels[0]!.id = '3';
    data.guild.everyoneRoleId = '2';
    expect(permissionSnapshotSchema.safeParse(data).success).toBe(false);
    data.guild.everyoneRoleId = '1';
    data.roles[0]!.permissions = '1'.repeat(41);
    expect(permissionSnapshotSchema.safeParse(data).success).toBe(false);
  });
  it('rejects malformed bits without throwing inside refinements', () => {
    const data = snapshot();
    data.channels[0]!.overwrites = [{ targetType: 'role', targetId: '1', allow: 'invalid', deny: '0' }];
    expect(permissionSnapshotSchema.safeParse(data).success).toBe(false);
  });
});
