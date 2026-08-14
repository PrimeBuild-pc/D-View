import type { Dict } from '@/lib/i18n';
import type { SnapshotLoad } from '@/lib/plans';
import { EmptyState } from './ui';
import { SyncButton } from '@/app/guilds/[guildId]/sync-button';

/**
 * The shared "there is nothing to show yet" state.
 *
 * Every page used to hand-roll this, and most of them rendered a bare `<p>` with
 * no way to fix the situation. The outdated case matters especially: the old code
 * parsed stored snapshots unconditionally, so a schema change took the page down
 * with a stack trace instead of telling the operator to re-sync.
 */
export function SnapshotGate({
  load,
  copy,
  guildId,
}: {
  load: Exclude<SnapshotLoad, { status: 'ok' }>;
  copy: Dict;
  guildId: string;
}) {
  const outdated = load.status === 'outdated';
  return (
    <EmptyState
      title={outdated ? copy.sync.outdated : copy.sync.noSnapshot}
      description={outdated ? copy.sync.outdatedHelp : copy.sync.noSnapshotHelp}
      action={
        <form action={`/api/guilds/${guildId}/sync`} method="post">
          <SyncButton idle={copy.guilds.syncNow} pending={copy.guilds.syncing} />
        </form>
      }
    />
  );
}
