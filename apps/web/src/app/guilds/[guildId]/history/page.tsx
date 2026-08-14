import Link from 'next/link';
import { prisma } from '@dpd/database';
import { diffSnapshots } from '@dpd/permission-engine';
import { permissionSnapshotSchema, isCurrentSnapshot, type PermissionSnapshot } from '@dpd/shared';
import { t, fill } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { Badge, Card, CardBody, EmptyState, Notice, SectionTitle, cx } from '@/components/ui';
import { RelativeTime } from '@/components/relative-time';
import { OperationSummary } from '@/components/operation-summary';

export const dynamic = 'force-dynamic';

function parse(data: unknown): PermissionSnapshot | null {
  if (!isCurrentSnapshot(data)) return null;
  const parsed = permissionSnapshotSchema.safeParse(data);
  return parsed.success ? (parsed.data as PermissionSnapshot) : null;
}

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { guildId } = await params;
  const [access, query, lang] = await Promise.all([guildAccess(guildId), searchParams, resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  // Snapshots were written on every sync and every pre-apply backup, and the UI
  // only ever read the newest one. There was no way to browse or compare them.
  const snapshots = await prisma.permissionSnapshot.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, createdAt: true, reason: true, version: true },
  });

  if (snapshots.length === 0) {
    return <EmptyState title={copy.history.empty} description={copy.history.help} />;
  }

  const from = query.from ?? snapshots[1]?.id ?? snapshots[0]!.id;
  const to = query.to ?? snapshots[0]!.id;

  const [fromRow, toRow] = await Promise.all([
    prisma.permissionSnapshot.findFirst({ where: { id: from, guildId } }),
    prisma.permissionSnapshot.findFirst({ where: { id: to, guildId } }),
  ]);

  const fromSnapshot = fromRow ? parse(fromRow.data) : null;
  const toSnapshot = toRow ? parse(toRow.data) : null;

  let operations: ReturnType<typeof diffSnapshots> = [];
  let diffError: string | null = null;
  if (fromSnapshot && toSnapshot) {
    try {
      operations = diffSnapshots(fromSnapshot, toSnapshot);
    } catch (error) {
      diffError = error instanceof Error ? error.message : String(error);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{copy.history.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{copy.history.help}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card>
          <CardBody className="p-2">
            <ul className="max-h-[32rem] space-y-0.5 overflow-y-auto">
              {snapshots.map((snapshot) => {
                const isFrom = snapshot.id === from;
                const isTo = snapshot.id === to;
                return (
                  <li key={snapshot.id}>
                    <div
                      className={cx(
                        'rounded-lg px-2 py-1.5 text-sm',
                        isFrom || isTo ? 'bg-surface-overlay' : '',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <RelativeTime date={snapshot.createdAt.toISOString()} lang={lang} />
                        <span className="flex gap-1">
                          <Link
                            href={`?from=${snapshot.id}&to=${to}`}
                            className={cx('text-[11px]', isFrom ? 'text-brand' : 'text-ink-faint hover:text-ink')}
                          >
                            {copy.history.compareFrom}
                          </Link>
                          <Link
                            href={`?from=${from}&to=${snapshot.id}`}
                            className={cx('text-[11px]', isTo ? 'text-brand' : 'text-ink-faint hover:text-ink')}
                          >
                            {copy.history.compareTo}
                          </Link>
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-faint">
                        {snapshot.reason?.startsWith('pre-apply')
                          ? copy.history.reasonBackup
                          : copy.history.reasonSync}
                        {snapshot.version !== '2.0.0' ? (
                          <Badge tone="warning" className="ml-2">
                            {snapshot.version}
                          </Badge>
                        ) : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <SectionTitle>{copy.history.compare}</SectionTitle>
            {!fromSnapshot || !toSnapshot ? (
              <Notice tone="warning" title={copy.sync.outdated}>
                {copy.sync.outdatedHelp}
              </Notice>
            ) : diffError ? (
              <Notice tone="critical">{diffError}</Notice>
            ) : operations.length === 0 ? (
              <p className="text-sm text-ink-muted">{copy.history.noChanges}</p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  {fill(
                    copy.history.changeCount.split('|')[operations.length === 1 ? 0 : 1] ??
                      copy.history.changeCount,
                    { count: operations.length },
                  )}
                </p>
                <ul className="space-y-1">
                  {operations.map((operation, position) => (
                    <li key={position}>
                      <OperationSummary
                        operation={operation}
                        snapshot={toSnapshot}
                        copy={copy}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
