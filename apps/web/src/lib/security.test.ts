import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canReadGuild, decodeSession, encodeSession, type DiscordSession } from './session';
import { appUrl, invalidOrigin, readBody, readJson } from './request';
import { authorizeGuild, readableGuilds } from './guild';
import { discord } from './discord';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('./discord', () => ({ discord: vi.fn() }));
const session = (): DiscordSession => ({ user: { id: '2', username: 'admin' }, accessToken: 'private-token',
  createdAt: Date.now() - 1000, expiresAt: Date.now() + 60_000 });

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'a-secret-with-more-than-thirty-two-characters');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('encrypted sessions', () => {
  it('round-trips without exposing the OAuth token or user data', () => {
    const data = session();
    const encoded = encodeSession(data);
    expect(decodeSession(encoded)).toEqual(data);
    expect(encoded).not.toContain('private-token');
    expect(Buffer.from(encoded.split('.')[2]!, 'base64url').toString()).not.toContain('private-token');
    expect(encoded.length).toBeLessThan(3800);
  });
  it('rejects tampering, trailing components and old signed cookies', () => {
    const encoded = encodeSession(session());
    const parts = encoded.split('.');
    parts[2] = `${parts[2]![0] === 'a' ? 'b' : 'a'}${parts[2]!.slice(1)}`;
    expect(decodeSession(parts.join('.'))).toBeNull();
    expect(decodeSession(`${encoded}.extra`)).toBeNull();
    expect(decodeSession('old.signed')).toBeNull();
    expect(decodeSession('x'.repeat(3801))).toBeNull();
  });
  it.each([
    { createdAt: Date.now() - 2000, expiresAt: Date.now() - 1000 },
    { createdAt: Date.now() + 60_000, expiresAt: Date.now() + 120_000 },
    { expiresAt: Date.now() + 8 * 86_400_000 },
    { createdAt: Number.NaN },
    { user: { id: '../other', username: 'admin' } },
  ])('rejects invalid dates and payloads: %j', (invalid) => {
    expect(decodeSession(encodeSession({ ...session(), ...invalid }))).toBeNull();
  });
  it('fails closed if the encryption secret is unavailable or changes', () => {
    const encoded = encodeSession(session());
    vi.stubEnv('AUTH_SECRET', 'different-secret-of-more-than-thirty-two-characters');
    expect(decodeSession(encoded)).toBeNull();
    vi.stubEnv('AUTH_SECRET', '');
    vi.stubEnv('NEXTAUTH_SECRET', '');
    expect(decodeSession(encoded)).toBeNull();
  });
  it('does not interpret a truthy string as owner or malformed permissions as admin', () => {
    expect(canReadGuild({ id: '1', name: 'g', owner: 'true' as unknown as boolean, permissions: '0' })).toBe(false);
    expect(canReadGuild({ id: '1', name: 'g', owner: false, permissions: 'not-bits' })).toBe(false);
  });
});

describe('request boundaries', () => {
  it.each([null, 'null', 'https://evil.example', 'http://sub.localhost:3000'])('rejects absent/cross origins %s', (origin) => {
    const headers = origin ? { origin } : {};
    expect(invalidOrigin(new Request('http://localhost:3000/api', { method: 'POST', headers }))).toBe(true);
  });
  it('accepts only the configured origin, including behind a proxy', () => {
    vi.stubEnv('APP_URL', 'https://dashboard.example');
    expect(invalidOrigin(new Request('http://internal:3000/api', { headers: { origin: 'https://dashboard.example' } }))).toBe(false);
    expect(invalidOrigin(new Request('http://internal/api', { headers: { origin: 'https://dashboard.example', 'sec-fetch-site': 'cross-site' } }))).toBe(true);
  });
  it.each(['http://dashboard.example', 'https://example.com/path', 'https://user:pass@example.com', 'ftp://example.com'])('rejects unsafe APP_URL %s', (value) => {
    vi.stubEnv('APP_URL', value);
    expect(() => appUrl()).toThrow();
  });
  it('counts UTF-8 bytes rather than characters without relying on Content-Length', async () => {
    await expect(readBody(new Request('http://localhost', { method: 'POST', body: 'éé' }), 3)).rejects.toMatchObject({ status: 413 });
    expect(await readBody(new Request('http://localhost', { method: 'POST', body: 'é' }), 2)).toBe('é');
  });
  it('times out a stalled streaming body', async () => {
    vi.useFakeTimers();
    const request = new Request('http://localhost', { method: 'POST', body: new ReadableStream(), duplex: 'half' } as RequestInit);
    const assertion = expect(readBody(request, 8)).rejects.toMatchObject({ status: 408 });
    await vi.runAllTimersAsync();
    await assertion;
  });
  it('rejects oversized streaming JSON, invalid JSON and wrong content types', async () => {
    await expect(readJson(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '12345' }), 4)).rejects.toMatchObject({ status: 413 });
    await expect(readJson(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(new Request('http://localhost', { method: 'POST', body: '{}' }))).rejects.toMatchObject({ status: 415 });
  });
});

describe('live guild authorization', () => {
  const roles = [{ id: '1', permissions: '0' }, { id: '3', permissions: '8' }];
  function mockGuild(memberRoles = ['3'], owner = '99') {
    vi.mocked(discord).mockImplementation(async (path) => {
      if (path === '/guilds/1') return { id: '1', name: 'g', owner_id: owner, icon: null };
      if (path === '/guilds/1/members/2') return { user: { id: '2' }, roles: memberRoles };
      if (path === '/guilds/1/roles') return roles;
      throw new Error('Not a member of this guild');
    });
  }
  it('allows the current administrator, then denies the same session after role removal', async () => {
    mockGuild();
    expect(await authorizeGuild(session(), '1')).toMatchObject({ id: '1', owner: false, permissions: '8' });
    mockGuild([]);
    expect(await authorizeGuild(session(), '1')).toBeNull();
  });
  it('denies a session that expires during a running batch', async () => {
    mockGuild();
    expect(await authorizeGuild({ ...session(), expiresAt: Date.now() - 1 }, '1')).toBeNull();
  });
  it('allows the current owner without an administrator role', async () => {
    mockGuild([], '2');
    expect(await authorizeGuild(session(), '1')).toMatchObject({ owner: true });
  });
  it('fails closed for another guild, invalid IDs, Discord errors and missing membership', async () => {
    mockGuild();
    expect(await authorizeGuild(session(), '4')).toBeNull();
    expect(await authorizeGuild(session(), '../1')).toBeNull();
    vi.mocked(discord).mockRejectedValue(new Error('Timeout'));
    expect(await authorizeGuild(session(), '1')).toBeNull();
  });
  it('paginates OAuth guilds, so server selection does not depend on cookie size', async () => {
    const first = Array.from({ length: 200 }, (_, i) => ({ id: String(i + 1), name: 'g', owner: false, permissions: '8' }));
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json([{ id: '201', name: 'last', owner: true, permissions: '0' }]));
    vi.stubGlobal('fetch', fetch);
    expect(await readableGuilds(session())).toHaveLength(201);
    expect(fetch.mock.calls[1]?.[0]).toContain('after=200');
  });
});
