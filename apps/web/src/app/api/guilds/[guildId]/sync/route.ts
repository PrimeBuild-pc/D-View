import { NextResponse } from 'next/server';
import { prisma, toJson } from '@dpd/database';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type DiscordChannelSnapshot,
  type PermissionOverwrite,
  type PermissionSnapshot,
} from '@dpd/shared';
import {
  discord,
  type DiscordChannelPayload,
  type DiscordGuildPayload,
  type DiscordRolePayload,
} from '@/lib/discord';
import { canReadGuild, getSession } from '@/lib/session';

export async function snapshotGuild(guildId: string): Promise<PermissionSnapshot> {
  const [guild, roles, channels] = await Promise.all([
    discord<DiscordGuildPayload>(`/guilds/${guildId}`),
    discord<DiscordRolePayload[]>(`/guilds/${guildId}/roles`),
    discord<DiscordChannelPayload[]>(`/guilds/${guildId}/channels`),
  ]);

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    guild: {
      id: guild.id,
      name: guild.name,
      ownerId: guild.owner_id,
      // @everyone's role id is always the guild id.
      everyoneRoleId: guild.id,
    },
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      ...(role.color ? { color: `#${role.color.toString(16).padStart(6, '0')}` } : {}),
      position: role.position,
      managed: role.managed,
      permissions: role.permissions,
    })),
    // Every channel is kept, including forum, stage, media and thread types the
    // old mapping dropped on the floor — those channels were invisible to the
    // audit, which then reported the server as clean.
    channels: channels.map((channel): DiscordChannelSnapshot => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: channel.position,
      ...(channel.parent_id ? { parentId: channel.parent_id } : {}),
      overwrites: (channel.permission_overwrites ?? []).map(
        (overwrite): PermissionOverwrite => ({
          targetType: overwrite.type === 1 ? 'member' : 'role',
          targetId: overwrite.id,
          allow: overwrite.allow,
          deny: overwrite.deny,
        }),
      ),
    })),
    metadata: { source: 'discord-rest-sync' },
  };
}

export async function storeSnapshot(snapshot: PermissionSnapshot, reason: string): Promise<void> {
  const guildId = snapshot.guild.id;
  const roleIds = snapshot.roles.map((role) => role.id);
  const channelIds = snapshot.channels.map((channel) => channel.id);

  // One transaction: a failure part-way used to leave a half-written guild with
  // no snapshot row at all.
  await prisma.$transaction([
    prisma.discordGuild.upsert({
      where: { id: guildId },
      create: { id: guildId, name: snapshot.guild.name, ownerId: snapshot.guild.ownerId },
      update: { name: snapshot.guild.name, ownerId: snapshot.guild.ownerId },
    }),
    ...snapshot.roles.map((role) =>
      prisma.discordRole.upsert({
        where: { id: role.id },
        create: {
          id: role.id,
          guildId,
          name: role.name,
          color: role.color ?? null,
          position: role.position,
          managed: role.managed,
          permissions: role.permissions,
        },
        update: {
          name: role.name,
          color: role.color ?? null,
          position: role.position,
          managed: role.managed,
          permissions: role.permissions,
        },
      }),
    ),
    ...snapshot.channels.map((channel) =>
      prisma.discordChannel.upsert({
        where: { id: channel.id },
        create: {
          id: channel.id,
          guildId,
          parentId: channel.parentId ?? null,
          name: channel.name,
          type: channel.type,
          position: channel.position,
          overwrites: toJson(channel.overwrites),
        },
        update: {
          parentId: channel.parentId ?? null,
          name: channel.name,
          type: channel.type,
          position: channel.position,
          overwrites: toJson(channel.overwrites),
        },
      }),
    ),
    // Roles and channels deleted on Discord used to linger in the database forever.
    prisma.discordRole.deleteMany({ where: { guildId, id: { notIn: roleIds } } }),
    prisma.discordChannel.deleteMany({ where: { guildId, id: { notIn: channelIds } } }),
    prisma.permissionSnapshot.create({
      data: { guildId, version: snapshot.schemaVersion, data: toJson(snapshot), reason },
    }),
  ]);
}

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));

  if (!allowed) return NextResponse.redirect(new URL(`/guilds?sync=unauthorized`, request.url), 303);
  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.redirect(new URL(`/guilds/${guildId}?sync=missing-token`, request.url), 303);
  }

  try {
    await storeSnapshot(await snapshotGuild(guildId), 'rest-readonly-sync');
    return NextResponse.redirect(new URL(`/guilds/${guildId}?sync=ok`, request.url), 303);
  } catch (error) {
    // The real cause used to reach console.error and nothing else, so the user
    // saw "Sync failed" with no way to find out why.
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Discord sync failed', error);
    return NextResponse.redirect(
      new URL(`/guilds/${guildId}?sync=failed&detail=${encodeURIComponent(detail)}`, request.url),
      303,
    );
  }
}
