'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, Input, Notice } from '@/components/ui';
import type { Dict } from '@/lib/i18n';
import { fill } from '@/lib/i18n';

function Submit({ label, pending, disabled }: { label: string; pending: string; disabled: boolean }) {
  const status = useFormStatus();
  return (
    <Button type="submit" tone="danger" disabled={disabled || status.pending}>
      {status.pending ? pending : label}
    </Button>
  );
}

/**
 * Reinforced confirmation.
 *
 * Typing the server's name rather than a fixed word forces the operator to look
 * at what they are pointing at, and the button stays disabled until it matches —
 * the old field had no validation at all, so a typo cost a server round trip and
 * came back as the raw string "Execute status: confirm."
 */
export function ApplyForm({
  action,
  guildName,
  risky,
  copy,
}: {
  action: string;
  guildName: string;
  risky: boolean;
  copy: Dict;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === guildName;

  return (
    <form action={action} method="post" className="space-y-3">
      {risky ? (
        <Notice tone="critical" title={copy.changes.confirmTitle}>
          {fill(copy.changes.confirmTyping, { name: guildName })}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-label={fill(copy.changes.confirmTyping, { name: guildName })}
          placeholder={guildName}
          className="max-w-xs"
          autoComplete="off"
        />
        <Submit label={copy.changes.applyPlan} pending={copy.changes.applying} disabled={!matches} />
      </div>
      {typed.length > 0 && !matches ? (
        <p className="text-xs text-critical">{copy.changes.confirmMismatch}</p>
      ) : null}
    </form>
  );
}
