import { NextResponse } from 'next/server';
import { guildAccess } from '@/lib/guild';
import { appUrl, invalidOrigin } from '@/lib/request';
import { snapshotGuild, storeSnapshot } from '@/lib/snapshots';

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  if (invalidOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  if (!(await guildAccess(guildId))) return NextResponse.redirect(new URL('/guilds?sync=unauthorized', appUrl()), 303);
  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.redirect(new URL(`/guilds/${guildId}?sync=missing-token`, appUrl()), 303);
  }
  try {
    await storeSnapshot(await snapshotGuild(guildId), 'rest-readonly-sync');
    return NextResponse.redirect(new URL(`/guilds/${guildId}?sync=ok`, appUrl()), 303);
  } catch (error) {
    // Do not place database connection strings or internal errors in redirects.
    console.error('Discord sync failed:', error instanceof Error ? error.name : 'Unknown error');
    return NextResponse.redirect(new URL(`/guilds/${guildId}?sync=failed`, appUrl()), 303);
  }
}
