'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ADMINISTRATOR,
  VIEW_CHANNEL,
  channelKind,
  fromBits,
  permissionLabel,
  toBits,
  type Bitfield,
  type PermissionSnapshot,
} from '@dpd/shared';
import {
  buildTree,
  channelSyncState,
  explainChannelPermissions,
  indexSnapshot,
  traceForBit,
  type PermissionStep,
  type PermissionSubject,
} from '@dpd/permission-engine';
import type { Dict } from '@/lib/i18n';
import { fill } from '@/lib/i18n';
import {
  groupsForKind,
  groupLabels,
  overwriteState,
  permissionRows,
  verdicts,
  type TriState,
} from '@/lib/permissions-ui';
import { Badge, Button, Card, CardBody, Input, Notice, cx } from '@/components/ui';
import { ChannelIcon, IconCheck, IconCross, IconDash, IconSearch } from '@/components/icons';

type Filter = 'all' | 'visible' | 'hidden' | 'overridden' | 'member';

/** A staged edit, keyed by channel+target so repeated toggles collapse into one. */
interface Draft {
  channelId: string;
  targetType: 'role' | 'member';
  targetId: string;
  touched: Bitfield;
  nextAllow: Bitfield;
  nextDeny: Bitfield;
}

export interface ExplorerProps {
  snapshot: PermissionSnapshot;
  copy: Dict;
  guildId: string;
  baseSnapshotId: string;
  canWrite: boolean;
  initialRoleId?: string;
  initialChannelId?: string;
}

export function Explorer({
  snapshot,
  copy,
  guildId,
  baseSnapshotId,
  canWrite,
  initialRoleId,
  initialChannelId,
}: ExplorerProps) {
  const router = useRouter();
  // The engine is pure, so the whole calculation runs here. Every selection used
  // to be a full document navigation that lost your scroll position.
  const index = useMemo(() => indexSnapshot(snapshot), [snapshot]);

  const roles = useMemo(
    () => [...index.roles.values()].sort((a, b) => b.position - a.position),
    [index],
  );

  const [roleId, setRoleId] = useState(
    () => initialRoleId ?? roles.find((role) => role.id !== snapshot.guild.everyoneRoleId)?.id ?? roles[0]?.id ?? '',
  );
  const [channelId, setChannelId] = useState(initialChannelId ?? '');
  const [roleQuery, setRoleQuery] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showUnset, setShowUnset] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject: PermissionSubject = { kind: 'role', roleId };
  const tree = useMemo(() => (roleId ? buildTree(index, subject) : []), [index, roleId]);

  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(roleQuery.trim().toLowerCase()),
  );

  const matchesFilter = (node: (typeof tree)[number]['children'][number]) => {
    if (channelQuery && !node.channel.name.toLowerCase().includes(channelQuery.trim().toLowerCase())) {
      return false;
    }
    const visible = (node.permissions.raw & VIEW_CHANNEL) === VIEW_CHANNEL;
    switch (filter) {
      case 'visible':
        return visible;
      case 'hidden':
        return !visible;
      case 'overridden':
        return node.syncState === 'desynced';
      case 'member':
        return node.memberOverwriteCount > 0;
      default:
        return true;
    }
  };

  const selected = channelId ? index.channels.get(channelId) : undefined;
  const selectedKind = selected ? channelKind(selected.type) : undefined;
  const explanation = selected ? explainChannelPermissions(index, selected.id, subject) : undefined;

  const draftKey = (channelId: string, targetId: string) => `${channelId}:${targetId}`;

  function toggle(bit: Bitfield, next: TriState) {
    if (!selected) return;
    const key = draftKey(selected.id, roleId);
    const live = index.overwrites.get(selected.id)?.get(roleId);
    setDrafts((current) => {
      const existing = current[key] ?? {
        channelId: selected.id,
        targetType: 'role' as const,
        targetId: roleId,
        touched: 0n,
        nextAllow: live?.allow ?? 0n,
        nextDeny: live?.deny ?? 0n,
      };
      let nextAllow = existing.nextAllow & ~bit;
      let nextDeny = existing.nextDeny & ~bit;
      if (next === 'allow') nextAllow |= bit;
      if (next === 'deny') nextDeny |= bit;

      const liveAllow = live?.allow ?? 0n;
      const liveDeny = live?.deny ?? 0n;
      const touched = (liveAllow ^ nextAllow) | (liveDeny ^ nextDeny);

      if (touched === 0n) {
        const rest = { ...current };
        delete rest[key];
        return rest;
      }
      return { ...current, [key]: { ...existing, touched, nextAllow, nextDeny } };
    });
  }

  function stateFor(bit: Bitfield): TriState {
    if (!selected) return 'inherit';
    const draft = drafts[draftKey(selected.id, roleId)];
    if (draft) return overwriteState(draft.nextAllow, draft.nextDeny, bit);
    const live = index.overwrites.get(selected.id)?.get(roleId);
    return overwriteState(live?.allow ?? 0n, live?.deny ?? 0n, bit);
  }

  const pending = Object.values(drafts);

  async function createPlan() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/guilds/${guildId}/plans`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseSnapshotId,
          // Intent only. The server rebuilds the operations and recomputes every
          // warning; nothing sent from here is trusted.
          edits: pending.map((draft) => ({
            kind: 'overwrite' as const,
            channelId: draft.channelId,
            targetType: draft.targetType,
            targetId: draft.targetId,
            touched: fromBits(draft.touched),
            nextAllow: fromBits(draft.nextAllow),
            nextDeny: fromBits(draft.nextDeny),
          })),
        }),
      });
      const payload = (await response.json()) as { planId?: string; error?: string };
      if (!response.ok || !payload.planId) throw new Error(payload.error ?? 'Failed');
      router.push(`/guilds/${guildId}/changes/${payload.planId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[16rem_20rem_minmax(0,1fr)]">
        {/* Subject ------------------------------------------------------- */}
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardBody className="space-y-3 p-3">
            <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
              {copy.explorer.roles}
            </p>
            <label className="relative block">
              <IconSearch className="absolute top-2.5 left-2.5 text-ink-faint" />
              <Input
                value={roleQuery}
                onChange={(event) => setRoleQuery(event.target.value)}
                placeholder={copy.explorer.searchRoles}
                className="pl-8"
              />
            </label>
            <div className="max-h-[26rem] space-y-0.5 overflow-y-auto">
              {filteredRoles.map((role) => {
                const isAdmin = (toBits(role.permissions) & ADMINISTRATOR) === ADMINISTRATOR;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setRoleId(role.id)}
                    className={cx(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                      role.id === roleId ? 'bg-brand/20 text-ink' : 'text-ink-muted hover:bg-surface-overlay',
                    )}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: role.color ?? '#6b7a96' }}
                      aria-hidden
                    />
                    <span className="truncate">{role.name}</span>
                    {isAdmin ? <Badge tone="warning">{copy.badge.admin}</Badge> : null}
                  </button>
                );
              })}
              {filteredRoles.length === 0 ? (
                <p className="px-2 py-4 text-sm text-ink-faint">{copy.explorer.noMatches}</p>
              ) : null}
            </div>
          </CardBody>
        </Card>

        {/* Channels ------------------------------------------------------ */}
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardBody className="space-y-3 p-3">
            <label className="relative block">
              <IconSearch className="absolute top-2.5 left-2.5 text-ink-faint" />
              <Input
                value={channelQuery}
                onChange={(event) => setChannelQuery(event.target.value)}
                placeholder={copy.explorer.searchChannels}
                className="pl-8"
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['all', copy.explorer.filterAll],
                  ['visible', copy.explorer.filterVisible],
                  ['hidden', copy.explorer.filterHidden],
                  ['overridden', copy.explorer.filterOverridden],
                  ['member', copy.explorer.filterMemberException],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cx(
                    'rounded-full px-2.5 py-1 text-[11px]',
                    filter === value ? 'bg-brand text-white' : 'bg-surface-overlay text-ink-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[30rem] overflow-y-auto">
              {tree.map((node) => {
                const key = node.category?.id ?? '__uncategorised__';
                const children = node.children.filter(matchesFilter);
                if (children.length === 0 && channelQuery) return null;
                const isCollapsed = collapsed[key] ?? false;
                return (
                  <div key={key} className="mb-1">
                    {/* Really collapsible. The old triangle was decorative. */}
                    <button
                      type="button"
                      onClick={() => setCollapsed((c) => ({ ...c, [key]: !isCollapsed }))}
                      aria-expanded={!isCollapsed}
                      className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs font-semibold tracking-wide text-ink-faint uppercase hover:text-ink"
                    >
                      <span className={cx('transition', isCollapsed ? '' : 'rotate-90')}>›</span>
                      <span className="truncate">{node.category?.name ?? copy.explorer.uncategorised}</span>
                      <span className="ml-auto tabular-nums">{children.length}</span>
                    </button>
                    {!isCollapsed
                      ? children.map((child) => {
                          const visible = (child.permissions.raw & VIEW_CHANNEL) === VIEW_CHANNEL;
                          return (
                            <button
                              key={child.channel.id}
                              type="button"
                              onClick={() => setChannelId(child.channel.id)}
                              className={cx(
                                'defer-paint flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-1.5 pl-4 text-left text-sm',
                                child.channel.id === channelId
                                  ? 'bg-brand/20 text-ink'
                                  : 'text-ink-muted hover:bg-surface-overlay',
                              )}
                            >
                              <ChannelIcon
                                kind={child.kind}
                                className={visible ? 'text-ink-muted' : 'text-ink-faint'}
                              />
                              <span className={cx('truncate', !visible && 'line-through opacity-60')}>
                                {child.channel.name}
                              </span>
                              {/* No longer capped at three, which used to hide
                                  exactly the two most important badges. */}
                              <span className="ml-auto flex shrink-0 gap-1">
                                {child.syncState === 'desynced' ? (
                                  <Badge tone="info" title={copy.badge.overrideHelp}>
                                    {copy.badge.override}
                                  </Badge>
                                ) : null}
                                {child.memberOverwriteCount > 0 ? (
                                  <Badge tone="warning" title={copy.badge.memberExceptionHelp}>
                                    {child.memberOverwriteCount}
                                  </Badge>
                                ) : null}
                              </span>
                            </button>
                          );
                        })
                      : null}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Permissions --------------------------------------------------- */}
        <div className="space-y-3">
          {!selected || !explanation || !selectedKind ? (
            <Card>
              <CardBody className="py-16 text-center">
                <p className="font-medium">{copy.explorer.pickChannel}</p>
                <p className="mt-1 text-sm text-ink-muted">{copy.explorer.pickChannelHelp}</p>
              </CardBody>
            </Card>
          ) : (
            <>
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChannelIcon kind={selectedKind} />
                    <h2 className="text-lg font-semibold">{selected.name}</h2>
                    <Badge tone={channelSyncState(index, selected.id) === 'desynced' ? 'info' : 'neutral'}>
                      {channelSyncState(index, selected.id) === 'desynced'
                        ? copy.badge.override
                        : copy.badge.synced}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {verdicts(explanation.raw, selectedKind).map((verdict) => (
                      <Badge
                        key={verdict.key}
                        tone={verdict.tone}
                        className="px-2.5 py-1 text-xs"
                      >
                        {copy.explorer[verdict.key as keyof Dict['explorer']]}
                      </Badge>
                    ))}
                  </div>
                </CardBody>
              </Card>

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={showUnset}
                    onChange={(event) => setShowUnset(event.target.checked)}
                  />
                  {copy.explorer.showUnset}
                </label>
              </div>

              {groupsForKind(selectedKind).map((group) => {
                const rows = permissionRows(group).filter(
                  (row) => showUnset || (explanation.raw & row.bit) === row.bit || stateFor(row.bit) !== 'inherit',
                );
                if (rows.length === 0) return null;
                return (
                  <Card key={group}>
                    <CardBody className="p-0">
                      <p className="border-b border-line px-4 py-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">
                        {groupLabels[group]}
                      </p>
                      <ul>
                        {rows.map((row) => (
                          <PermissionRowView
                            key={row.label}
                            label={row.label}
                            bit={row.bit}
                            granted={(explanation.raw & row.bit) === row.bit}
                            steps={explanation.steps}
                            state={stateFor(row.bit)}
                            editable={canWrite}
                            onChange={(next) => toggle(row.bit, next)}
                            copy={copy}
                            index={index}
                          />
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Draft bar --------------------------------------------------------- */}
      {pending.length > 0 ? (
        <div className="sticky bottom-4 z-20">
          <Card className="border-brand/50 shadow-lg">
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {fill(copy.changes.pending.split('|')[pending.length === 1 ? 0 : 1] ?? '', {
                  count: pending.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button onClick={() => setDrafts({})} tone="ghost">
                  {copy.changes.discard}
                </Button>
                <Button onClick={createPlan} tone="primary" disabled={submitting}>
                  {submitting ? copy.changes.creatingPlan : copy.changes.createPlan}
                </Button>
              </div>
              {error ? <Notice tone="critical">{error}</Notice> : null}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function PermissionRowView({
  label,
  bit,
  granted,
  steps,
  state,
  editable,
  onChange,
  copy,
  index,
}: {
  label: string;
  bit: Bitfield;
  granted: boolean;
  steps: PermissionStep[];
  state: TriState;
  editable: boolean;
  onChange: (next: TriState) => void;
  copy: Dict;
  index: ReturnType<typeof indexSnapshot>;
}) {
  const [open, setOpen] = useState(false);
  const trace = traceForBit(steps, bit);

  return (
    <li className="border-b border-line/60 last:border-0">
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left text-sm"
        >
          {granted ? (
            <IconCheck className="text-allow" />
          ) : (
            <IconCross className="text-deny" />
          )}
          <span className={granted ? 'text-ink' : 'text-ink-faint'}>{label}</span>
        </button>

        {editable ? (
          <div className="flex overflow-hidden rounded-lg border border-line">
            {(['allow', 'inherit', 'deny'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                aria-pressed={state === option}
                title={option}
                className={cx(
                  'px-2 py-1',
                  state === option
                    ? option === 'allow'
                      ? 'bg-allow-dim text-allow'
                      : option === 'deny'
                        ? 'bg-deny-dim text-deny'
                        : 'bg-inherit-dim text-inherit'
                    : 'text-ink-faint hover:bg-surface-overlay',
                )}
              >
                {option === 'allow' ? <IconCheck /> : option === 'deny' ? <IconCross /> : <IconDash />}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="bg-surface/60 px-4 pb-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">
            {copy.explorer.trace}
          </p>
          {trace.length === 0 ? (
            <p className="text-sm text-ink-muted">{copy.explorer.noTrace}</p>
          ) : (
            <ol className="space-y-1">
              {trace.map((step, position) => {
                const grantedHere = (step.after & bit) === bit;
                const decisive = position === trace.length - 1;
                return (
                  <li
                    key={`${step.stage}-${position}`}
                    className={cx(
                      'flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm',
                      // Highlighting the decisive step is the difference between
                      // listing the rules and explaining the outcome.
                      decisive ? 'bg-surface-overlay' : '',
                    )}
                  >
                    <span className="mt-0.5 tabular-nums text-ink-faint">{position + 1}</span>
                    {grantedHere ? (
                      <IconCheck className="mt-0.5 shrink-0 text-allow" />
                    ) : (
                      <IconCross className="mt-0.5 shrink-0 text-deny" />
                    )}
                    <span className="flex-1">
                      <span className="text-ink-muted">{copy.stage[step.stage]}</span>
                      {step.sourceIds.length > 0 ? (
                        <span className="ml-1 text-ink-faint">
                          (
                          {step.sourceIds
                            .map((id) => index.roles.get(id)?.name ?? id)
                            .join(', ')}
                          )
                        </span>
                      ) : null}
                    </span>
                    {decisive ? <Badge tone="brand">{copy.explorer.decisive}</Badge> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : null}
    </li>
  );
}

export { permissionLabel };
