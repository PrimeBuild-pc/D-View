import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, Notice } from './ui';
import { MemberBulk } from '../app/guilds/[guildId]/members/members';
import { RollbackButton } from '../app/guilds/[guildId]/changes/[planId]/rollback-button';
import { ImportForm } from '../app/guilds/[guildId]/import/import-form';
import { Matrix } from '../app/guilds/[guildId]/matrix/matrix';
import { Explorer } from '../app/guilds/[guildId]/explorer/explorer';
import { t } from '../lib/i18n';
import type { PermissionSnapshot } from '@dpd/shared';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
vi.mock('@/components/ui', () => import('./ui'));
vi.mock('@/components/icons', () => import('./icons'));
vi.mock('@/components/operation-summary', () => import('./operation-summary'));
vi.mock('@/lib/i18n', () => import('../lib/i18n'));
vi.mock('@/lib/permissions-ui', () => import('../lib/permissions-ui'));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const copy = t('en');
const snapshot: PermissionSnapshot = {
  schemaVersion: '2.0.0',
  exportedAt: '2026-01-01T00:00:00.000Z',
  guild: { id: '1', name: 'Test', ownerId: '2', everyoneRoleId: '1' },
  roles: [{ id: '1', name: '@everyone', position: 0, managed: false, permissions: '0' }],
  channels: [
    { id: '3', name: 'lobby', type: 0, position: 0, overwrites: [{ targetType: 'role', targetId: '1', allow: '1024', deny: '0' }] },
    { id: '4', name: 'staff', type: 0, position: 1, overwrites: [] },
  ],
};

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) =>
    React.isValidElement<Record<string, unknown>>(child)
      ? [child, ...elements(child.props.children as React.ReactNode)]
      : [],
  );
}

// Exercise event handlers without adding a DOM or renderer dependency.
function mockState(values: unknown[]) {
  const setters = values.map(() => vi.fn());
  let index = 0;
  vi.mocked(React.useState).mockImplementation(() => {
    const position = index++;
    return [values[position], setters[position]] as ReturnType<typeof React.useState>;
  });
  return setters;
}

async function click(tree: React.ReactNode, label: string) {
  const button = elements(tree).find((element) => element.type === Button && element.props.children === label);
  expect(button).toBeDefined();
  await (button!.props.onClick as () => Promise<void>)();
}

afterEach(() => {
  vi.mocked(React.useState).mockReset();
  vi.unstubAllGlobals();
});

describe('accessible UI states', () => {
  it('announces errors and success without turning standing warnings into alerts', () => {
    expect(renderToStaticMarkup(<Notice tone="critical">Failed</Notice>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Notice tone="allow">Saved</Notice>)).toContain('role="status"');
    expect(renderToStaticMarkup(<Notice tone="warning">Review</Notice>)).not.toContain('role=');
    expect(renderToStaticMarkup(<Notice tone="warning" role="alert">Failed</Notice>)).toContain('role="alert"');
  });

  it('only submits forms when explicitly requested', () => {
    expect(renderToStaticMarkup(<Button>Review</Button>)).toContain('type="button"');
    expect(renderToStaticMarkup(<Button type="submit">Apply</Button>)).toContain('type="submit"');
  });

  it('names search fields, hidden matrix cells and permission toggles', async () => {
    const actual = await vi.importActual<typeof React>('react');
    vi.mocked(React.useState).mockImplementation(actual.useState);
    const matrix = renderToStaticMarkup(<Matrix snapshot={snapshot} copy={copy} guildId="1" />);
    expect(matrix).toContain('<span class="sr-only">Search roles</span>');
    expect(matrix).toContain('<span class="sr-only">Search channels</span>');
    expect(matrix).toContain('aria-label="@everyone → staff: Hidden"');
    expect(matrix).toContain('tabindex="0" role="region"');
    const explorer = renderToStaticMarkup(<Explorer snapshot={snapshot} copy={copy} guildId="1" baseSnapshotId="2" canWrite initialChannelId="3" />);
    expect(explorer).toMatch(/aria-label="[^"]+: allow"/);
    expect(explorer).toMatch(/aria-label="[^"]+: inherit"/);
    expect(explorer).toMatch(/aria-label="[^"]+: deny"/);
    expect(explorer).toContain('focus-visible:-outline-offset-2');
    expect(explorer).toContain('aria-pressed="true"');
  });

  it('recovers member sync after a network failure', async () => {
    const [setState] = mockState([{ status: 'idle' }]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    await click(MemberBulk({ copy, guildId: '1', count: 0, syncedAt: null }), copy.members.bulkAction);
    expect(setState).toHaveBeenLastCalledWith({ status: 'error', message: 'Offline' });
  });

  it('recovers rollback creation after an unreadable response', async () => {
    const [setBusy, setError] = mockState([false, null]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.reject(new Error('Invalid JSON')) }));
    await click(RollbackButton({ guildId: '1', planId: '2', label: 'Rollback', pending: 'Creating' }), 'Rollback');
    expect(setError).toHaveBeenLastCalledWith('Invalid JSON');
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it('recovers import plan creation after a network failure', async () => {
    const [, , setError, , , , setCreating] = mockState([
      '{}', { baseSnapshotId: '2', operations: [{ kind: 'set-role-permissions', roleId: '3', touched: '1', nextAllow: '1' }], warnings: [] }, null, {}, '', false, false,
    ]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    await click(ImportForm({ copy, guildId: '1', snapshot }), copy.changes.createPlan);
    expect(setError).toHaveBeenLastCalledWith('Offline');
    expect(setCreating).toHaveBeenLastCalledWith(false);
  });

  it('recovers import validation when a file cannot be read', async () => {
    const [, setResult, setError, , , setValidating] = mockState(['{}', null, null, {}, '', false, false]);
    const tree = ImportForm({ copy, guildId: '1', snapshot });
    const fileInput = elements(tree).find((element) => element.type === 'input' && element.props.type === 'file')!;
    await (fileInput.props.onChange as (event: unknown) => Promise<void>)({
      target: { files: [{ text: () => Promise.reject(new Error('Unreadable file')) }] },
    });
    expect(setResult).toHaveBeenCalledWith(null);
    expect(setError).toHaveBeenLastCalledWith('Unreadable file');
    expect(setValidating).toHaveBeenLastCalledWith(false);
  });

  it('invalidates the reviewed import when pasted JSON changes', () => {
    const [setJson, setResult, setError] = mockState(['{}', null, null, {}, '', false, false]);
    const tree = ImportForm({ copy, guildId: '1', snapshot });
    const textarea = elements(tree).find((element) => element.type === 'textarea')!;
    (textarea.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '{' } });
    expect(setJson).toHaveBeenCalledWith('{');
    expect(setResult).toHaveBeenCalledWith(null);
    expect(setError).toHaveBeenCalledWith(null);
  });
});
