import { NextResponse } from 'next/server';
import { prisma } from '@dpd/database';
import { permissionSnapshotSchema } from '@dpd/shared';
import { canReadGuild, getSession } from '@/lib/session';

export async function GET(_request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const latest = await prisma.permissionSnapshot.findFirst({ where: { guildId }, orderBy: { createdAt: 'desc' } });
  if (!latest) return NextResponse.json({ error: 'No snapshot found' }, { status: 404 });

  const snapshot = permissionSnapshotSchema.parse(latest.data);
  const body = JSON.stringify(snapshot, null, 2);
  const safeName = snapshot.guild.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || guildId;

  return new NextResponse(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${safeName}-permissions-${latest.id}.json"`,
    },
  });
}
