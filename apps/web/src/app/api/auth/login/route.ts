import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export async function GET(request: Request) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'DISCORD_CLIENT_ID missing' }, { status: 500 });

  const state = crypto.randomBytes(16).toString('base64url');
  (await cookies()).set('dpd_oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });

  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', new URL('/api/auth/callback', request.url).toString());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url);
}
