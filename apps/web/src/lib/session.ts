import { cookies } from 'next/headers';
import { cache } from 'react';
import crypto from 'node:crypto';
import { z } from 'zod';
import { appUrl } from './request';

export interface DiscordUserGuild {
  id: string;
  name: string;
  icon?: string | null;
  owner: boolean;
  permissions: string;
}

const sessionSchema = z.object({
  user: z.object({ id: z.string().regex(/^\d{1,20}$/), username: z.string().min(1).max(100), avatar: z.string().nullable().optional() }),
  accessToken: z.string().min(1).max(512),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type DiscordSession = z.infer<typeof sessionSchema>;
const cookieName = 'dpd_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function key(): Buffer {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value || value.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters.');
  return crypto.createHash('sha256').update(value).digest();
}

// Encrypt, not just sign: the compact cookie contains an OAuth bearer token.
export function encodeSession(session: DiscordSession): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), encrypted.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function decodeSession(value?: string): DiscordSession | null {
  if (!value || value.length > 3800) return null;
  try {
    const parts = value.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    const iv = Buffer.from(parts[1]!, 'base64url');
    const tag = Buffer.from(parts[3]!, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[2]!, 'base64url')), decipher.final()]);
    const parsed = sessionSchema.safeParse(JSON.parse(plaintext.toString('utf8')));
    if (!parsed.success) return null;
    const session = parsed.data;
    const now = Date.now();
    if (session.createdAt > now || session.expiresAt <= now || session.expiresAt <= session.createdAt ||
      session.expiresAt - session.createdAt > SESSION_MAX_AGE_SECONDS * 1000) return null;
    return session;
  } catch {
    return null;
  }
}

export const getSession = cache(async (): Promise<DiscordSession | null> =>
  decodeSession((await cookies()).get(cookieName)?.value));

export async function setSession(session: DiscordSession): Promise<void> {
  const value = encodeSession(session);
  if (value.length > 3800) throw new Error('Session exceeds cookie size limit.');
  (await cookies()).set(cookieName, value, {
    httpOnly: true, sameSite: 'lax', secure: appUrl().protocol === 'https:', path: '/',
    maxAge: Math.min(SESSION_MAX_AGE_SECONDS, Math.floor((session.expiresAt - Date.now()) / 1000)),
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(cookieName);
}

export function canReadGuild(guild: DiscordUserGuild): boolean {
  if (guild.owner === true) return true;
  if (!/^\d{1,40}$/.test(guild.permissions)) return false;
  return (BigInt(guild.permissions) & 8n) === 8n;
}

export function canWriteGuild(guild: DiscordUserGuild): boolean {
  return canReadGuild(guild);
}
