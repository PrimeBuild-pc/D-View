import { NextResponse } from 'next/server';
import { prisma, toJson } from '@dpd/database';
import { indexSnapshot } from '@dpd/permission-engine';
import { canWriteGuild, getSession } from '@/lib/session';
import {
  PlanValidationError,
  createPlanSchema,
  loadBotContext,
  loadSnapshot,
  resolveEdits,
  serialiseOperation,
  warningsFor,
} from '@/lib/plans';

/** sameSite: 'lax' stops a cross-origin POST but not a same-site subdomain. */
function wrongOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin) && origin !== new URL(request.url).origin;
}

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  if (wrongOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });

  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canWriteGuild(guild));
  if (!allowed || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = createPlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const loaded = await loadSnapshot(guildId, parsed.data.baseSnapshotId);
  if (loaded.status === 'none') return NextResponse.json({ error: 'No snapshot found' }, { status: 404 });
  if (loaded.status === 'outdated') {
    return NextResponse.json({ error: 'Snapshot predates the current schema. Re-sync this guild.' }, { status: 409 });
  }

  try {
    // Operations are rebuilt from the snapshot, so nothing the client claimed
    // about before/after — or about risk — is trusted.
    const operations = await resolveEdits(guildId, parsed.data.edits, loaded.snapshot);
    if (operations.length === 0) return NextResponse.json({ error: 'No operations' }, { status: 400 });

    const bot = await loadBotContext(guildId, indexSnapshot(loaded.snapshot));
    const warnings = warningsFor(operations, loaded.snapshot, bot);

    const plan = await prisma.permissionChangePlan.create({
      data: {
        guildId,
        createdByDiscordUserId: session.user.id,
        reason: parsed.data.reason?.trim() || null,
        baseSnapshotId: loaded.id,
        warnings: toJson(warnings),
        operations: { create: operations.map(serialiseOperation) },
      },
      select: { id: true },
    });

    return NextResponse.json({ planId: plan.id, warnings });
  } catch (error) {
    if (error instanceof PlanValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
