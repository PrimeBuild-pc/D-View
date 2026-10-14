import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlanSchema, deserialiseOperation, loadSnapshot, resolveEdits } from './plans';
import type { PermissionSnapshot } from '@dpd/shared';
import { discord } from './discord';

const snapshotFind = vi.hoisted(() => vi.fn());
vi.mock('@dpd/database', () => ({ prisma: {
  permissionSnapshot: { findFirst: snapshotFind },
  discordRole: { findMany: vi.fn(async () => [{ id: '1' }, { id: '4' }]) },
  discordChannel: { findMany: vi.fn(async () => [{ id: '3' }]) },
} }));
vi.mock('./discord', () => ({ discord: vi.fn() }));
const snapshot = (): PermissionSnapshot => ({
  schemaVersion: '2.0.0', exportedAt: '2026-01-01T00:00:00.000Z',
  guild: { id: '1', name: 'Test', ownerId: '2', everyoneRoleId: '1' },
  roles: [
    { id: '1', name: '@everyone', position: 0, managed: false, permissions: '0' },
    { id: '4', name: 'managed', position: 1, managed: true, permissions: '0' },
  ], channels: [{ id: '3', name: 'lobby', type: 0, position: 0, overwrites: [] }],
});
const role = { kind: 'role' as const, roleId: '1', touched: '8', nextAllow: '8' };
beforeEach(() => { vi.mocked(discord).mockReset(); });

describe('server-side plan rebuilding', () => {
  it('scopes snapshot lookup by guild and refuses mismatched persisted snapshot data', async () => {
    const data = snapshot();
    data.guild.id = '9';
    data.guild.everyoneRoleId = '9';
    data.roles[0]!.id = '9';
    snapshotFind.mockResolvedValue({ id: 's1', data, version: '2.0.0', createdAt: new Date() });
    expect(await loadSnapshot('1', 's1')).toMatchObject({ status: 'outdated' });
    expect(snapshotFind.mock.calls[0]?.[0]).toEqual({ where: { id: 's1', guildId: '1' } });
  });
  it('rejects cross-server roles, channels and mismatched snapshots', async () => {
    await expect(resolveEdits('1', [{ ...role, roleId: '99' }], snapshot())).rejects.toThrow('does not belong');
    await expect(resolveEdits('1', [{ kind: 'overwrite', channelId: '99', targetType: 'role', targetId: '1', touched: '8', nextAllow: '8', nextDeny: '0' }], snapshot())).rejects.toThrow('does not belong');
    await expect(resolveEdits('9', [role], snapshot())).rejects.toThrow('different guild');
  });
  it('rejects duplicate targets, managed roles and overlapping bits', async () => {
    await expect(resolveEdits('1', [role, role], snapshot())).rejects.toThrow('same target twice');
    await expect(resolveEdits('1', [{ ...role, roleId: '4' }], snapshot())).rejects.toThrow('managed');
    await expect(resolveEdits('1', [{ kind: 'overwrite', channelId: '3', targetType: 'role', targetId: '1', touched: '8', nextAllow: '8', nextDeny: '8' }], snapshot())).rejects.toThrow('non-overlapping');
  });
  it('does not allow overwrites on threads or IDs missing from the selected snapshot', async () => {
    const data = snapshot();
    data.channels[0]!.type = 11;
    await expect(resolveEdits('1', [{ kind: 'delete-overwrite', channelId: '3', targetType: 'role', targetId: '1' }], data)).rejects.toThrow('cannot have overwrites');
    data.roles.pop();
    await expect(resolveEdits('1', [{ ...role, roleId: '4' }], data)).rejects.toThrow('missing');
  });
  it('checks member membership and masks the client nextAllow', async () => {
    vi.mocked(discord).mockRejectedValue(new Error('404'));
    await expect(resolveEdits('1', [{ kind: 'overwrite', channelId: '3', targetType: 'member', targetId: '7', touched: '8', nextAllow: '8', nextDeny: '0' }], snapshot())).rejects.toThrow('not a current member');
    const [operation] = await resolveEdits('1', [{ ...role, nextAllow: '24' }], snapshot());
    expect(operation?.nextAllow).toBe(8n);
  });
  it('bounds intents and rejects unsafe identifiers', () => {
    expect(createPlanSchema.safeParse({ baseSnapshotId: 'a', edits: [{ ...role, roleId: '../other' }] }).success).toBe(false);
    expect(createPlanSchema.safeParse({ baseSnapshotId: 'a', edits: [{ ...role, touched: '1'.repeat(41) }] }).success).toBe(false);
    expect(createPlanSchema.safeParse({ baseSnapshotId: 'a', edits: Array(501).fill(role) }).success).toBe(false);
  });
  it('rejects malformed persisted kinds, targets and bitfields before any execution', () => {
    const row = { kind: 'set-role-permissions', roleId: '1', channelId: null, targetType: null, targetId: null,
      touchedBits: '8', nextAllow: '8', nextDeny: '0', expectedAllow: '0', expectedDeny: '0' };
    expect(deserialiseOperation(row)).toMatchObject({ roleId: '1', touched: 8n });
    for (const change of [{ kind: 'anything' }, { roleId: '../other' }, { touchedBits: 'NaN' }, { nextDeny: '8' }]) {
      expect(() => deserialiseOperation({ ...row, ...change })).toThrow();
    }
  });
});
