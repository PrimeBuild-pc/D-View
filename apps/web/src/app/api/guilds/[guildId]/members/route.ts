import { NextResponse } from 'next/server';
import { prisma } from '@dpd/database';
import { DiscordError, discord, type DiscordMemberPayload } from '@/lib/discord';
import { authorizeGuild, guildAccess } from '@/lib/guild';
import { invalidOrigin } from '@/lib/request';
import { ABANDONED_AFTER_MS, EXECUTION_DEADLINE_MS } from '@/lib/recovery';

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
  if (!(await guildAccess(guildId))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    return NextResponse.json({ member: toView(member) }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof DiscordError && error.status === 404) {
      return NextResponse.json({ error: 'That user is not a member of this server.' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Member lookup failed. Check bot access or try again later.' },
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
  if (invalidOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const access = await guildAccess(guildId);
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await prisma.discordGuild.findUnique({ where: { id: guildId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Sync this server before importing members.' }, { status: 409 });
  }

  const runStartedAt = new Date();
  const claimed = await prisma.discordGuild.updateMany({
    where: { id: guildId, OR: [
      { membersSyncStartedAt: null }, { membersSyncStartedAt: { lt: new Date(Date.now() - ABANDONED_AFTER_MS) } },
    ] }, data: { membersSyncStartedAt: runStartedAt },
  });
  if (claimed.count !== 1) return NextResponse.json({ error: 'A member sync is already running for this server.' }, { status: 409 });
  let after = '0';
  let imported = 0;

  try {
    for (;;) {
      if (!(await authorizeGuild(access.session, guildId))) throw new Error('Server authorization changed.');
      const page = await discord<DiscordMemberPayload[]>(
        `/guilds/${guildId}/members?limit=1000&after=${after}`,
      );
      if (Date.now() - runStartedAt.getTime() > EXECUTION_DEADLINE_MS) throw new Error('Member sync timed out. Try again later.');
      if (page.length === 0) break;
      const next = page.at(-1)!.user.id;
      if (!/^\d{1,20}$/.test(next) || BigInt(next) <= BigInt(after)) throw new Error('Invalid member pagination.');

      await prisma.$transaction(async (tx) => {
        const owned = await tx.discordGuild.updateMany({
          where: { id: guildId, membersSyncStartedAt: runStartedAt }, data: { membersSyncStartedAt: runStartedAt },
        });
        if (owned.count !== 1 || Date.now() - runStartedAt.getTime() > EXECUTION_DEADLINE_MS) throw new Error('Member sync lease expired.');
        await Promise.all(page.map((member) => {
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
          return tx.guildMember.upsert({
            where: { guildId_userId: { guildId, userId: member.user.id } },
            create: { guildId, userId: member.user.id, ...row },
            update: row,
          });
        }));
      }, { timeout: 30_000 });

      imported += page.length;
      after = next;
      if (page.length < 1000) break;
    }

    // Pruning and completion share the lease lock; an abandoned run cannot prune a newer one.
    const pruned = await prisma.$transaction(async (tx) => {
      const owned = await tx.discordGuild.updateMany({
        where: { id: guildId, membersSyncStartedAt: runStartedAt }, data: { membersSyncedAt: runStartedAt },
      });
      if (owned.count !== 1 || Date.now() - runStartedAt.getTime() > EXECUTION_DEADLINE_MS) throw new Error('Member sync lease expired.');
      return tx.guildMember.deleteMany({ where: { guildId, syncedAt: { lt: runStartedAt } } });
    });

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
      { error: 'Member sync failed. Check bot access or try again later.' },
      { status: 502 },
    );
  } finally {
    await prisma.discordGuild.updateMany({
      where: { id: guildId, membersSyncStartedAt: runStartedAt }, data: { membersSyncStartedAt: null },
    });
  }
}
