import { Card, CardBody } from '@/components/ui';

/** There were no loading, error or not-found boundaries at all: every page blocked on Prisma and a full zod parse before the first byte. */
export default function Loading() {
  return (
    <div className="space-y-3">
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
