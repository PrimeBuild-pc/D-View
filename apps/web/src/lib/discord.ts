/**
 * The single Discord REST client.
 *
 * Previously two route files each declared their own `fetch` wrapper, neither of
 * which handled 429. A plan with more than a handful of channel-overwrite writes
 * would hit the per-channel bucket and abort part-way through.
 */

const API = 'https://discord.com/api/v10';

const MAX_ATTEMPTS = 3;
/** Flat spacing between mutating calls. ponytail: per-bucket tracking via X-RateLimit-Bucket only if plans grow past a few dozen operations. */
export const WRITE_SPACING_MS = 250;

export class DiscordError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly code: number | undefined,
    readonly detail: string,
  ) {
    super(`Discord ${status} for ${path}: ${detail}`);
    this.name = 'DiscordError';
  }
}

/** Discord bans an IP after 10,000 invalid requests in 10 minutes, so a global limit must stop everything rather than be retried. */
export class DiscordGlobalRateLimit extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Discord global rate limit hit; retry after ${retryAfterMs}ms`);
    this.name = 'DiscordGlobalRateLimit';
  }
}

function botToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set. Add it to your .env file.');
  return token;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DiscordRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Shown in the guild's Discord audit log. Must be encoded: Node throws on non-ASCII header values. */
  auditLogReason?: string;
}

export async function discord<T>(path: string, init: DiscordRequest = {}): Promise<T> {
  const { method = 'GET', body, auditLogReason } = init;

  for (let attempt = 1; ; attempt += 1) {
    const headers: Record<string, string> = { authorization: `Bot ${botToken()}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auditLogReason) {
      // encodeURIComponent is not optional here: the UI ships seven locales, so a
      // reason containing non-ASCII is routine and Node throws ERR_INVALID_CHAR
      // on a raw header value rather than degrading.
      headers['x-audit-log-reason'] = encodeURIComponent(auditLogReason).slice(0, 512);
    }

    const response = await fetch(`${API}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 429) {
      const payload = (await response.json().catch(() => ({}))) as {
        retry_after?: number;
        global?: boolean;
      };
      const retryAfterMs = Math.ceil((payload.retry_after ?? 1) * 1000) + 250;
      if (payload.global || response.headers.get('x-ratelimit-scope') === 'global') {
        throw new DiscordGlobalRateLimit(retryAfterMs);
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new DiscordError(429, path, undefined, `rate limited after ${attempt} attempts`);
      }
      await sleep(retryAfterMs);
      continue;
    }

    if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
      await sleep(attempt * 500);
      continue;
    }

    if (!response.ok) {
      // Never retry other 4xx — they will fail identically every time.
      const payload = (await response.json().catch(() => null)) as { message?: string; code?: number } | null;
      throw new DiscordError(response.status, path, payload?.code, payload?.message ?? response.statusText);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

export const spaceWrites = () => sleep(WRITE_SPACING_MS);

// --- Payload shapes we read -------------------------------------------------

export interface DiscordGuildPayload {
  id: string;
  name: string;
  owner_id: string;
  icon: string | null;
  preferred_locale?: string;
}

export interface DiscordRolePayload {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
  permissions: string;
}

export interface DiscordOverwritePayload {
  id: string;
  type: number;
  allow: string;
  deny: string;
}

export interface DiscordChannelPayload {
  id: string;
  name: string;
  type: number;
  position: number;
  parent_id?: string | null;
  permission_overwrites?: DiscordOverwritePayload[];
}

export interface DiscordMemberPayload {
  user: { id: string; username: string; global_name?: string | null; avatar: string | null; bot?: boolean };
  nick?: string | null;
  roles: string[];
  joined_at: string;
  pending?: boolean;
  communication_disabled_until?: string | null;
}
