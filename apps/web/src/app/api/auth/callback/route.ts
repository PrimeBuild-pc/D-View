import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { canReadGuild, setSession, type DiscordUserGuild } from '@/lib/session';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('dpd_oauth_state')?.value;
  cookieStore.delete('dpd_oauth_state');

  if (!code || !state || state !== expectedState) return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.json({ error: 'Discord OAuth env missing' }, { status: 500 });

  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: new URL('/api/auth/callback', request.url).toString(),
    }),
  });
  if (!tokenResponse.ok) return NextResponse.json({ error: 'Discord token exchange failed' }, { status: 502 });
  const token = await tokenResponse.json() as { access_token: string };

  const headers = { authorization: `Bearer ${token.access_token}` };
  const [userResponse, guildsResponse] = await Promise.all([
    fetch('https://discord.com/api/users/@me', { headers }),
    fetch('https://discord.com/api/users/@me/guilds', { headers }),
  ]);
  if (!userResponse.ok || !guildsResponse.ok) return NextResponse.json({ error: 'Discord user fetch failed' }, { status: 502 });

  const user = await userResponse.json() as { id: string; username: string; avatar?: string | null };
  const rawGuilds = await guildsResponse.json() as Array<DiscordUserGuild & Record<string, unknown>>;
  const guilds = rawGuilds
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ?? null,
      owner: guild.owner,
      permissions: guild.permissions,
    }))
    .filter(canReadGuild);
  await setSession({ user, guilds, createdAt: Date.now() });

  return NextResponse.redirect(new URL('/guilds', request.url));
}
