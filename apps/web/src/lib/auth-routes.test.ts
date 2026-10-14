import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as login } from '../app/api/auth/login/route';
import { GET as callback } from '../app/api/auth/callback/route';
import { POST as logout } from '../app/api/auth/logout/route';
import { POST as sync } from '../app/api/guilds/[guildId]/sync/route';
import { POST as create } from '../app/api/guilds/[guildId]/plans/route';
import { POST as validateImport } from '../app/api/guilds/[guildId]/import/route';
import { POST as writes } from '../app/api/guilds/[guildId]/writes/route';
import { POST as members } from '../app/api/guilds/[guildId]/members/route';
import { POST as execute } from '../app/api/guilds/[guildId]/plans/[planId]/execute/route';
import { POST as rollback } from '../app/api/guilds/[guildId]/plans/[planId]/rollback/route';
import { decodeSession } from './session';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn(), access: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set, delete: mocks.delete }) }));
vi.mock('./guild', () => ({ guildAccess: mocks.access, authorizeGuild: vi.fn() }));
const params = { params: Promise.resolve({ guildId: '1', planId: 'p1' }) };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_URL', 'https://dashboard.example');
  vi.stubEnv('AUTH_SECRET', 'test-only-encryption-key-longer-than-32-characters');
  vi.stubEnv('DISCORD_CLIENT_ID', 'test-id');
  vi.stubEnv('DISCORD_CLIENT_SECRET', 'test-secret');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('OAuth routes', () => {
  it('uses the configured public callback URL and a secure single-use state cookie', async () => {
    const response = await login();
    const url = new URL(response.headers.get('location')!);
    expect(url.searchParams.get('redirect_uri')).toBe('https://dashboard.example/api/auth/callback');
    expect(url.searchParams.get('scope')).toBe('identify guilds');
    expect(mocks.set.mock.calls[0]?.[2]).toMatchObject({ secure: true, httpOnly: true, sameSite: 'lax', maxAge: 600 });
    expect(url.searchParams.get('state')).toHaveLength(43);
  });
  it('clears and rejects invalid state before contacting Discord', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    mocks.get.mockReturnValue({ value: 'expected' });
    expect((await callback(new Request('http://hostile/api/auth/callback?code=c&state=wrong'))).status).toBe(400);
    expect(mocks.delete).toHaveBeenCalledWith('dpd_oauth_state');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('stores a bounded encrypted session without putting guilds in the cookie', async () => {
    mocks.get.mockReturnValue({ value: 'expected' });
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'private-token', expires_in: 604800 }))
      .mockResolvedValueOnce(Response.json({ id: '2', username: 'admin', avatar: null }));
    vi.stubGlobal('fetch', fetch);
    const response = await callback(new Request('http://hostile/api/auth/callback?code=c&state=expected'));
    expect(response.headers.get('location')).toBe('https://dashboard.example/guilds');
    expect(decodeSession(mocks.set.mock.calls[0]?.[1])).toMatchObject({ user: { id: '2' }, accessToken: 'private-token' });
    expect(mocks.set.mock.calls[0]?.[1].length).toBeLessThan(3800);
    expect(fetch.mock.calls[0]?.[1].body.get('redirect_uri')).toBe('https://dashboard.example/api/auth/callback');
    expect(fetch.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('every mutating API rejects missing Origin', () => {
  it.each([
    ['logout', (r: Request) => logout(r)], ['sync', (r: Request) => sync(r, params)],
    ['plans', (r: Request) => create(r, params)], ['import', (r: Request) => validateImport(r, params)],
    ['writes', (r: Request) => writes(r, params)], ['members', (r: Request) => members(r, params)],
    ['execute', (r: Request) => execute(r, params)], ['rollback', (r: Request) => rollback(r, params)],
  ])('%s', async (_name, action) => {
    const response = await action(new Request('http://localhost:3000/api', { method: 'POST' }));
    expect(response.status).toBe(403);
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
