import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { loadSnapshot } from '@/lib/plans';
import { SnapshotGate } from '@/components/snapshot-gate';
import { Matrix } from './matrix';

export const dynamic = 'force-dynamic';

export default async function MatrixPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const [access, lang] = await Promise.all([guildAccess(guildId), resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  const load = await loadSnapshot(guildId);
  if (load.status !== 'ok') return <SnapshotGate load={load} copy={copy} guildId={guildId} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{copy.matrix.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{copy.matrix.help}</p>
      </div>
      <Matrix snapshot={load.snapshot} copy={copy} guildId={guildId} />
    </div>
  );
}
