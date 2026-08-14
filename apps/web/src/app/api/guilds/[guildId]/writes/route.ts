import { NextResponse } from 'next/server';
import { canWriteGuild, getSession } from '@/lib/session';
import { closeWriteWindow, openWriteWindow, writesLocked } from '@/lib/writes';

/**
 * Open or close the window in which D-View may write to Discord.
 *
 * Same authorisation as applying a plan — this toggle is a convenience over
 * editing `.env` and restarting, not a second security boundary. The boundary is
 * `canWriteGuild` plus the per-plan confirmation, both of which still apply.
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

  if (writesLocked()) {
    return NextResponse.json(
      { error: 'DISCORD_WRITES_LOCKED is set, so writes cannot be unlocked from the dashboard.' },
      { status: 403 },
    );
  }

  const form = await request.formData().catch(() => null);
  const enable = form?.get('enable') === 'true';

  if (enable) {
    const until = await openWriteWindow(guildId);
    return NextResponse.redirect(
      new URL(`/guilds/${guildId}?writes=opened&until=${until.toISOString()}`, request.url),
      303,
    );
  }

  await closeWriteWindow(guildId);
  return NextResponse.redirect(new URL(`/guilds/${guildId}?writes=closed`, request.url), 303);
}
