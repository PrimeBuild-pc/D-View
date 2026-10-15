import { Card, CardBody } from '@/components/ui';
import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';

/** There were no loading, error or not-found boundaries at all: every page blocked on Prisma and a full zod parse before the first byte. */
export default async function Loading() {
  const copy = t(await resolveLang());
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label={copy.common.loading}>
      {[0, 1, 2].map((row) => (
        <Card key={row}>
          <CardBody>
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface-overlay" />
            <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-surface-overlay" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
