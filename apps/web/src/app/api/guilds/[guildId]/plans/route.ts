import { NextResponse } from 'next/server';
import { prisma } from '@dpd/database';
import { canReadGuild, getSession } from '@/lib/session';

type IncomingOperation = {
  kind: string;
  targetId: string;
  before: unknown;
  after: unknown;
  warnings?: string[];
};

function json(value: unknown): never {
  return value as never;
}

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as { operations?: IncomingOperation[]; reason?: string };
  const operations = (body.operations ?? []).filter((operation) => operation.kind && operation.targetId);
  if (operations.length === 0) return NextResponse.json({ error: 'No operations selected' }, { status: 400 });

  const plan = await prisma.permissionChangePlan.create({
    data: {
      guildId,
      createdByDiscordUserId: session.user.id,
      reason: body.reason?.trim() || null,
      warnings: json(operations.flatMap((operation) => operation.warnings ?? [])),
      operations: {
        create: operations.map((operation, index) => ({
          kind: operation.kind,
          targetId: operation.targetId,
          before: json(operation.before),
          after: json(operation.after),
          warnings: json(operation.warnings ?? []),
          order: index,
        })),
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ planId: plan.id });
}
