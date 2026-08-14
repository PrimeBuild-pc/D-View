import { NextResponse } from 'next/server';
import { diffSnapshots, indexSnapshot } from '@dpd/permission-engine';
import { fromBits, permissionSnapshotSchema, snapshotVersionOf, SNAPSHOT_SCHEMA_VERSION, type PermissionSnapshot } from '@dpd/shared';
import { canReadGuild, getSession } from '@/lib/session';
import { loadBotContext, loadSnapshot, warningsFor } from '@/lib/plans';

/** A guild snapshot is a few hundred KB; anything far larger is not a snapshot. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Import is too large to be a guild snapshot.' }, { status: 413 });
  }

  const loaded = await loadSnapshot(guildId);
  if (loaded.status === 'none') return NextResponse.json({ error: 'No current snapshot. Sync this guild first.' }, { status: 404 });
  if (loaded.status === 'outdated') {
    return NextResponse.json({ error: 'Stored snapshot predates the current schema. Re-sync this guild.' }, { status: 409 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'That is not valid JSON.' }, { status: 400 });
  }

  const version = snapshotVersionOf(body);
  if (version && version !== SNAPSHOT_SCHEMA_VERSION) {
    return NextResponse.json(
      {
        error: `This file uses snapshot format ${version}; this version of D-View reads ${SNAPSHOT_SCHEMA_VERSION}. Export a fresh snapshot and edit that instead — older files stored permission names, which cannot be converted back to bitfields without losing permissions.`,
      },
      { status: 409 },
    );
  }

  const parsed = permissionSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'The uploaded snapshot does not match the expected format.',
        issues: parsed.error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
      { status: 400 },
    );
  }

  const candidate = parsed.data as PermissionSnapshot;
  if (candidate.guild.id !== guildId) {
    return NextResponse.json({ error: 'This snapshot belongs to a different server.' }, { status: 400 });
  }

  try {
    const operations = diffSnapshots(loaded.snapshot, candidate);
    const bot = await loadBotContext(guildId, indexSnapshot(loaded.snapshot));
    const warnings = warningsFor(operations, loaded.snapshot, bot);
    return NextResponse.json({
      status: 'validated',
      guildId,
      baseSnapshotId: loaded.id,
      // Bitfields go over the wire as decimal strings; JSON has no bigint.
      operations: operations.map((operation) => ({
        ...operation,
        touched: fromBits(operation.touched),
        nextAllow: fromBits(operation.nextAllow),
        nextDeny: fromBits(operation.nextDeny),
        expectedAllow: fromBits(operation.expectedAllow),
        expectedDeny: fromBits(operation.expectedDeny),
      })),
      warnings,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid import' }, { status: 400 });
  }
}
