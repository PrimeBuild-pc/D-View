import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/guilds/[guildId]/plans/[planId]/execute/route';
import { POST as rollback } from '../app/api/guilds/[guildId]/plans/[planId]/rollback/route';
import { DiscordError } from './discord';

const mocks = vi.hoisted(() => ({
  access: vi.fn(), authorize: vi.fn(), discord: vi.fn(), writeState: vi.fn(), snapshot: vi.fn(),
  planFind: vi.fn(), claim: vi.fn(), planUpdate: vi.fn(), guildUpdate: vi.fn(), snapshotCreate: vi.fn(),
  executionCreate: vi.fn(), executionUpdate: vi.fn(), executionFind: vi.fn(), resultCreate: vi.fn(), planCreate: vi.fn(),
  loadSnapshot: vi.fn(), bot: vi.fn(),
}));
vi.mock('./guild', () => ({ guildAccess: mocks.access, authorizeGuild: mocks.authorize }));
vi.mock('./writes', () => ({ writeState: mocks.writeState }));
vi.mock('./snapshots', () => ({ snapshotGuild: mocks.snapshot }));
vi.mock('./discord', async (original) => ({ ...await original<typeof import('./discord')>(), discord: mocks.discord, spaceWrites: vi.fn() }));
vi.mock('./plans', async (original) => ({ ...await original<typeof import('./plans')>(), loadSnapshot: mocks.loadSnapshot, loadBotContext: mocks.bot }));
vi.mock('@dpd/database', () => {
  const db = {
    permissionChangePlan: { findFirst: mocks.planFind, updateMany: mocks.claim, update: mocks.planUpdate, create: mocks.planCreate },
    discordGuild: { update: mocks.guildUpdate }, permissionSnapshot: { create: mocks.snapshotCreate },
    permissionChangeExecution: { create: mocks.executionCreate, updateMany: mocks.executionUpdate, findUnique: mocks.executionFind },
    permissionChangeOperationResult: { upsert: (args: { update: unknown }) => mocks.resultCreate({ data: args.update }) },
    $transaction: async (input: ((tx: unknown) => unknown) | Promise<unknown>[]) => typeof input === 'function' ? input(db) : Promise.all(input),
  };
  return { prisma: db, toJson: (value: unknown) => value };
});

const operation = () => ({ id: 'op1', order: 0, included: true, kind: 'delete-channel-overwrite',
  roleId: null, channelId: '3', targetType: 'role', targetId: '1',
  touchedBits: '8', nextAllow: '0', nextDeny: '0', expectedAllow: '8', expectedDeny: '0' });
const data = { schemaVersion: '2.0.0', exportedAt: '2026-01-01T00:00:00.000Z',
  guild: { id: '1', name: 'Test', ownerId: '2', everyoneRoleId: '1' },
  roles: [{ id: '1', name: '@everyone', position: 0, managed: false, permissions: '0' }],
  channels: [{ id: '3', name: 'lobby', type: 0, position: 0, overwrites: [] }],
};
const params = { params: Promise.resolve({ guildId: '1', planId: 'plan1' }) };
const request = (origin = 'http://localhost:3000') => new Request('http://localhost:3000/api', {
  method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=Test',
});
let plan: ReturnType<typeof makePlan>;
function makePlan() { return { id: 'plan1', guildId: '1', status: 'draft', reason: null, guild: { name: 'Test' }, operations: [operation()] }; }
function live(allow = '8', guildId = '1') {
  mocks.discord.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (init?.method) return undefined;
    if (path === '/channels/3') return { id: '3', guild_id: guildId, type: 0,
      permission_overwrites: [{ id: '1', type: 0, allow, deny: '0' }] };
    if (path === '/guilds/1/roles') return [{ id: '1', managed: false, permissions: '0' }];
    throw new Error('Unexpected REST read');
  });
}
const writes = () => mocks.discord.mock.calls.filter((call) => call[1]?.method);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DISCORD_BOT_TOKEN', 'test-only');
  plan = makePlan();
  mocks.access.mockResolvedValue({ session: { user: { id: '2', username: 'admin' } }, guild: { id: '1', name: 'Test' } });
  mocks.authorize.mockResolvedValue({ id: '1', name: 'Test' });
  mocks.writeState.mockResolvedValue({ enabled: true });
  mocks.snapshot.mockResolvedValue(data);
  mocks.planFind.mockImplementation(async (query) => query.where.status === 'executing' ? null : plan);
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.executionCreate.mockResolvedValue({ id: 'execution1' });
  mocks.executionFind.mockResolvedValue({ status: 'running' });
  mocks.executionUpdate.mockResolvedValue({ count: 1 });
  mocks.loadSnapshot.mockResolvedValue({ status: 'ok', snapshot: data, id: 'snapshot1' });
  mocks.bot.mockResolvedValue({ userId: '9', roleIds: ['1'], highestRolePosition: 1 });
  mocks.planCreate.mockResolvedValue({ id: 'rollback1' });
  live();
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('plan execution security', () => {
  it('rejects CSRF and unauthorized guild access without reading a plan', async () => {
    expect((await POST(request('https://evil.example'), params)).status).toBe(403);
    mocks.access.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(401);
    expect(mocks.planFind).not.toHaveBeenCalled();
  });
  it('revalidates channel guild membership even for an already stored plan', async () => {
    live('8', 'other-guild');
    await POST(request(), params);
    expect(writes()).toHaveLength(0);
    expect(mocks.resultCreate.mock.calls[0]?.[0].data).toMatchObject({ status: 'failed' });
  });
  it('keeps concurrently added untouched bits when removing an overwrite', async () => {
    live('24');
    await POST(request(), params);
    expect(writes()).toEqual([['/channels/3/permissions/1', expect.objectContaining({ method: 'PUT', body: { type: 0, allow: '16', deny: '0' } })]]);
    expect(mocks.resultCreate.mock.calls.at(-1)?.[0].data).toMatchObject({ status: 'applied', liveBeforeAllow: '24', liveAfterAllow: '16', liveBeforeExists: true });
  });
  it('creates an explicit zero overwrite when a rollback requires its presence', async () => {
    plan.operations[0]!.kind = 'set-channel-overwrite';
    plan.operations[0]!.touchedBits = '0';
    plan.operations[0]!.expectedAllow = '0';
    mocks.discord.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method) return undefined;
      if (path === '/guilds/1/roles') return [{ id: '1', managed: false }];
      return { id: '3', guild_id: '1', type: 0, permission_overwrites: [] };
    });
    await POST(request(), params);
    expect(writes()[0]?.[1]).toMatchObject({ method: 'PUT', body: { type: 0, allow: '0', deny: '0' } });
  });
  it('does not delete a changed touched bit and reports the conflict', async () => {
    live('16');
    await POST(request(), params);
    expect(writes()).toHaveLength(0);
    expect(mocks.resultCreate.mock.calls[0]?.[0].data.status).toBe('skipped-conflict');
    expect(mocks.claim.mock.calls.at(-1)?.[0].data.status).toBe('failed');
  });
  it('stops if authorization or the write window changes during a batch', async () => {
    mocks.authorize.mockResolvedValue(null);
    await POST(request(), params);
    expect(writes()).toHaveLength(0);
    expect(mocks.resultCreate.mock.calls[0]?.[0].data.detail).toContain('authorization changed');
  });
  it('does not restore privileges if authorization is revoked during live reads', async () => {
    mocks.authorize.mockResolvedValueOnce({ id: '1' }).mockResolvedValue(null);
    await POST(request(), params);
    expect(writes()).toHaveLength(0);
    expect(mocks.resultCreate.mock.calls.at(-1)?.[0].data).toMatchObject({ status: 'failed' });
  });
  it('does not write if the lock closes while its pre-write result is being persisted', async () => {
    mocks.resultCreate.mockImplementation(async (args) => {
      if (args.data.status === 'unknown') mocks.writeState.mockResolvedValue({ enabled: false });
    });
    await POST(request(), params);
    expect(writes()).toHaveLength(0);
    expect(mocks.resultCreate.mock.calls.at(-1)?.[0].data.status).toBe('failed');
  });
  it('keeps rollback available when an applied response arrives after recovery', async () => {
    mocks.executionUpdate.mockResolvedValue({ count: 0 });
    await POST(request(), params);
    expect(mocks.claim.mock.calls.at(-1)?.[0]).toMatchObject({ where: { id: 'plan1', guildId: '1', status: 'failed' }, data: { status: 'partial' } });
    expect(mocks.resultCreate.mock.calls.at(-1)?.[0].data.status).toBe('applied');
  });
  it('does not write when a different plan for this guild is executing', async () => {
    mocks.planFind.mockImplementation(async (query) => query.where.status === 'executing' ? { id: 'other' } : plan);
    const response = await POST(request(), params);
    expect(response.headers.get('location')).toContain('already-running');
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
  it('retains live-before values when verifying an ambiguous mutating 5xx', async () => {
    plan.operations[0]!.kind = 'set-channel-overwrite';
    plan.operations[0]!.nextAllow = '0';
    let written = false;
    mocks.discord.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method) { written = true; throw new DiscordError(502, path, undefined, 'failed'); }
      if (path === '/guilds/1/roles') return [{ id: '1', managed: false }];
      return { id: '3', guild_id: '1', type: 0, permission_overwrites: [{ id: '1', type: 0, allow: written ? '16' : '24', deny: '0' }] };
    });
    await POST(request(), params);
    expect(writes()).toHaveLength(1);
    expect(mocks.resultCreate.mock.calls.at(-1)?.[0].data).toMatchObject({ status: 'applied', liveBeforeAllow: '24', liveAfterAllow: '16' });
  });
  it('leaves a timed-out delete unknown if an explicit zero overwrite still exists', async () => {
    plan.operations[0]!.touchedBits = '0';
    plan.operations[0]!.expectedAllow = '0';
    live('0');
    const reader = mocks.discord.getMockImplementation()!;
    mocks.discord.mockImplementation(async (path, init) => {
      if (init?.method) throw new Error('Timeout');
      return reader(path, init);
    });
    await POST(request(), params);
    expect(mocks.resultCreate.mock.calls.at(-1)?.[0].data.status).toBe('unknown');
  });
});

describe('reviewable rollback', () => {
  it('does not generate a rollback while the original batch is running', async () => {
    plan.status = 'executing';
    expect((await rollback(request(), params)).status).toBe(409);
    expect(mocks.planCreate).not.toHaveBeenCalled();
  });
  it('restores an explicitly empty overwrite instead of mistakenly deleting it', async () => {
    plan.status = 'applied';
    mocks.planFind.mockResolvedValue({ ...plan, executions: [{ results: [{ operationId: 'op1', status: 'applied',
      liveBeforeExists: true, liveBeforeAllow: '0', liveBeforeDeny: '0', liveAfterAllow: '8', liveAfterDeny: '0' }] }] });
    await rollback(request(), params);
    expect(mocks.planCreate.mock.calls[0]?.[0].data.operations.create[0]).toMatchObject({ kind: 'set-channel-overwrite', nextAllow: '0', expectedAllow: '8' });
  });
});
