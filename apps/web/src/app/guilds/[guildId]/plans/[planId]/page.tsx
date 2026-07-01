import { prisma } from '@dpd/database';
import Link from 'next/link';
import { canReadGuild, getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function PlanPage({ params, searchParams }: { params: Promise<{ guildId: string; planId: string }>; searchParams: Promise<{ execute?: string }> }) {
  const [{ guildId, planId }, query] = await Promise.all([params, searchParams]);
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) return <p className="text-slate-400">Not authorized.</p>;

  const plan = await prisma.permissionChangePlan.findFirst({
    where: { id: planId, guildId },
    include: { operations: { orderBy: { order: 'asc' } }, executions: { orderBy: { startedAt: 'desc' }, take: 5 } },
  });
  if (!plan) return <p className="text-slate-400">Plan not found.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Change plan</h1>
            <p className="mt-1 text-sm text-slate-400">Status: {plan.status} · Operations: {plan.operations.length}</p>
            {plan.reason ? <p className="mt-2 text-slate-300">Reason: {plan.reason}</p> : null}
          </div>
          <Link href={`/guilds/${guildId}`} className="text-sm text-slate-300">Back</Link>
        </div>
      </div>

      <div className="space-y-3">
        {plan.operations.map((operation) => (
          <div key={operation.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200">{operation.kind}</span>
              <span className="break-all text-sm text-slate-300">{operation.targetId}</span>
            </div>
            <details className="mt-3 text-xs text-slate-300">
              <summary className="cursor-pointer text-slate-400">Before / after</summary>
              <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3">{JSON.stringify({ before: operation.before, after: operation.after, warnings: operation.warnings }, null, 2)}</pre>
            </details>
          </div>
        ))}
      </div>

      {query.execute ? (
        <div className="rounded-xl border border-amber-800 bg-amber-950 p-4 text-sm text-amber-100">
          Execute status: {query.execute}. {query.execute === 'disabled' ? 'Set ENABLE_DISCORD_WRITES=true in apps/web/.env.local to allow real Discord writes.' : null}
        </div>
      ) : null}

      {plan.status === 'draft' ? (
        <form action={`/api/guilds/${guildId}/plans/${planId}/execute`} method="post" className="rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">
          <h2 className="font-semibold text-white">Reinforced confirmation</h2>
          <p className="mt-2">This can modify real Discord permissions. A backup snapshot will be stored before applying. Type APPLY to continue.</p>
          <input name="confirm" className="mt-3 rounded border border-red-700 bg-slate-950 px-3 py-2 text-white" placeholder="APPLY" />
          <button className="ml-3 rounded bg-red-700 px-4 py-2 text-white">Apply batch</button>
        </form>
      ) : null}

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
        <h2 className="font-semibold text-white">Execution history</h2>
        <div className="mt-3 space-y-2">
          {plan.executions.map((execution) => (
            <details key={execution.id} className="rounded border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
              <summary>{execution.status} · {execution.startedAt.toISOString()}</summary>
              <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(execution.result, null, 2)}</pre>
            </details>
          ))}
          {plan.executions.length === 0 ? <p className="text-slate-400">No executions yet.</p> : null}
        </div>
      </div>
    </div>
  );
}
