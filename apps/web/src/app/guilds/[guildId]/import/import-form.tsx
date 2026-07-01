'use client';

import { useMemo, useState } from 'react';

type Operation = {
  kind: string;
  targetId: string;
  before: unknown;
  after: unknown;
  warnings: string[];
};

type ImportResult =
  | { status: 'validated'; guildId: string; operations: Operation[]; warnings: string[] }
  | { error: string };

export function ImportForm({ guildId, lang }: { guildId: string; lang: string }) {
  const [json, setJson] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState('');
  const [creatingPlan, setCreatingPlan] = useState(false);
  const operations = 'operations' in (result ?? {}) ? (result as Extract<ImportResult, { status: 'validated' }>).operations : [];
  const selectedCount = useMemo(() => operations.filter((_, index) => selected[index] ?? true).length, [operations, selected]);

  async function validate() {
    setResult(null);
    setSelected({});
    const response = await fetch(`/api/guilds/${guildId}/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: json,
    });
    const data = (await response.json()) as ImportResult;
    setResult(data);
  }

  async function createPlan() {
    const selectedOperations = operations.filter((_, index) => selected[index] ?? true);
    setCreatingPlan(true);
    const response = await fetch(`/api/guilds/${guildId}/plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operations: selectedOperations, reason }),
    });
    const data = (await response.json()) as { planId?: string; error?: string };
    setCreatingPlan(false);
    if (data.planId) window.location.href = `/guilds/${guildId}/plans/${data.planId}?lang=${lang}`;
    else setResult({ error: data.error ?? 'Unable to create plan' });
  }

  return (
    <div className="space-y-4">
      <textarea
        className="h-80 w-full rounded border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-100"
        placeholder="Paste edited snapshot JSON here. It will only be validated and diffed. Nothing is applied."
        value={json}
        onChange={(event) => setJson(event.target.value)}
      />
      <div>
        <button type="button" onClick={validate} className="rounded bg-indigo-600 px-4 py-2 text-white">Validate import</button>
        <a href={`/guilds/${guildId}?lang=${lang}`} className="ml-3 text-sm text-slate-300">Back</a>
      </div>

      {result && 'error' in result ? <p className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">{result.error}</p> : null}

      {operations.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-white">Diff preview</h2>
            <span className="text-sm text-slate-400">{selectedCount}/{operations.length} selected · preview only</span>
          </div>
          <div className="mb-4 space-y-2">
            <label className="block text-sm text-slate-300" htmlFor="reason">Reason / note</label>
            <input id="reason" className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional" />
            <button type="button" disabled={selectedCount === 0 || creatingPlan} onClick={createPlan} className="rounded bg-green-700 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
              {creatingPlan ? 'Creating...' : 'Create change plan'}
            </button>
          </div>
          <div className="space-y-3">
            {operations.map((operation, index) => (
              <label key={`${operation.kind}-${operation.targetId}-${index}`} className="block rounded border border-slate-800 bg-slate-900 p-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected[index] ?? true}
                    onChange={(event) => setSelected((current) => ({ ...current, [index]: event.target.checked }))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200">{operation.kind}</span>
                      <span className="break-all text-sm text-slate-300">{operation.targetId}</span>
                    </div>
                    {operation.warnings.length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 text-sm text-amber-200">
                        {operation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    ) : null}
                    <details className="mt-2 text-xs text-slate-300">
                      <summary className="cursor-pointer text-slate-400">Before / after</summary>
                      <pre className="mt-2 overflow-auto rounded bg-slate-950 p-2">{JSON.stringify({ before: operation.before, after: operation.after }, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : result && 'status' in result ? (
        <p className="rounded border border-green-800 bg-green-950 p-3 text-sm text-green-200">Valid snapshot. No permission changes detected.</p>
      ) : null}
    </div>
  );
}
