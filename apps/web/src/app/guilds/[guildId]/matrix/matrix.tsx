'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ADMINISTRATOR,
  SEND_MESSAGES,
  VIEW_CHANNEL,
  channelKind,
  toBits,
  type PermissionSnapshot,
} from '@dpd/shared';
import { explainChannelPermissions, indexSnapshot } from '@dpd/permission-engine';
import type { Dict } from '@/lib/i18n';
import { fill } from '@/lib/i18n';
import { Badge, Card, CardBody, Input, cx } from '@/components/ui';
import { IconSearch } from '@/components/icons';

type Cell = 'admin' | 'write' | 'read' | 'hidden';

const cellStyles: Record<Cell, string> = {
  admin: 'bg-warning-dim text-warning',
  write: 'bg-allow-dim text-allow',
  read: 'bg-info-dim text-info',
  hidden: 'bg-transparent text-ink-faint',
};

export function Matrix({
  snapshot,
  copy,
  guildId,
}: {
  snapshot: PermissionSnapshot;
  copy: Dict;
  guildId: string;
}) {
  const [roleQuery, setRoleQuery] = useState('');
  const [channelQuery, setChannelQuery] = useState('');

  const index = useMemo(() => indexSnapshot(snapshot), [snapshot]);

  // Computed once for the whole grid instead of inside the render loop, which
  // used to mean thousands of recalculations per request.
  const { roles, channels, cells } = useMemo(() => {
    const roles = [...index.roles.values()].sort((a, b) => b.position - a.position);
    const channels = [...index.channels.values()]
      .filter((channel) => channelKind(channel.type) !== 'category')
      .sort((a, b) => a.position - b.position);

    const cells = new Map<string, Cell>();
    for (const role of roles) {
      const isAdmin = (toBits(role.permissions) & ADMINISTRATOR) === ADMINISTRATOR;
      for (const channel of channels) {
        let value: Cell = 'hidden';
        if (isAdmin) value = 'admin';
        else {
          const raw = explainChannelPermissions(index, channel.id, { kind: 'role', roleId: role.id }).raw;
          if ((raw & VIEW_CHANNEL) === VIEW_CHANNEL) {
            value = (raw & SEND_MESSAGES) === SEND_MESSAGES ? 'write' : 'read';
          }
        }
        cells.set(`${role.id}:${channel.id}`, value);
      }
    }
    return { roles, channels, cells };
  }, [index]);

  const shownRoles = roles.filter((role) => role.name.toLowerCase().includes(roleQuery.trim().toLowerCase()));
  const shownChannels = channels.filter((channel) =>
    channel.name.toLowerCase().includes(channelQuery.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative">
          <IconSearch className="absolute top-2.5 left-2.5 text-ink-faint" />
          <Input
            value={roleQuery}
            onChange={(event) => setRoleQuery(event.target.value)}
            placeholder={copy.explorer.searchRoles}
            className="w-48 pl-8"
          />
        </label>
        <label className="relative">
          <IconSearch className="absolute top-2.5 left-2.5 text-ink-faint" />
          <Input
            value={channelQuery}
            onChange={(event) => setChannelQuery(event.target.value)}
            placeholder={copy.explorer.searchChannels}
            className="w-48 pl-8"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="warning">{copy.matrix.legendAdmin}</Badge>
          <Badge tone="allow">{copy.matrix.legendWrite}</Badge>
          <Badge tone="info">{copy.matrix.legendRead}</Badge>
          <Badge tone="neutral">{copy.matrix.legendHidden}</Badge>
        </div>
      </div>

      {/* Counts are shown rather than silently truncating at 50 x 100. */}
      <p className="text-xs text-ink-faint">
        {fill(copy.matrix.showing, { roles: shownRoles.length, channels: shownChannels.length })}
      </p>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-max border-collapse text-xs">
            <caption className="sr-only">{copy.matrix.title}</caption>
            <thead>
              <tr>
                <th className="sticky left-0 z-20 border-b border-line bg-surface-raised px-3 py-2 text-left font-medium">
                  {copy.common.role}
                </th>
                {shownChannels.map((channel) => (
                  <th
                    key={channel.id}
                    scope="col"
                    className="border-b border-line px-1 py-2 text-left font-normal text-ink-muted"
                  >
                    <span className="block max-w-24 truncate" title={channel.name}>
                      {channel.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownRoles.map((role) => (
                <tr key={role.id} className="defer-paint">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-40 truncate border-b border-line/60 bg-surface-raised px-3 py-1.5 text-left font-normal"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: role.color ?? '#6b7a96' }}
                        aria-hidden
                      />
                      <span className="truncate" title={role.name}>
                        {role.name}
                      </span>
                    </span>
                  </th>
                  {shownChannels.map((channel) => {
                    const value = cells.get(`${role.id}:${channel.id}`) ?? 'hidden';
                    return (
                      <td key={channel.id} className="border-b border-line/60 p-0.5">
                        {/* Cells were inert <td>s — a complete dead end. */}
                        <Link
                          href={`/guilds/${guildId}/explorer?role=${role.id}&channel=${channel.id}`}
                          title={`${role.name} → ${channel.name}`}
                          className={cx(
                            'block h-6 w-full rounded text-center leading-6',
                            cellStyles[value],
                            'hover:ring-1 hover:ring-brand',
                          )}
                        >
                          {value === 'admin' ? 'A' : value === 'write' ? '✓' : value === 'read' ? '·' : ''}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
