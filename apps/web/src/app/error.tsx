'use client';

import { Button, Card, CardBody } from '@/components/ui';
import { useLocale } from '@/components/locale-provider';
import { localizedError, t } from '@/lib/i18n';

export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const copy = t(useLocale());
  return (
    <Card className="mx-auto max-w-xl">
      <CardBody className="space-y-3">
        <h1 className="text-lg font-semibold">{copy.common.somethingWentWrong}</h1>
        <p className="text-sm text-ink-muted">{localizedError(copy, error)}</p>
        <div className="flex gap-2">
          <Button onClick={reset} tone="primary">{copy.common.retry}</Button>
          <a href="/setup" className="inline-flex items-center rounded-lg border border-line-strong bg-surface-overlay px-3.5 py-2 text-sm">{copy.nav.setup}</a>
        </div>
      </CardBody>
    </Card>
  );
}
