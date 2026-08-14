import { NextResponse } from 'next/server';
import { prisma } from '@dpd/database';
import { DiscordError, discord, type DiscordMemberPayload } from '@/lib/discord';
import { canReadGuild, getSession } from '@/lib/session';

export const maxDuration = 300;

export interface MemberView {
  userId: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatar: string | null;
  roleIds: string[];
  joinedAt: string;
  timeoutUntil: string | null;
}

const toView = (member: DiscordMemberPayload): MemberView => ({
  userId: member.user.id,
  username: member.user.username,
  globalName: member.user.global_name ?? null,
  nick: member.nick ?? null,
  avatar: member.user.avatar,
  roleIds: member.roles,
  joinedAt: member.joined_at,
  timeoutUntil: member.communication_disabled_until ?? null,
});

/**
 * Look up one member.
 *
 * This endpoint needs no privileged intent, which is why it exists separately
 * from the bulk sync: it answers the question people actually ask ("why can't
 * this person see this channel?") on any installation, with no Developer Portal
 * configuration and no approval.
 */
export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const query = new URL(request.url).searchParams;
  const raw = query.get('user')?.trim() ?? '';
  // Accept a raw id or a <@id> / <@!id> mention pasted straight from Discord.
  const userId = raw.replace(/^<@!?/, '').replace(/>$/, '');
  if (!/^\d{5,25}$/.test(userId)) {
    return NextResponse.json({ error: 'Enter a Discord user ID or paste a mention.' }, { status: 400 });
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN is not configured.' }, { status: 503 });
  }

  try {
    const member = await discord<DiscordMemberPayload>(`/guilds/${guildId}/members/${userId}`);
    return NextResponse.json({ member: toView(member) });
  } catch (error) {
    if (error instanceof DiscordError && error.status === 404) {
      return NextResponse.json({ error: 'That user is not a member of this server.' }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Member lookup failed' },
      { status: 502 },
    );
  }
}

/**
 * Bulk member sync. Needs the GUILD_MEMBERS privileged intent, so it is opt-in
 * and degrades with an explicit message rather than failing obscurely.
 */
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const runStartedAt = new Date();
  let after = '0';
  let imported = 0;

  try {
    for (;;) {
      const page = await discord<DiscordMemberPayload[]>(
        `/guilds/${guildId}/members?limit=1000&after=${after}`,
      );
      if (page.length === 0) break;

      await prisma.$transaction(
        page.map((member) => {
          const row = {
            username: member.user.username,
            globalName: member.user.global_name ?? null,
            nick: member.nick ?? null,
            avatar: member.user.avatar,
            roleIds: member.roles,
            joinedAt: new Date(member.joined_at),
            pending: member.pending ?? false,
            timeoutUntil: member.communication_disabled_until
              ? new Date(member.communication_disabled_until)
              : null,
            // Set explicitly on every run so the prune below can rely on it.
            syncedAt: runStartedAt,
          };
          return prisma.guildMember.upsert({
            where: { guildId_userId: { guildId, userId: member.user.id } },
            create: { guildId, userId: member.user.id, ...row },
            update: row,
          });
        }),
      );

      imported += page.length;
      after = page[page.length - 1]!.user.id;
      if (page.length < 1000) break;
    }

    // Anyone not touched by this run has left the server.
    const pruned = await prisma.guildMember.deleteMany({
      where: { guildId, syncedAt: { lt: runStartedAt } },
    });
    await prisma.discordGuild.update({ where: { id: guildId }, data: { membersSyncedAt: runStartedAt } });

    return NextResponse.json({ imported, pruned: pruned.count });
  } catch (error) {
    if (error instanceof DiscordError && error.status === 403) {
      return NextResponse.json(
        {
          error:
            'Discord refused the member list. Enable the SERVER MEMBERS INTENT for this application in the Discord Developer Portal (Bot → Privileged Gateway Intents), then try again.',
          code: 'missing-intent',
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Member sync failed' },
      { status: 502 },
    );
  }
}
