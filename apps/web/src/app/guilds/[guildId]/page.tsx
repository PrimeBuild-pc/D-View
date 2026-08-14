import Link from 'next/link';
import { auditSnapshot } from '@dpd/permission-engine';
import { channelKind, type PermissionSnapshot } from '@dpd/shared';
import { t, fill, type Dict, type Lang } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { loadSnapshot } from '@/lib/plans';
import { Badge, Card, CardBody, LinkButton, Notice, SectionTitle, Stat } from '@/components/ui';
import { SnapshotGate } from '@/components/snapshot-gate';
import { RelativeTime } from '@/components/relative-time';
import { WriteToggle } from '@/components/write-toggle';
import { writeWindow } from '@/lib/writes';
import { canWriteGuild } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ sync?: string; detail?: string; writes?: string }>;
}) {
  const { guildId } = await params;
  const [access, query, lang] = await Promise.all([guildAccess(guildId), searchParams, resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  const [load, writes] = await Promise.all([loadSnapshot(guildId), writeWindow(guildId)]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{copy.overview.title}</h1>
        {load.status === 'ok' ? (
          <div className="flex flex-wrap gap-2">
            {/* Export is a plain link, so it needs no client state. */}
            <LinkButton href={`/api/guilds/${guildId}/snapshot`}>{copy.sync.exportSnapshot}</LinkButton>
            <LinkButton href={`/guilds/${guildId}/import`}>{copy.nav.importJson}</LinkButton>
            <LinkButton href={`/guilds/${guildId}/explorer`} tone="primary">
              {copy.nav.explorer}
            </LinkButton>
          </div>
        ) : null}
      </div>

      {/* Success and failure are visually distinct now; both used to render as
          the page heading in the same neutral style. */}
      {query.sync === 'ok' ? <Notice tone="allow">{copy.sync.ok}</Notice> : null}
      {query.sync === 'failed' ? (
        <Notice tone="critical" title={copy.sync.failed}>
          {query.detail ? <code className="text-xs break-all">{query.detail}</code> : null}
        </Notice>
      ) : null}
      {query.sync === 'missing-token' ? (
        <Notice tone="warning" title={copy.sync.missingToken}>
          <Link href="/setup" className="underline">
            {copy.nav.setup}
          </Link>
        </Notice>
      ) : null}

      {query.writes === 'opened' ? <Notice tone="warning">{copy.writes.opened}</Notice> : null}
      {query.writes === 'closed' ? <Notice tone="allow">{copy.writes.closed}</Notice> : null}

      {canWriteGuild(access.guild) ? (
        <WriteToggle guildId={guildId} window={writes} copy={copy} lang={lang} />
      ) : null}

      {load.status !== 'ok' ? (
        <SnapshotGate load={load} copy={copy} guildId={guildId} />
      ) : (
        <OverviewBody snapshot={load.snapshot} createdAt={load.createdAt} copy={copy} lang={lang} guildId={guildId} />
      )}
    </div>
  );
}

function OverviewBody({
  snapshot,
  createdAt,
  copy,
  lang,
  guildId,
}: {
  snapshot: PermissionSnapshot;
  createdAt: Date;
  copy: Dict;
  lang: Lang;
  guildId: string;
}) {
  const findings = auditSnapshot(snapshot);
  const critical = findings.filter((finding) => finding.severity === 'critical');
  const warnings = findings.filter((finding) => finding.severity === 'warning');
  const categories = snapshot.channels.filter((channel) => channelKind(channel.type) === 'category');

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-faint">
        <RelativeTime date={createdAt.toISOString()} lang={lang} />
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={copy.overview.roles} value={snapshot.roles.length} />
        <Stat label={copy.overview.channels} value={snapshot.channels.length - categories.length} />
        <Stat label={copy.overview.categories} value={categories.length} />
        <Stat
          label={copy.overview.critical}
          value={critical.length}
          {...(critical.length > 0 ? { tone: 'critical' as const } : {})}
        />
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>{copy.overview.riskiest}</SectionTitle>
            <Link href={`/guilds/${guildId}/audit`} className="text-sm text-ink-muted hover:text-ink">
              {copy.nav.audit} →
            </Link>
          </div>
          {critical.length === 0 && warnings.length === 0 ? (
            <p className="text-sm text-ink-muted">{copy.overview.healthy}</p>
          ) : (
            <ul className="space-y-2">
              {/* Critical first — the old list sorted admin warnings ahead of
                  everything and then truncated at eight, hiding every critical. */}
              {[...critical, ...warnings].slice(0, 5).map((finding, position) => (
                <li key={`${finding.code}-${position}`} className="flex items-start gap-2 text-sm">
                  <Badge tone={finding.severity === 'critical' ? 'critical' : 'warning'}>
                    {finding.severity === 'critical' ? copy.audit.critical : copy.audit.warning}
                  </Badge>
                  <span className="text-ink-muted">
                    {fill(copy.audit[finding.code], finding.params)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
