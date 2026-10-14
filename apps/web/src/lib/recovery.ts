import { prisma } from '@dpd/database';

export const EXECUTION_DEADLINE_MS = 240_000;
// Well beyond a batch deadline plus its bounded in-flight REST request.
export const ABANDONED_AFTER_MS = 600_000;

/** Never replay an interrupted plan. Preserve evidence and expose uncertainty for review. */
export async function recoverStaleExecutions(guildId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS);
  const stale = await prisma.permissionChangeExecution.findMany({
    where: { status: 'running', startedAt: { lt: cutoff }, plan: { guildId, status: 'executing' } },
    include: { results: true, plan: { include: { operations: true } } },
  });
  for (const execution of stale) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.permissionChangeExecution.updateMany({
        where: { id: execution.id, status: 'running', startedAt: { lt: cutoff } },
        data: { status: 'interrupted', finishedAt: new Date() },
      });
      if (claimed.count !== 1) return;
      const recorded = new Set(execution.results.map((result) => result.operationId));
      await tx.permissionChangeOperationResult.createMany({
        data: execution.plan.operations.filter((op) => !recorded.has(op.id)).map((op) => ({
          executionId: execution.id, operationId: op.id,
          status: op.included ? 'unknown' : 'skipped-noop',
          detail: 'Execution interrupted. Sync and review live state before making another plan.',
        })),
        skipDuplicates: true,
      });
      // Result writers take the same execution-row lock; include any late response committed before recovery.
      const applied = await tx.permissionChangeOperationResult.count({ where: { executionId: execution.id, status: 'applied' } });
      const status = applied > 0 ? 'partial' : 'failed';
      await tx.permissionChangePlan.updateMany({ where: { id: execution.planId, guildId, status: 'executing' }, data: { status } });
    });
  }
}
