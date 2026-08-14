import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@dpd/database';
import { t, fill } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { deserialiseOperation, loadSnapshot, type PlanWarning } from '@/lib/plans';
import { canWriteGuild } from '@/lib/session';
import { writeWindow } from '@/lib/writes';
import { WriteToggle } from '@/components/write-toggle';
import { Badge, Card, CardBody, LinkButton, Notice, SectionTitle } from '@/components/ui';
import { OperationSummary } from '@/components/operation-summary';
import { RelativeTime } from '@/components/relative-time';
import { opStatusLabel, opStatusTone, planStatusLabel, planStatusTone } from '@/lib/plan-status';
import { ApplyForm } from './apply-form';
import { RollbackButton } from './rollback-button';

export const dynamic = 'force-dynamic';

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; planId: string }>;
  searchParams: Promise<{ execute?: string }>;
}) {
  const { guildId, planId } = await params;
  const [access, query, lang] = await Promise.all([guildAccess(guildId), searchParams, resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  const plan = await prisma.permissionChangePlan.findFirst({
    where: { id: planId, guildId },
    include: {
      operations: { orderBy: { order: 'asc' } },
      executions: { orderBy: { startedAt: 'desc' }, include: { results: true } },
    },
  });
  if (!plan) notFound();

  const load = await loadSnapshot(guildId, plan.baseSnapshotId ?? undefined);
  const snapshot = load.status === 'ok' ? load.snapshot : null;
  const warnings = (plan.warnings as unknown as PlanWarning[]) ?? [];
  const critical = warnings.filter((warning) => warning.severity === 'critical');
  const writes = await writeWindow(guildId);
  const canApply = plan.status === 'draft' && canWriteGuild(access.guild);
  const latestExecution = plan.executions[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/guilds/${guildId}/changes`} className="text-sm text-ink-muted hover:text-ink">
          ← {copy.changes.title}
        </Link>
        <Badge tone={planStatusTone(plan.status)}>{planStatusLabel(plan.status, copy)}</Badge>
        <span className="text-xs text-ink-faint">
          <RelativeTime date={plan.createdAt.toISOString()} lang={lang} />
        </span>
      </div>

      {plan.reason ? <p className="text-sm text-ink-muted">{plan.reason}</p> : null}

      {/* Execution outcome, in words. It used to be the raw code — "Execute
          status: confirm." — inside an amber box used for success too. */}
      {query.execute ? <ExecuteNotice status={query.execute} copy={copy} /> : null}

      {/* Warnings lead. They were previously buried inside a collapsed <details>
          inside a JSON dump, on the one screen with an Apply button. */}
      {warnings.length > 0 ? (
        <div className="space-y-2">
          {warnings.map((warning, position) => (
            <Notice key={position} tone={warning.severity === 'critical' ? 'critical' : 'warning'}>
              {fill(copy.warning[warning.code], warning.params)}
            </Notice>
          ))}
        </div>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          <SectionTitle>
            {fill(
              copy.changes.operations.split('|')[plan.operations.length === 1 ? 0 : 1] ??
                copy.changes.operations,
              { count: plan.operations.length },
            )}
          </SectionTitle>
          {snapshot ? (
            <ul className="space-y-1.5">
              {plan.operations.map((row) => (
                <li key={row.id}>
                  <OperationSummary
                    operation={deserialiseOperation(row)}
                    snapshot={snapshot}
                    copy={copy}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <Notice tone="warning" title={copy.sync.outdated}>
              {copy.sync.outdatedHelp}
            </Notice>
          )}
        </CardBody>
      </Card>

      {canApply ? (
        <Card className="border-critical/30">
          <CardBody className="space-y-3">
            {!writes.enabled ? (
              /* Unlocking is offered right here, so applying a plan does not
                 mean leaving the page to go and edit a file. */
              <WriteToggle guildId={guildId} window={writes} copy={copy} lang={lang} />
            ) : (
              <ApplyForm
                action={`/api/guilds/${guildId}/plans/${planId}/execute`}
                guildName={access.guild.name}
                risky={critical.length > 0}
                copy={copy}
              />
            )}
          </CardBody>
        </Card>
      ) : null}

      {plan.executions.length > 0 ? (
        <Card>
          <CardBody className="space-y-3">
            <SectionTitle>{copy.common.status}</SectionTitle>
            {latestExecution?.status === 'partial' ? (
              <Notice tone="warning">{copy.changes.partialWarning}</Notice>
            ) : null}
            {latestExecution?.results.some((result) => result.status === 'unknown') ? (
              <Notice tone="critical">{copy.changes.unknownWarning}</Notice>
            ) : null}

            {/* Per-operation results. The old page stored one opaque JSON blob,
                so a partly-applied plan left you unable to tell what landed. */}
            <ul className="space-y-1">
              {latestExecution?.results.map((result) => {
                const row = plan.operations.find((operation) => operation.id === result.operationId);
                return (
                  <li key={result.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={opStatusTone(result.status)}>{opStatusLabel(result.status, copy)}</Badge>
                    <span className="text-ink-muted">
                      {row?.channelId ?? row?.roleId ?? ''}
                    </span>
                    {result.detail ? <span className="text-xs text-ink-faint">{result.detail}</span> : null}
                  </li>
                );
              })}
            </ul>

            {latestExecution && ['applied', 'partial'].includes(plan.status) && canWriteGuild(access.guild) ? (
              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-sm text-ink-muted">{copy.changes.rollbackHelp}</p>
                <RollbackButton
                  guildId={guildId}
                  planId={planId}
                  label={copy.changes.rollback}
                  pending={copy.common.loading}
                />
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <div>
        <LinkButton href={`/guilds/${guildId}/explorer`}>{copy.nav.explorer}</LinkButton>
      </div>
    </div>
  );
}

function ExecuteNotice({ status, copy }: { status: string; copy: ReturnType<typeof t> }) {
  const map: Record<string, { tone: 'allow' | 'warning' | 'critical'; text: string }> = {
    applied: { tone: 'allow', text: copy.changes.statusApplied },
    partial: { tone: 'warning', text: copy.changes.partialWarning },
    failed: { tone: 'critical', text: copy.changes.statusFailed },
    disabled: { tone: 'warning', text: copy.writes.offHelp },
    confirm: { tone: 'warning', text: copy.changes.confirmMismatch },
    unauthorized: { tone: 'critical', text: copy.auth.notAuthorized },
    'missing-token': { tone: 'warning', text: copy.sync.missingToken },
    missing: { tone: 'critical', text: copy.common.notFound },
    'already-running': { tone: 'warning', text: copy.changes.statusExecuting },
  };
  const entry = map[status];
  if (!entry) return null;
  return <Notice tone={entry.tone}>{entry.text}</Notice>;
}
