'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  VIEW_CHANNEL,
  channelKind,
  type PermissionSnapshot,
} from '@dpd/shared';
import { explainChannelPermissions, indexSnapshot, type PermissionSubject } from '@dpd/permission-engine';
import type { Dict } from '@/lib/i18n';
import { fill } from '@/lib/i18n';
import { Badge, Button, Card, CardBody, Input, Notice, SectionTitle, cx } from '@/components/ui';
import { ChannelIcon, IconUser } from '@/components/icons';
import { verdicts } from '@/lib/permissions-ui';

interface MemberView {
  userId: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatar: string | null;
  roleIds: string[];
  joinedAt: string;
  timeoutUntil: string | null;
}

export function MemberLookup({
  snapshot,
  copy,
  guildId,
}: {
  snapshot: PermissionSnapshot;
  copy: Dict;
  guildId: string;
}) {
  const index = useMemo(() => indexSnapshot(snapshot), [snapshot]);
  const [query, setQuery] = useState('');
  const [member, setMember] = useState<MemberView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setLoading(true);
    setError(null);
    setMember(null);
    try {
      const response = await fetch(
        `/api/guilds/${guildId}/members?user=${encodeURIComponent(query.trim())}`,
      );
      const payload = (await response.json()) as { member?: MemberView; error?: string };
      if (!response.ok || !payload.member) throw new Error(payload.error ?? copy.members.notFound);
      setMember(payload.member);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  // Real Discord resolution: the union of the member's roles, owner bypass, and
  // member-specific overwrites actually applied — none of which the role-only
  // engine could answer.
  const subject: PermissionSubject | null = member
    ? {
        kind: 'member',
        userId: member.userId,
        roleIds: member.roleIds,
        isOwner: member.userId === snapshot.guild.ownerId,
      }
    : null;

  const channels = useMemo(
    () =>
      [...index.channels.values()]
        .filter((channel) => channelKind(channel.type) !== 'category')
        .sort((a, b) => a.position - b.position),
    [index],
  );

  const timedOut = member?.timeoutUntil ? new Date(member.timeoutUntil) > new Date() : false;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <SectionTitle>{copy.members.lookup}</SectionTitle>
          <p className="text-sm text-ink-muted">{copy.members.lookupHelp}</p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') lookup();
              }}
              placeholder={copy.members.lookupPlaceholder}
              className="max-w-xs"
            />
            <Button tone="primary" onClick={lookup} disabled={loading || query.trim().length === 0}>
              <IconUser />
              {loading ? copy.common.loading : copy.members.lookupAction}
            </Button>
          </div>
          {error ? <Notice tone="critical">{error}</Notice> : null}
        </CardBody>
      </Card>

      {member && subject ? (
        <>
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {member.avatar ? (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${member.userId}/${member.avatar}.png?size=64`}
                    alt=""
                    className="size-10 rounded-full"
                  />
                ) : (
                  <span className="size-10 rounded-full bg-surface-overlay" />
                )}
                <div>
                  <p className="font-medium">{member.nick ?? member.globalName ?? member.username}</p>
                  <p className="text-xs text-ink-faint">@{member.username}</p>
                </div>
                {subject.kind === 'member' && subject.isOwner ? (
                  <Badge tone="brand">{copy.members.isOwner}</Badge>
                ) : null}
                {/* A timed-out member cannot post whatever the permissions say;
                    without this the view would confidently lie. */}
                {timedOut ? (
                  <Badge tone="critical" title={copy.badge.timedOutHelp}>
                    {copy.badge.timedOut}
                  </Badge>
                ) : null}
              </div>

              <div>
                <p className="mb-1 text-xs tracking-wide text-ink-faint uppercase">{copy.members.rolesHeld}</p>
                <div className="flex flex-wrap gap-1">
                  {member.roleIds.map((roleId) => {
                    const role = index.roles.get(roleId);
                    if (!role) return null;
                    return (
                      <span
                        key={roleId}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-overlay px-2 py-0.5 text-xs"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ background: role.color ?? '#6b7a96' }}
                          aria-hidden
                        />
                        {role.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-0">
              <p className="border-b border-line px-4 py-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">
                {copy.members.effectivePermissions}
              </p>
              <ul>
                {channels.map((channel) => {
                  const result = explainChannelPermissions(index, channel.id, subject);
                  const kind = channelKind(channel.type);
                  const visible = (result.raw & VIEW_CHANNEL) === VIEW_CHANNEL;
                  return (
                    <li
                      key={channel.id}
                      className="defer-paint flex items-center gap-2 border-b border-line/60 px-4 py-1.5 text-sm last:border-0"
                    >
                      <ChannelIcon kind={kind} className={visible ? 'text-ink-muted' : 'text-ink-faint'} />
                      <span className={cx('truncate', !visible && 'opacity-60')}>{channel.name}</span>
                      <span className="ml-auto flex gap-1">
                        {verdicts(result.raw, kind).map((verdict) => (
                          <Badge key={verdict.key} tone={verdict.tone}>
                            {copy.explorer[verdict.key as keyof Dict['explorer']]}
                          </Badge>
                        ))}
                      </span>
                      <Link
                        href={`/guilds/${guildId}/explorer?channel=${channel.id}`}
                        className="text-xs text-ink-faint hover:text-ink"
                      >
                        →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export function MemberBulk({
  copy,
  guildId,
  count,
  syncedAt,
}: {
  copy: Dict;
  guildId: string;
  count: number;
  syncedAt: string | null;
}) {
  const [state, setState] = useState<{ status: 'idle' | 'running' | 'error'; message?: string }>({
    status: 'idle',
  });

  async function sync() {
    setState({ status: 'running' });
    const response = await fetch(`/api/guilds/${guildId}/members`, { method: 'POST' });
    const payload = (await response.json()) as { error?: string; imported?: number };
    if (!response.ok) {
      setState({ status: 'error', ...(payload.error ? { message: payload.error } : {}) });
      return;
    }
    window.location.reload();
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <SectionTitle>{copy.members.bulkTitle}</SectionTitle>
        <p className="text-sm text-ink-muted">{copy.members.bulkHelp}</p>
        <p className="text-xs text-ink-faint">
          {syncedAt ? fill(copy.members.bulkSynced, { count, when: '' }) : copy.members.bulkNever}
        </p>
        <Button onClick={sync} disabled={state.status === 'running'}>
          {state.status === 'running' ? copy.members.bulkSyncing : copy.members.bulkAction}
        </Button>
        {/* Degrades with the exact remedy rather than an opaque 403. */}
        {state.status === 'error' ? (
          <Notice tone="warning" title={copy.members.intentRequired}>
            {state.message ?? copy.members.intentHelp}
          </Notice>
        ) : null}
      </CardBody>
    </Card>
  );
}
