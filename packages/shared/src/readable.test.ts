import { describe, expect, it } from 'vitest';
import {
  fromReadable,
  permissionBits as P,
  toReadable,
  type PermissionSnapshot,
} from './index';

const G = '100';
const bits = (...values: bigint[]) =>
  values.reduce((a, b) => a | b, 0n).toString();
const UNKNOWN = 1n << 60n; // a bit this build has no name for

function snapshot(): PermissionSnapshot {
  return {
    schemaVersion: '2.0.0',
    exportedAt: '2026-11-05T00:00:00.000Z',
    guild: { id: G, name: 'Test', ownerId: '1', everyoneRoleId: G },
    roles: [
      {
        id: G,
        name: '@everyone',
        position: 0,
        managed: false,
        permissions: bits(P.ViewChannel, UNKNOWN),
      },
      {
        id: '200',
        name: 'Member',
        position: 1,
        managed: false,
        permissions: bits(P.SendMessages),
      },
      {
        id: '300',
        name: 'Staff',
        position: 2,
        managed: false,
        permissions: bits(P.ManageMessages),
      },
    ],
    channels: [
      {
        id: '10',
        name: 'info',
        type: 4,
        position: 0,
        overwrites: [
          {
            targetType: 'role',
            targetId: G,
            allow: '0',
            deny: bits(P.SendMessages, UNKNOWN),
          },
        ],
      },
      {
        id: '11',
        name: 'rules',
        type: 0,
        parentId: '10',
        position: 1,
        overwrites: [
          {
            targetType: 'role',
            targetId: G,
            allow: '0',
            deny: bits(P.SendMessages, UNKNOWN),
          },
        ],
      },
      {
        id: '12',
        name: 'staff',
        type: 0,
        parentId: '10',
        position: 2,
        overwrites: [
          {
            targetType: 'role',
            targetId: G,
            allow: '0',
            deny: bits(P.ViewChannel),
          },
        ],
      },
      { id: '13', name: 'lobby', type: 2, position: 3, overwrites: [] },
      {
        id: '14',
        name: 'a-thread',
        type: 11,
        parentId: '11',
        position: 0,
        overwrites: [],
      },
    ],
  };
}

const roundTrip = (edit: (file: ReturnType<typeof toReadable>) => void) => {
  const file = JSON.parse(JSON.stringify(toReadable(snapshot())));
  edit(file);
  return fromReadable(file, snapshot());
};

describe('readable permission map', () => {
  it('nests channels under categories with names, flags synced children and skips threads', () => {
    const file = toReadable(snapshot());
    expect(file.roles.map((r) => r.name)).toEqual([
      'Staff',
      'Member',
      '@everyone',
    ]);
    expect(file.channels.map((c) => c.name)).toEqual(['lobby', 'info']);
    const info = file.channels[1]!;
    expect(info.overwrites).toEqual([
      { role: '@everyone', allow: [], deny: ['SendMessages'] },
    ]);
    expect(info.channels).toEqual([
      { id: '11', name: 'rules', type: 'text', syncedWithCategory: true },
      {
        id: '12',
        name: 'staff',
        type: 'text',
        syncedWithCategory: false,
        overwrites: [{ role: '@everyone', allow: [], deny: ['ViewChannel'] }],
      },
    ]);
  });

  it('is lossless when nothing is edited, including bits without a name', () => {
    const result = roundTrip(() => {});
    const base = snapshot();
    expect(result.roles).toEqual(base.roles);
    expect(result.channels).toEqual(base.channels);
  });

  it('writes ids for duplicate role names so the export still round-trips', () => {
    const base = snapshot();
    base.roles.push({
      id: '400',
      name: 'Staff',
      position: 3,
      managed: true,
      permissions: '0',
    });
    base.channels[0]!.overwrites.push({
      targetId: '400',
      targetType: 'role',
      allow: bits(P.ViewChannel),
      deny: '0',
    });
    const file = JSON.parse(JSON.stringify(toReadable(base)));
    expect(JSON.stringify(file)).toContain('"role":"400"');
    expect(fromReadable(file, base).channels).toEqual(base.channels);
  });

  it('applies name-based edits and propagates category changes to synced children only', () => {
    const result = roundTrip((file) => {
      file.roles
        .find((r) => r.name === 'Member')!
        .permissions.push('AttachFiles');
      const info = file.channels[1]!;
      info.overwrites!.push({
        role: 'Staff',
        allow: ['SendMessages'],
        deny: [],
      });
    });
    expect(result.roles.find((r) => r.id === '200')!.permissions).toBe(
      bits(P.SendMessages, P.AttachFiles),
    );
    const staffOverwrite = {
      targetType: 'role',
      targetId: '300',
      allow: bits(P.SendMessages),
      deny: '0',
    };
    expect(
      result.channels.find((c) => c.id === '10')!.overwrites,
    ).toContainEqual(staffOverwrite);
    expect(
      result.channels.find((c) => c.id === '11')!.overwrites,
    ).toContainEqual(staffOverwrite);
    expect(
      result.channels.find((c) => c.id === '12')!.overwrites,
    ).not.toContainEqual(staffOverwrite);
    // The unnamed bit on the category deny survives the edit.
    expect(
      BigInt(result.channels.find((c) => c.id === '10')!.overwrites[0]!.deny) &
        UNKNOWN,
    ).toBe(UNKNOWN);
  });

  it('lets a channel leave the category sync with its own overwrites', () => {
    const result = roundTrip((file) => {
      Object.assign(file.channels[1]!.channels![0]!, {
        syncedWithCategory: false,
        overwrites: [{ member: '999', allow: ['SendMessages'], deny: [] }],
      });
    });
    expect(result.channels.find((c) => c.id === '11')!.overwrites).toEqual([
      {
        targetType: 'member',
        targetId: '999',
        allow: bits(P.SendMessages),
        deny: '0',
      },
    ]);
  });

  it.each([
    [
      'unknown permission names',
      (f: any) => f.roles[0].permissions.push('FlyToTheMoon'),
      /Unknown permission names: FlyToTheMoon/,
    ],
    [
      'unknown roles',
      (f: any) =>
        f.channels[1].overwrites.push({ role: 'Ghost', allow: [], deny: [] }),
      /Unknown role "Ghost"/,
    ],
    [
      'allow/deny overlap',
      (f: any) => f.channels[1].overwrites[0].allow.push('SendMessages'),
      /both allowed and denied/,
    ],
    [
      'new channels',
      (f: any) => f.channels.push({ id: '77', name: 'new', type: 'text' }),
      /channels cannot be created/,
    ],
    ['another server', (f: any) => (f.guild.id = '555'), /different server/],
  ])('rejects %s', (_label, edit, message) => {
    expect(() => roundTrip(edit)).toThrow(message);
  });
});
