'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Notice } from '@/components/ui';
import { localizedError, t, type Dict } from '@/lib/i18n';

/** Creates a rollback plan; it does not undo anything directly. The new plan goes through the same review and confirmation. */
export function RollbackButton({
  guildId,
  planId,
  label,
  pending,
  copy = t('en'),
}: {
  guildId: string;
  planId: string;
  label: string;
  pending: string;
  copy?: Dict;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/guilds/${guildId}/plans/${planId}/rollback`, { method: 'POST' });
      const payload = (await response.json()) as { planId?: string; error?: string };
      if (!response.ok || !payload.planId) throw new Error(payload.error ?? 'REQUEST_FAILED');
      router.push(`/guilds/${guildId}/changes/${payload.planId}`);
    } catch (cause) {
      setError(localizedError(copy, cause));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={create} disabled={busy}>
        {busy ? pending : label}
      </Button>
      <p role="status" className="sr-only">{busy ? pending : ''}</p>
      {error ? <Notice tone="critical">{error}</Notice> : null}
    </div>
  );
}
