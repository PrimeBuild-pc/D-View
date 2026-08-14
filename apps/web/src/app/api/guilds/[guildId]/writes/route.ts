import { NextResponse } from 'next/server';
import { canWriteGuild, getSession } from '@/lib/session';
import {
  disableWrites,
  enableWrites,
  setWriteMode,
  writesForcedAlways,
  writesLocked,
  type WriteMode,
} from '@/lib/writes';

/**
 * Change the write policy, or turn writing on and off within it.
 *
 * Same authorisation as applying a plan. This is a convenience over editing a
 * file and restarting, not a second security boundary — `canWriteGuild` and the
 * per-plan confirmation are the boundaries, and both still apply.
 */
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canWriteGuild(guild));
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (writesLocked() || writesForcedAlways()) {
    return NextResponse.json(
      { error: 'Write access is fixed by configuration and cannot be changed from the dashboard.' },
      { status: 403 },
    );
  }

  const form = await request.formData().catch(() => null);
  const action = form?.get('action');
  const back = new URL(`/guilds/${guildId}/settings`, request.url);

  if (action === 'mode') {
    const mode = form?.get('mode') === 'always' ? 'always' : 'window';
    await setWriteMode(guildId, mode as WriteMode);
    back.searchParams.set('writes', 'mode');
    back.searchParams.set('mode', mode);
    return NextResponse.redirect(back, 303);
  }

  if (action === 'enable') {
    const mode = form?.get('mode') === 'always' ? 'always' : 'window';
    const until = await enableWrites(guildId, mode as WriteMode);
    back.searchParams.set('writes', 'opened');
    if (until) back.searchParams.set('until', until.toISOString());
    return NextResponse.redirect(back, 303);
  }

  await disableWrites(guildId);
  back.searchParams.set('writes', 'closed');
  return NextResponse.redirect(back, 303);
}
