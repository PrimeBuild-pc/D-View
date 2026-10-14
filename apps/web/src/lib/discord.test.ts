import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordError, DiscordGlobalRateLimit, discord } from './discord';

beforeEach(() => { vi.stubEnv('DISCORD_BOT_TOKEN', 'test-only'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Discord REST boundaries', () => {
  it('sets timeout, disables caching and encodes audit reasons', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: '1' }));
    vi.stubGlobal('fetch', fetch);
    await expect(discord('/guilds/1', { method: 'PATCH', body: { permissions: '8' }, auditLogReason: 'Motivo è' })).resolves.toEqual({ id: '1' });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', method: 'PATCH', body: '{"permissions":"8"}',
      headers: { 'x-audit-log-reason': 'Motivo%20%C3%A8' } });
    expect(fetch.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });
  it('never replays a mutating 5xx or an ambiguous network failure', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: 'failed' }, { status: 500 }));
    vi.stubGlobal('fetch', fetch);
    await expect(discord('/channels/3/permissions/1', { method: 'PUT' })).rejects.toBeInstanceOf(DiscordError);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockRejectedValue(new Error('Timeout'));
    await expect(discord('/channels/3/permissions/1', { method: 'DELETE' })).rejects.toThrow('Timeout');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not replay a mutation after a rate limit wait', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ retry_after: 0.1 }, { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    await expect(discord('/channels/3/permissions/1', { method: 'DELETE' })).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retries reads after a transient server error', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 502 })).mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const pending = discord('/guilds/1');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('honors bounded bucket rate limits and stops global or excessive waits', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ retry_after: 0.1 }, { status: 429 })).mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const pending = discord('/guilds/1');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: true });
    fetch.mockResolvedValue(Response.json({ global: true, retry_after: 1 }, { status: 429 }));
    await expect(discord('/guilds/1')).rejects.toBeInstanceOf(DiscordGlobalRateLimit);
    fetch.mockResolvedValue(Response.json({ retry_after: 1000 }, { status: 429 }));
    await expect(discord('/guilds/1')).rejects.toMatchObject({ status: 429 });
  });
});
