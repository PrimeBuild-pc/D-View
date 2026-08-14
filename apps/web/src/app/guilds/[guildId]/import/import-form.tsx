'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toBits, type PermissionSnapshot } from '@dpd/shared';
import type { ChangeOperation } from '@dpd/permission-engine';
import type { Dict } from '@/lib/i18n';
import { fill } from '@/lib/i18n';
import { Button, Card, CardBody, Input, Notice, SectionTitle } from '@/components/ui';
import { OperationSummary } from '@/components/operation-summary';
import type { PlanWarning } from '@/lib/plans';

interface WireOperation extends Omit<ChangeOperation, 'touched' | 'nextAllow' | 'nextDeny' | 'expectedAllow' | 'expectedDeny'> {
  touched: string;
  nextAllow: string;
  nextDeny: string;
  expectedAllow: string;
  expectedDeny: string;
}

interface Result {
  baseSnapshotId: string;
  operations: WireOperation[];
  warnings: PlanWarning[];
}

export function ImportForm({
  copy,
  guildId,
  snapshot,
}: {
  copy: Dict;
  guildId: string;
  snapshot: PermissionSnapshot;
}) {
  const router = useRouter();
  const [json, setJson] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState('');
  const [validating, setValidating] = useState(false);
  const [creating, setCreating] = useState(false);

  async function validate(payload: string) {
    setValidating(true);
    setError(null);
    setResult(null);
    try {
      // Parsed here first, so a stray character does not become an unreadable
      // server-side schema error.
      JSON.parse(payload);
      const response = await fetch(`/api/guilds/${guildId}/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      });
      const body = (await response.json()) as Result & { error?: string };
      if (!response.ok) throw new Error(body.error ?? copy.importPage.invalid);
      setResult(body);
      setIncluded(Object.fromEntries(body.operations.map((_, index) => [index, true])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setValidating(false);
    }
  }

  async function createPlan() {
    if (!result) return;
    setCreating(true);
    setError(null);
    const edits = result.operations
      .filter((_, index) => included[index] ?? true)
      .map((operation) =>
        operation.kind === 'set-role-permissions'
          ? {
              kind: 'role' as const,
              roleId: operation.roleId!,
              touched: operation.touched,
              nextAllow: operation.nextAllow,
            }
          : operation.kind === 'delete-channel-overwrite'
            ? {
                kind: 'delete-overwrite' as const,
                channelId: operation.channelId!,
                targetType: operation.targetType!,
                targetId: operation.targetId!,
              }
            : {
                kind: 'overwrite' as const,
                channelId: operation.channelId!,
                targetType: operation.targetType!,
                targetId: operation.targetId!,
                touched: operation.touched,
                nextAllow: operation.nextAllow,
                nextDeny: operation.nextDeny,
              },
      );

    const response = await fetch(`/api/guilds/${guildId}/plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseSnapshotId: result.baseSnapshotId, reason: reason.trim() || undefined, edits }),
    });
    const body = (await response.json()) as { planId?: string; error?: string };
    if (!response.ok || !body.planId) {
      setError(body.error ?? 'Failed');
      setCreating(false);
      return;
    }
    router.push(`/guilds/${guildId}/changes/${body.planId}`);
  }

  const selectedCount = result?.operations.filter((_, index) => included[index] ?? true).length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          {/* A file input, because the sibling feature produces a downloadable
              file. The old form was textarea-only, so the round trip required
              opening the file in an editor and copy-pasting it. */}
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">{copy.importPage.chooseFile}</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setJson(text);
                void validate(text);
              }}
              className="text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-overlay file:px-3 file:py-1.5 file:text-ink"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">{copy.importPage.orPaste}</span>
            <textarea
              value={json}
              onChange={(event) => setJson(event.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink"
            />
          </label>

          <Button
            tone="primary"
            onClick={() => validate(json)}
            disabled={validating || json.trim().length === 0}
          >
            {validating ? copy.importPage.validating : copy.importPage.validate}
          </Button>

          {error ? (
            <Notice tone="critical" title={copy.importPage.invalid}>
              {error}
            </Notice>
          ) : null}
        </CardBody>
      </Card>

      {result ? (
        result.operations.length === 0 ? (
          <Notice tone="allow">{copy.importPage.noChanges}</Notice>
        ) : (
          <>
            {result.warnings.map((warning, position) => (
              <Notice key={position} tone={warning.severity === 'critical' ? 'critical' : 'warning'}>
                {fill(copy.warning[warning.code], warning.params)}
              </Notice>
            ))}

            <Card>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionTitle>{copy.importPage.valid}</SectionTitle>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className="text-ink-muted hover:text-ink"
                      onClick={() =>
                        setIncluded(Object.fromEntries(result.operations.map((_, index) => [index, true])))
                      }
                    >
                      {copy.common.all}
                    </button>
                    <button
                      type="button"
                      className="text-ink-muted hover:text-ink"
                      onClick={() =>
                        setIncluded(Object.fromEntries(result.operations.map((_, index) => [index, false])))
                      }
                    >
                      {copy.common.none}
                    </button>
                  </div>
                </div>

                <ul className="space-y-1.5">
                  {result.operations.map((operation, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-3"
                        checked={included[index] ?? true}
                        onChange={(event) =>
                          setIncluded((current) => ({ ...current, [index]: event.target.checked }))
                        }
                        aria-label={copy.changes.include}
                      />
                      <div className="min-w-0 flex-1">
                        <OperationSummary
                          operation={{
                            ...operation,
                            touched: toBits(operation.touched),
                            nextAllow: toBits(operation.nextAllow),
                            nextDeny: toBits(operation.nextDeny),
                            expectedAllow: toBits(operation.expectedAllow),
                            expectedDeny: toBits(operation.expectedDeny),
                          }}
                          snapshot={snapshot}
                          copy={copy}
                        />
                      </div>
                    </li>
                  ))}
                </ul>

                <label className="block text-sm">
                  <span className="mb-1 block text-ink-muted">{copy.changes.planReason}</span>
                  <Input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={copy.changes.planReasonPlaceholder}
                  />
                </label>

                <Button tone="primary" onClick={createPlan} disabled={creating || selectedCount === 0}>
                  {creating ? copy.changes.creatingPlan : copy.changes.createPlan}
                </Button>
              </CardBody>
            </Card>
          </>
        )
      ) : null}
    </div>
  );
}
