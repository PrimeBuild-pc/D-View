import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { loadSnapshot } from '@/lib/plans';
import { canWriteGuild } from '@/lib/session';
import { SnapshotGate } from '@/components/snapshot-gate';
import { Explorer } from './explorer';

export const dynamic = 'force-dynamic';

export default async function ExplorerPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ role?: string; channel?: string }>;
}) {
  const { guildId } = await params;
  const [access, query, lang] = await Promise.all([guildAccess(guildId), searchParams, resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  const load = await loadSnapshot(guildId);
  if (load.status !== 'ok') return <SnapshotGate load={load} copy={copy} guildId={guildId} />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{copy.explorer.title}</h1>
      <Explorer
        snapshot={load.snapshot}
        copy={copy}
        guildId={guildId}
        baseSnapshotId={load.id}
        canWrite={canWriteGuild(access.guild)}
        {...(query.role ? { initialRoleId: query.role } : {})}
        {...(query.channel ? { initialChannelId: query.channel } : {})}
      />
    </div>
  );
}
