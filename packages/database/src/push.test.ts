import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), disconnect: vi.fn(), cli: vi.fn() }));
vi.mock('@prisma/client', () => ({ PrismaClient: class {
  $executeRawUnsafe = mocks.execute;
  $disconnect = mocks.disconnect;
} }));
vi.mock('node:child_process', () => ({ execFileSync: mocks.cli }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

it('prepares only the validated result index before the normal schema push', async () => {
  // @ts-expect-error The native CLI is intentionally JavaScript.
  await import('../scripts/push.mjs');
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('CREATE UNIQUE INDEX IF NOT EXISTS'));
  expect(mocks.execute.mock.calls[0]?.[0]).toContain('to_regclass');
  expect(mocks.execute.mock.calls[0]?.[0]).toContain('("executionId", "operationId")');
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.cli).toHaveBeenCalledWith(process.execPath, expect.arrayContaining([
    'db', 'push', '--schema', 'prisma/schema.prisma',
  ]), { stdio: 'inherit' });
  expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.cli.mock.invocationCallOrder[0]!);
});

it('stops before Prisma push and disconnects if legacy index validation fails', async () => {
  mocks.execute.mockRejectedValueOnce(new Error('duplicate legacy results'));
  // @ts-expect-error The native CLI is intentionally JavaScript.
  await expect(import('../scripts/push.mjs')).rejects.toThrow('duplicate legacy results');
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.cli).not.toHaveBeenCalled();
});
