import { cookies } from 'next/headers';
import crypto from 'node:crypto';

export interface DiscordSession {
  user: { id: string; username: string; avatar?: string | null };
  guilds: DiscordUserGuild[];
  createdAt: number;
}

export interface DiscordUserGuild {
  id: string;
  name: string;
  icon?: string | null;
  owner: boolean;
  permissions: string;
}

const cookieName = 'dpd_session';

function secret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-insecure-change-me';
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeSession(session: DiscordSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value?: string): DiscordSession | null {
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature || sign(payload) !== signature) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DiscordSession;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<DiscordSession | null> {
  return decodeSession((await cookies()).get(cookieName)?.value);
}

export async function setSession(session: DiscordSession): Promise<void> {
  (await cookies()).set(cookieName, encodeSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(cookieName);
}

export function canReadGuild(guild: DiscordUserGuild): boolean {
  const administrator = 1n << 3n;
  return guild.owner || (BigInt(guild.permissions) & administrator) === administrator;
}
