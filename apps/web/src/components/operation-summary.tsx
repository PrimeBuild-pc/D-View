import {
  channelKind,
  splitBits,
  type Bitfield,
  type PermissionSnapshot,
} from '@dpd/shared';
import type { ChangeOperation } from '@dpd/permission-engine';
import type { Dict } from '@/lib/i18n';
import { localizedPermissionLabel } from '@/lib/permissions-ui';
import { Badge } from './ui';
import { ChannelIcon } from './icons';

/**
 * A change, in words.
 *
 * This replaces `<pre>{JSON.stringify({before, after})}</pre>` and a raw
 * `channelId:role:roleId` snowflake — on the two screens where someone decides
 * whether to mutate a live server.
 */
export function OperationSummary({
  operation,
  snapshot,
  copy,
}: {
  operation: ChangeOperation;
  snapshot: PermissionSnapshot;
  copy: Dict;
}) {
  const role = operation.roleId
    ? snapshot.roles.find((candidate) => candidate.id === operation.roleId)
    : undefined;
  const target = operation.targetType === 'role' && operation.targetId
    ? snapshot.roles.find((candidate) => candidate.id === operation.targetId)
    : undefined;
  const channel = operation.channelId
    ? snapshot.channels.find((candidate) => candidate.id === operation.channelId)
    : undefined;

  const subjectName =
    role?.name ??
    target?.name ??
    (operation.targetType === 'member' ? `${copy.common.member} ${operation.targetId}` : operation.targetId) ??
    '';

  const allowed = splitBits(operation.nextAllow & operation.touched);
  const denied = splitBits(operation.nextDeny & operation.touched);
  const cleared = splitBits(operation.touched & ~operation.nextAllow & ~operation.nextDeny);

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{subjectName}</span>
        {channel ? (
          <>
            <span className="text-ink-faint">→</span>
            <ChannelIcon
              kind={channelKind(channel.type)}
              aria-hidden={false}
              role="img"
              aria-label={copy.channelKinds[channelKind(channel.type)]}
              className="text-ink-faint"
            />
            <span>{channel.name}</span>
          </>
        ) : null}
        <Badge tone={operation.kind === 'delete-channel-overwrite' ? 'deny' : 'neutral'}>
          {copy.operationKinds[operation.kind]}
        </Badge>
      </p>

      <div className="mt-1 flex flex-wrap gap-1">
        <PermissionPills bits={allowed} tone="allow" label={copy.explorer.allowedBy} copy={copy} />
        <PermissionPills bits={denied} tone="deny" label={copy.explorer.deniedBy} copy={copy} />
        <PermissionPills bits={cleared} tone="inherit" label={copy.changes.cleared} copy={copy} />
      </div>
    </div>
  );
}

function PermissionPills({
  bits,
  tone,
  label,
  copy,
}: {
  bits: Bitfield[];
  tone: 'allow' | 'deny' | 'inherit';
  label: string;
  copy: Dict;
}) {
  if (bits.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-ink-faint">{label}:</span>
      {bits.map((bit) => (
        // Unknown bits stay visible rather than silently disappearing.
        <Badge key={String(bit)} tone={tone}>
          {localizedPermissionLabel(bit, copy)}
        </Badge>
      ))}
    </span>
  );
}
