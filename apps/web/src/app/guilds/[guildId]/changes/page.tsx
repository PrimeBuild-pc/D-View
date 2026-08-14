import Link from 'next/link';
import { prisma } from '@dpd/database';
import { t, fill } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { Badge, Card, CardBody, EmptyState, LinkButton } from '@/components/ui';
import { RelativeTime } from '@/components/relative-time';
import { planStatusTone, planStatusLabel } from '@/lib/plan-status';

export const dynamic = 'force-dynamic';

export default async function ChangesPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const [access, lang] = await Promise.all([guildAccess(guildId), resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  const plans = await prisma.permissionChangePlan.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { operations: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{copy.changes.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{copy.changes.help}</p>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          title={copy.changes.empty}
          description={copy.changes.emptyHelp}
          action={
            <LinkButton href={`/guilds/${guildId}/explorer`} tone="primary">
              {copy.nav.explorer}
            </LinkButton>
          }
        />
      ) : (
        <ul className="space-y-2">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link href={`/guilds/${guildId}/changes/${plan.id}`}>
                <Card className="transition hover:border-line-strong">
                  <CardBody className="flex flex-wrap items-center gap-3 py-3">
                    {/* A failed plan used to look identical to an applied one. */}
                    <Badge tone={planStatusTone(plan.status)}>{planStatusLabel(plan.status, copy)}</Badge>
                    <span className="text-sm">
                      {fill(
                        copy.changes.operations.split('|')[plan._count.operations === 1 ? 0 : 1] ??
                          copy.changes.operations,
                        { count: plan._count.operations },
                      )}
                    </span>
                    {plan.reason ? (
                      <span className="truncate text-sm text-ink-muted">{plan.reason}</span>
                    ) : null}
                    <span className="ml-auto text-xs text-ink-faint">
                      <RelativeTime date={plan.createdAt.toISOString()} lang={lang} />
                    </span>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
