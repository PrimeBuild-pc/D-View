'use client';

import { Button, Card, CardBody } from '@/components/ui';

export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardBody className="space-y-3">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        {/* The message is shown rather than swallowed: a missing AUTH_SECRET or an
            unreachable database surfaces here, and both name their own fix. */}
        <p className="text-sm text-ink-muted">{error.message}</p>
        <div className="flex gap-2">
          <Button onClick={reset} tone="primary">Try again</Button>
          <a href="/setup" className="inline-flex items-center rounded-lg border border-line-strong bg-surface-overlay px-3.5 py-2 text-sm">Setup</a>
        </div>
      </CardBody>
    </Card>
  );
}
