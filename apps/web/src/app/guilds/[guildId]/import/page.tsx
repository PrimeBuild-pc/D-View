import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { loadSnapshot } from '@/lib/plans';
import { LinkButton } from '@/components/ui';
import { SnapshotGate } from '@/components/snapshot-gate';
import { ImportForm } from './import-form';

export const dynamic = 'force-dynamic';

export default async function ImportPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const [access, lang] = await Promise.all([guildAccess(guildId), resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  const load = await loadSnapshot(guildId);
  if (load.status !== 'ok') return <SnapshotGate load={load} copy={copy} guildId={guildId} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{copy.importPage.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{copy.importPage.help}</p>
      </div>
      {/* A link to obtain a valid starting file, which the old page never offered. */}
      <LinkButton href={`/api/guilds/${guildId}/snapshot`}>{copy.sync.exportSnapshot}</LinkButton>
      <ImportForm copy={copy} guildId={guildId} snapshot={load.snapshot} />
    </div>
  );
}
