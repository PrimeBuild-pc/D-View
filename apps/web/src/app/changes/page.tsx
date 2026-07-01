import { prisma } from '@dpd/database';
import Link from 'next/link';
import { getLang, t } from '@/lib/i18n';

const steps = ['Create plan', 'Validate diff', 'Select operations', 'Reinforced confirmation if risky', 'Batch apply', 'Report', 'Rollback plan from backup'];

export const dynamic = 'force-dynamic';

export default async function ChangesPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = getLang((await searchParams).lang);
  const copy = t(lang);
  const plans = await prisma.permissionChangePlan.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { operations: true, guild: true } });
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-2xl font-semibold text-white">{copy.changes}</h1>
        <p className="mt-2 text-slate-400">{copy.changesIntro}</p>
        <ol className="mt-6 space-y-3">
          {steps.map((step, index) => (
            <li key={step} className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-slate-200">
              <span className="mr-3 text-slate-500">{index + 1}.</span>{step}
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h2 className="font-semibold text-white">Recent plans</h2>
        <div className="mt-4 space-y-2">
          {plans.map((plan) => (
            <Link key={plan.id} href={`/guilds/${plan.guildId}/plans/${plan.id}?lang=${lang}`} className="block rounded border border-slate-800 bg-slate-900 p-3 text-sm">
              <div className="text-white">{plan.guild.name} · {plan.operations.length} operations · {plan.status}</div>
              <div className="text-slate-400">{plan.createdAt.toISOString()}</div>
            </Link>
          ))}
          {plans.length === 0 ? <p className="text-slate-400">No plans yet.</p> : null}
        </div>
      </div>
    </div>
  );
}
