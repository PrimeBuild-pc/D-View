import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { permissionBits, type PermissionSnapshot } from '@dpd/shared';
import type { ChangeOperation } from '@dpd/permission-engine';
import { Explorer } from '../app/guilds/[guildId]/explorer/explorer';
import { ApplyForm } from '../app/guilds/[guildId]/changes/[planId]/apply-form';
import { MemberBulk } from '../app/guilds/[guildId]/members/members';
import { OperationSummary } from './operation-summary';
import { GuildNav } from './guild-nav';
import { fill, languages, t, type Lang } from '../lib/i18n';
import { auditText, localizedPermissionLabel, permissionRows } from '../lib/permissions-ui';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/guilds/1',
}));

const snapshot: PermissionSnapshot = {
  schemaVersion: '2.0.0',
  exportedAt: '2026-01-01T00:00:00.000Z',
  guild: { id: '1', name: 'SendMessages', ownerId: '2', everyoneRoleId: '1' },
  roles: [{ id: '1', name: 'Administrator', position: 0, managed: false, permissions: '1024' }],
  channels: [{ id: '3', name: 'ViewChannel', type: 0, position: 0, overwrites: [] }],
};

const operation: ChangeOperation = {
  kind: 'set-channel-overwrite', channelId: '3', targetType: 'role', targetId: '1',
  touched: permissionBits.SendMessages | permissionBits.ViewChannel | (1n << 60n),
  nextAllow: permissionBits.SendMessages | (1n << 60n), nextDeny: 0n,
  expectedAllow: permissionBits.ViewChannel, expectedDeny: 0n,
};

// Decode markup escaping by rendering the expected text with the same renderer.
const escaped = (text: string) => renderToStaticMarkup(<>{text}</>);

describe('localized guild UI', () => {
  it.each(Object.keys(languages) as Lang[])('renders permission, operation, channel and ARIA labels in %s', (lang) => {
    const copy = t(lang);
    const summary = renderToStaticMarkup(<OperationSummary operation={operation} snapshot={snapshot} copy={copy} />);
    expect(summary).toContain(escaped(copy.permissionNames.SendMessages));
    expect(summary).toContain(escaped(copy.operationKinds['set-channel-overwrite']));
    expect(summary).toContain(escaped(copy.changes.cleared));
    expect(summary).toContain(escaped(fill(copy.common.unknownPermission, { bit: String(1n << 60n) })));
    expect(summary).toContain(`aria-label="${escaped(copy.channelKinds.text)}"`);
    expect(summary).toContain('Administrator');
    expect(summary).toContain('ViewChannel');

    const explorer = renderToStaticMarkup(<Explorer snapshot={snapshot} copy={copy} lang={lang} guildId="1" baseSnapshotId="2" canWrite initialChannelId="3" />);
    expect(explorer).toContain(escaped(copy.permissionGroups.general));
    for (const state of ['allow', 'inherit', 'deny'] as const) {
      expect(explorer).toContain(`aria-label="${escaped(`${copy.permissionNames.ViewChannel}: ${copy.common[state]}`)}"`);
    }
    expect(permissionRows('general', copy).find((row) => row.bit === permissionBits.ViewChannel)?.label)
      .toBe(copy.permissionNames.ViewChannel);
    expect(localizedPermissionLabel(permissionBits.SendMessages, copy)).toBe(copy.permissionNames.SendMessages);
  });

  it('translates only permission parameters, not user content with the same spelling', () => {
    const copy = t('it');
    expect(auditText(copy, { code: 'everyone-dangerous-permission', severity: 'critical', params: { permission: 'Administrator' } }, 'it'))
      .toContain(copy.permissionNames.Administrator);
    expect(auditText(copy, { code: 'administrator-role', severity: 'warning', params: { role: 'Administrator' } }, 'it'))
      .toContain('Administrator');
    expect(auditText(copy, { code: 'redundant-overwrite', severity: 'info', params: { channel: 'ViewChannel', target: '123456789' } }, 'it', true))
      .toContain('123456789');
  });

  it('uses Russian plural rules for audit counts', () => {
    const copy = t('ru');
    const customCopy = { ...copy, audit: { ...copy.audit, 'many-overwrites': '{channel}: one {count}|{channel}: few {count}|{channel}: many {count}' } };
    for (const [count, form] of [[1, 'one'], [2, 'few'], [5, 'many'], [21, 'one'], [22, 'few']] as const) {
      expect(auditText(customCopy, { code: 'many-overwrites', severity: 'info', params: { channel: 'Original', count } }, 'ru'))
        .toBe(`Original: ${form} ${count}`);
    }
  });

  it('localizes delete and cleared operation descriptions without renaming member IDs', () => {
    const copy = t('fr');
    const markup = renderToStaticMarkup(<OperationSummary operation={{ ...operation, kind: 'delete-channel-overwrite', targetType: 'member', targetId: '123456789', nextAllow: 0n }} snapshot={snapshot} copy={copy} />);
    expect(markup).toContain(escaped(copy.operationKinds['delete-channel-overwrite']));
    expect(markup).toContain(escaped(copy.changes.cleared));
    expect(markup).toContain(`${escaped(copy.common.member)} 123456789`);
    expect(markup).not.toContain(escaped(copy.changes.discard));
  });

  it('shows confirmation instructions for non-risky plans and names the guild navigation', () => {
    const copy = t('de');
    const form = renderToStaticMarkup(<ApplyForm action="/unused" guildName="SendMessages" risky={false} copy={copy} />);
    expect(form).toContain(escaped(fill(copy.changes.confirmTyping, { name: 'SendMessages' })));
    expect(form).toContain(escaped(copy.changes.confirmHelp));
    expect(form).toContain('aria-describedby=');
    const nav = renderToStaticMarkup(<GuildNav items={[]} label={copy.nav.serverSections} />);
    expect(nav).toContain(`aria-label="${escaped(copy.nav.serverSections)}"`);
  });

  it('formats the member sync timestamp consistently across server and browser time zones', () => {
    const lang = 'it';
    const copy = t(lang);
    const syncedAt = '2026-01-01T12:30:00.000Z';
    const expected = new Intl.DateTimeFormat(lang, {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
    }).format(new Date(syncedAt));
    try {
      for (const zone of ['UTC', 'Pacific/Honolulu']) {
        vi.stubEnv('TZ', zone);
        const markup = renderToStaticMarkup(<MemberBulk copy={copy} lang={lang} guildId="1" count={2} syncedAt={syncedAt} />);
        expect(markup).toContain(escaped(`${expected} UTC`));
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
