import { NextResponse } from 'next/server';
import { guildAccess } from '@/lib/guild';
import { loadSnapshot } from '@/lib/plans';

export async function GET(_request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  if (!(await guildAccess(guildId))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const latest = await loadSnapshot(guildId);
  if (latest.status !== 'ok') return NextResponse.json({ error: 'No usable snapshot. Re-sync this server.' }, { status: 409 });
  const snapshot = latest.snapshot;
  const body = JSON.stringify(snapshot, null, 2);
  const safeName = snapshot.guild.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || guildId;

  return new NextResponse(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${safeName}-permissions-${latest.id}.json"`,
    },
  });
}
