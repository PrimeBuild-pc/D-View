import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ABANDONED_AFTER_MS, recoverStaleExecutions } from './recovery';
import { POST as members } from '../app/api/guilds/[guildId]/members/route';

const mocks = vi.hoisted(() => ({ findStale: vi.fn(), finish: vi.fn(), planUpdate: vi.fn(), record: vi.fn(), count: vi.fn(),
  guildFind: vi.fn(), lease: vi.fn(), upsert: vi.fn(), prune: vi.fn(), access: vi.fn(), authorize: vi.fn(), discord: vi.fn() }));
vi.mock('./guild', () => ({ guildAccess: mocks.access, authorizeGuild: mocks.authorize }));
vi.mock('./discord', async (original) => ({ ...await original<typeof import('./discord')>(), discord: mocks.discord }));
vi.mock('@dpd/database', () => {
  const db = {
    permissionChangeExecution: { findMany: mocks.findStale, updateMany: mocks.finish },
    permissionChangePlan: { updateMany: mocks.planUpdate }, permissionChangeOperationResult: { createMany: mocks.record, count: mocks.count },
    discordGuild: { findUnique: mocks.guildFind, updateMany: mocks.lease },
    guildMember: { upsert: mocks.upsert, deleteMany: mocks.prune },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { prisma: db };
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  mocks.finish.mockResolvedValue({ count: 1 });
  mocks.count.mockResolvedValue(1);
  mocks.access.mockResolvedValue({ session: { user: { id: '2' } } });
  mocks.authorize.mockResolvedValue({ id: '1' });
  mocks.guildFind.mockResolvedValue({ id: '1' });
});

describe('interrupted operation recovery', () => {
  it('recovers only old running executions, retains applied results and marks missing results unknown', async () => {
    mocks.findStale.mockResolvedValue([{ id: 'e1', planId: 'p1', results: [{ operationId: 'op1', status: 'applied' }],
      plan: { operations: [{ id: 'op1', included: true }, { id: 'op2', included: true }, { id: 'op3', included: false }] } }]);
    await recoverStaleExecutions('1');
    expect(mocks.findStale.mock.calls[0]?.[0].where).toMatchObject({ status: 'running', plan: { guildId: '1', status: 'executing' } });
    const cutoff = mocks.findStale.mock.calls[0]?.[0].where.startedAt.lt as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(ABANDONED_AFTER_MS);
    expect(mocks.record.mock.calls[0]?.[0].data).toEqual([
      expect.objectContaining({ operationId: 'op2', status: 'unknown' }),
      expect.objectContaining({ operationId: 'op3', status: 'skipped-noop' }),
    ]);
    expect(mocks.planUpdate.mock.calls[0]?.[0].data).toEqual({ status: 'partial' });
    expect(mocks.finish.mock.calls[0]?.[0].data.status).toBe('interrupted');
  });
  it('counts committed late results rather than classifying from its stale initial read', async () => {
    mocks.findStale.mockResolvedValue([{ id: 'e1', planId: 'p1', results: [{ operationId: 'op1', status: 'unknown' }], plan: { operations: [] } }]);
    mocks.count.mockResolvedValue(1);
    await recoverStaleExecutions('1');
    expect(mocks.planUpdate.mock.calls[0]?.[0].data.status).toBe('partial');
  });
  it('does nothing when another request already finished or recovered the execution', async () => {
    mocks.findStale.mockResolvedValue([{ id: 'e1', planId: 'p1', results: [], plan: { operations: [] } }]);
    mocks.finish.mockResolvedValue({ count: 0 });
    await recoverStaleExecutions('1');
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.planUpdate).not.toHaveBeenCalled();
  });
});

describe('member sync lease ownership', () => {
  const request = () => new Request('http://localhost:3000/api', { method: 'POST', headers: { origin: 'http://localhost:3000' } });
  const params = { params: Promise.resolve({ guildId: '1' }) };
  it('allows recovery of an abandoned member lease, then prunes under the same lease', async () => {
    mocks.lease.mockResolvedValue({ count: 1 });
    mocks.discord.mockResolvedValue([]);
    mocks.prune.mockResolvedValue({ count: 0 });
    expect((await members(request(), params)).status).toBe(200);
    const claim = mocks.lease.mock.calls[0]?.[0].where;
    expect(claim.OR).toHaveLength(2);
    expect(claim.OR[1].membersSyncStartedAt.lt).toBeInstanceOf(Date);
    expect(mocks.prune).toHaveBeenCalledTimes(1);
    expect(mocks.lease.mock.calls.at(-1)?.[0].where.membersSyncStartedAt).toBeInstanceOf(Date);
  });
  it('never stores or prunes members after another run takes its lease', async () => {
    mocks.lease.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    mocks.discord.mockResolvedValue([{ user: { id: '3', username: 'member', avatar: null }, roles: [], joined_at: '2026-01-01T00:00:00.000Z' }]);
    expect((await members(request(), params)).status).toBe(502);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.prune).not.toHaveBeenCalled();
  });
});
