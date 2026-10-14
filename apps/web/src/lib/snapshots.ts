import { prisma, toJson } from '@dpd/database';
import { permissionSnapshotSchema, SNAPSHOT_SCHEMA_VERSION, type PermissionSnapshot } from '@dpd/shared';
import { discord, type DiscordChannelPayload, type DiscordGuildPayload, type DiscordRolePayload } from './discord';

export async function snapshotGuild(guildId: string): Promise<PermissionSnapshot> {
  const [guild, roles, channels] = await Promise.all([
    discord<DiscordGuildPayload>(`/guilds/${guildId}`),
    discord<DiscordRolePayload[]>(`/guilds/${guildId}/roles`),
    discord<DiscordChannelPayload[]>(`/guilds/${guildId}/channels`),
  ]);
  const snapshot = permissionSnapshotSchema.parse({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    guild: { id: guild.id, name: guild.name, ownerId: guild.owner_id, everyoneRoleId: guild.id },
    roles: roles.map((role) => ({
      id: role.id, name: role.name,
      ...(role.color ? { color: `#${role.color.toString(16).padStart(6, '0')}` } : {}),
      position: role.position, managed: role.managed, permissions: role.permissions,
    })),
    channels: channels.map((channel) => ({
      id: channel.id, name: channel.name, type: channel.type, position: channel.position,
      ...(channel.parent_id ? { parentId: channel.parent_id } : {}),
      overwrites: (channel.permission_overwrites ?? []).map((overwrite) => ({
        targetType: overwrite.type === 1 ? 'member' : 'role', targetId: overwrite.id,
        allow: overwrite.allow, deny: overwrite.deny,
      })),
    })),
    metadata: { source: 'discord-rest-sync' },
  }) as PermissionSnapshot;
  if (snapshot.guild.id !== guildId) throw new Error('Discord returned a different server.');
  return snapshot;
}

export async function storeSnapshot(snapshot: PermissionSnapshot, reason: string): Promise<void> {
  const guildId = snapshot.guild.id;
  const roleIds = snapshot.roles.map((role) => role.id);
  const channelIds = snapshot.channels.map((channel) => channel.id);
  await prisma.$transaction([
    prisma.discordGuild.upsert({
      where: { id: guildId },
      create: { id: guildId, name: snapshot.guild.name, ownerId: snapshot.guild.ownerId },
      update: { name: snapshot.guild.name, ownerId: snapshot.guild.ownerId },
    }),
    ...snapshot.roles.map((role) => {
      const fields = { name: role.name, color: role.color ?? null, position: role.position,
        managed: role.managed, permissions: role.permissions };
      return prisma.discordRole.upsert({
        where: { id: role.id }, create: { id: role.id, guildId, ...fields }, update: fields,
      });
    }),
    ...snapshot.channels.map((channel) => {
      const fields = { parentId: channel.parentId ?? null, name: channel.name, type: channel.type,
        position: channel.position, overwrites: toJson(channel.overwrites) };
      return prisma.discordChannel.upsert({
        where: { id: channel.id }, create: { id: channel.id, guildId, ...fields }, update: fields,
      });
    }),
    prisma.discordRole.deleteMany({ where: { guildId, id: { notIn: roleIds } } }),
    prisma.discordChannel.deleteMany({ where: { guildId, id: { notIn: channelIds } } }),
    prisma.permissionSnapshot.create({
      data: { guildId, version: snapshot.schemaVersion, data: toJson(snapshot), reason },
    }),
  ]);
}
