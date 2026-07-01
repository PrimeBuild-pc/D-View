import { NextResponse } from 'next/server';
import { diffSnapshots } from '@dpd/permission-engine';
import { prisma } from '@dpd/database';
import { permissionSnapshotSchema, type PermissionSnapshot } from '@dpd/shared';
import { canReadGuild, getSession } from '@/lib/session';

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const latest = await prisma.permissionSnapshot.findFirst({ where: { guildId }, orderBy: { createdAt: 'desc' } });
  if (!latest) return NextResponse.json({ error: 'No current snapshot found' }, { status: 404 });

  try {
    const current = permissionSnapshotSchema.parse(latest.data) as PermissionSnapshot;
    const candidate = permissionSnapshotSchema.parse(await request.json()) as PermissionSnapshot;
    const operations = diffSnapshots(current, candidate);
    return NextResponse.json({
      status: 'validated',
      guildId,
      operations,
      warnings: operations.flatMap((operation) => operation.warnings),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid import' }, { status: 400 });
  }
}
