import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_MAX_AGE_SECONDS, setSession } from '@/lib/session';
import { appUrl, requestError } from '@/lib/request';

const tokenSchema = z.object({ access_token: z.string().min(1).max(512), expires_in: z.number().int().positive() });
const userSchema = z.object({ id: z.string().regex(/^\d{1,20}$/), username: z.string().min(1).max(100), avatar: z.string().nullable().optional() });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('dpd_oauth_state')?.value;
  cookieStore.delete('dpd_oauth_state');
  if (!code || code.length > 1024 || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  }
  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) return NextResponse.json({ error: 'Discord OAuth env missing' }, { status: 503 });
    const base = appUrl();
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code',
        code, redirect_uri: new URL('/api/auth/callback', base).toString() }),
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) return NextResponse.json({ error: 'Discord token exchange failed' }, { status: 502 });
    const token = tokenSchema.parse(await tokenResponse.json());
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { authorization: `Bearer ${token.access_token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!userResponse.ok) return NextResponse.json({ error: 'Discord user fetch failed' }, { status: 502 });
    const user = userSchema.parse(await userResponse.json());
    const createdAt = Date.now();
    await setSession({ user, accessToken: token.access_token, createdAt,
      expiresAt: createdAt + Math.min(token.expires_in, SESSION_MAX_AGE_SECONDS) * 1000 });
    return NextResponse.redirect(new URL('/guilds', base));
  } catch (error) { return requestError(error); }
}
