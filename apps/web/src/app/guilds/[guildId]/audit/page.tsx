import Link from 'next/link';
import { auditSnapshot, type AuditSeverity } from '@dpd/permission-engine';
import { t, fill } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { loadSnapshot } from '@/lib/plans';
import { Badge, Card, CardBody, EmptyState, cx } from '@/components/ui';
import { SnapshotGate } from '@/components/snapshot-gate';

export const dynamic = 'force-dynamic';

const tones: Record<AuditSeverity, 'critical' | 'warning' | 'info'> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
};

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ severity?: string }>;
}) {
  const { guildId } = await params;
  const [access, query, lang] = await Promise.all([guildAccess(guildId), searchParams, resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  const load = await loadSnapshot(guildId);
  if (load.status !== 'ok') return <SnapshotGate load={load} copy={copy} guildId={guildId} />;

  // Computed on read. The AuditFinding table was written on every sync and never
  // read by anything, so it has been removed.
  const all = auditSnapshot(load.snapshot);
  const active = (['critical', 'warning', 'info'] as const).includes(query.severity as AuditSeverity)
    ? (query.severity as AuditSeverity)
    : null;
  const findings = active ? all.filter((finding) => finding.severity === active) : all;

  const counts = {
    critical: all.filter((finding) => finding.severity === 'critical').length,
    warning: all.filter((finding) => finding.severity === 'warning').length,
    info: all.filter((finding) => finding.severity === 'info').length,
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{copy.audit.title}</h1>

      <div className="flex flex-wrap gap-2">
        <FilterChip href={`/guilds/${guildId}/audit`} active={!active} label={`${copy.common.all} (${all.length})`} />
        {(['critical', 'warning', 'info'] as const).map((severity) => (
          <FilterChip
            key={severity}
            href={`/guilds/${guildId}/audit?severity=${severity}`}
            active={active === severity}
            label={`${copy.audit[severity]} (${counts[severity]})`}
          />
        ))}
      </div>

      {findings.length === 0 ? (
        <EmptyState title={copy.audit.empty} description={copy.audit.emptyHelp} />
      ) : (
        <ul className="space-y-2">
          {/* No cap. The old view showed eight and sorted the least urgent first. */}
          {findings.map((finding, position) => (
            <li key={`${finding.code}-${position}`}>
              <Card>
                <CardBody className="flex flex-wrap items-start gap-3 py-3">
                  <Badge tone={tones[finding.severity]}>{copy.audit[finding.severity]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{fill(copy.audit[finding.code], finding.params)}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {fill(copy.audit[`${finding.code}Help` as keyof typeof copy.audit], finding.params)}
                    </p>
                  </div>
                  {/* Every finding links to the exact place that produced it —
                      channelId/roleId were carried and never rendered. */}
                  {finding.channelId || finding.roleId ? (
                    <Link
                      href={`/guilds/${guildId}/explorer?${new URLSearchParams({
                        ...(finding.channelId ? { channel: finding.channelId } : {}),
                        ...(finding.roleId ? { role: finding.roleId } : {}),
                      })}`}
                      className="text-sm whitespace-nowrap text-ink-muted hover:text-ink"
                    >
                      {copy.audit.inspect} →
                    </Link>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cx(
        'rounded-full px-3 py-1 text-xs',
        active ? 'bg-brand text-white' : 'bg-surface-overlay text-ink-muted hover:text-ink',
      )}
    >
      {label}
    </Link>
  );
}
