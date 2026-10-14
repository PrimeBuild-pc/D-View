import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SetupPage from '../app/setup/page';

const mocks = vi.hoisted(() => ({ session: vi.fn(), count: vi.fn() }));
vi.mock('./session', () => ({ getSession: mocks.session }));
vi.mock('./i18n/server', () => ({ resolveLang: async () => 'en' }));
vi.mock('@dpd/database', () => ({ prisma: { discordGuild: { count: mocks.count } } }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgresql://fake');
  vi.stubEnv('DISCORD_BOT_TOKEN', 'private-bot-token');
  vi.stubEnv('DISCORD_CLIENT_ID', '123456789012345678');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('does not expose secrets or spend Discord/database requests on unauthenticated setup visits', async () => {
  mocks.session.mockResolvedValue(null);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const tree = await SetupPage();
  expect(JSON.stringify(tree)).not.toContain('private-bot-token');
  expect(JSON.stringify(tree)).toContain('client_id=123456789012345678&scope=bot&permissions=0');
  expect(JSON.stringify(tree)).not.toContain('permissions=268435472');
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.count).not.toHaveBeenCalled();
});

it('bounds live setup checks after login and never displays raw database errors', async () => {
  mocks.session.mockResolvedValue({ user: { id: '2' } });
  mocks.count.mockRejectedValue(new Error('postgresql://secret-password@internal-host'));
  const fetch = vi.fn().mockResolvedValue(Response.json({ username: 'test-bot' }));
  vi.stubGlobal('fetch', fetch);
  const tree = await SetupPage();
  expect(fetch.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  expect(JSON.stringify(tree)).not.toContain('secret-password');
});
