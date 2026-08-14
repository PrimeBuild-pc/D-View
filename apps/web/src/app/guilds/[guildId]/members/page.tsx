import { prisma } from '@dpd/database';
import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { loadSnapshot } from '@/lib/plans';
import { SnapshotGate } from '@/components/snapshot-gate';
import { MemberBulk, MemberLookup } from './members';

export const dynamic = 'force-dynamic';

export default async function MembersPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const [access, lang] = await Promise.all([guildAccess(guildId), resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  const load = await loadSnapshot(guildId);
  if (load.status !== 'ok') return <SnapshotGate load={load} copy={copy} guildId={guildId} />;

  const [count, guild] = await Promise.all([
    prisma.guildMember.count({ where: { guildId } }),
    prisma.discordGuild.findUnique({ where: { id: guildId }, select: { membersSyncedAt: true } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{copy.members.title}</h1>
      <MemberLookup snapshot={load.snapshot} copy={copy} guildId={guildId} />
      <MemberBulk
        copy={copy}
        guildId={guildId}
        count={count}
        syncedAt={guild?.membersSyncedAt?.toISOString() ?? null}
      />
    </div>
  );
}
