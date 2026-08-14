'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Notice } from '@/components/ui';

/** Creates a rollback plan; it does not undo anything directly. The new plan goes through the same review and confirmation. */
export function RollbackButton({
  guildId,
  planId,
  label,
  pending,
}: {
  guildId: string;
  planId: string;
  label: string;
  pending: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/guilds/${guildId}/plans/${planId}/rollback`, { method: 'POST' });
    const payload = (await response.json()) as { planId?: string; error?: string };
    if (!response.ok || !payload.planId) {
      setError(payload.error ?? 'Failed');
      setBusy(false);
      return;
    }
    router.push(`/guilds/${guildId}/changes/${payload.planId}`);
  }

  return (
    <div className="space-y-2">
      <Button onClick={create} disabled={busy}>
        {busy ? pending : label}
      </Button>
      {error ? <Notice tone="critical">{error}</Notice> : null}
    </div>
  );
}
