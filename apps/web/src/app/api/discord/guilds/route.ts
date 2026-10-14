import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readableGuilds } from '@/lib/guild';
import { requestError } from '@/lib/request';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json({ guilds: await readableGuilds(session) }, { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return requestError(error); }
}
