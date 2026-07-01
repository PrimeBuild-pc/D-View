import { NextResponse } from 'next/server';
import { auditSnapshot } from '@dpd/permission-engine';
import { prisma } from '@dpd/database';
import { permissionsFromBitfield, type DiscordChannelSnapshot, type PermissionOverwrite, type PermissionSnapshot } from '@dpd/shared';
import { canReadGuild, getSession } from '@/lib/session';

function json(value: unknown): never {
  return value as never;
}

type DiscordRole = { id: string; name: string; color: number; position: number; managed: boolean; permissions: string };
type DiscordChannel = { id: string; name: string; type: number; parent_id?: string | null; permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }> };

async function discord<T>(path: string): Promise<T> {
  const response = await fetch(`https://discord.com/api/v10${path}`, { headers: { authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
  if (!response.ok) throw new Error(`Discord ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

function channelType(type: number): DiscordChannelSnapshot['type'] | null {
  if (type === 4) return 'category';
  if (type === 0 || type === 5) return 'text';
  if (type === 2) return 'voice';
  return null;
}

async function snapshotGuild(guildId: string): Promise<PermissionSnapshot> {
  const [guild, roles, channels] = await Promise.all([
    discord<{ id: string; name: string }>(`/guilds/${guildId}`),
    discord<DiscordRole[]>(`/guilds/${guildId}/roles`),
    discord<DiscordChannel[]>(`/guilds/${guildId}/channels`),
  ]);

  return {
    schemaVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    guild: { id: guild.id as never, name: guild.name, everyoneRoleId: guild.id as never },
    roles: roles.map((role) => ({
      id: role.id as never,
      name: role.name,
      ...(role.color ? { color: `#${role.color.toString(16).padStart(6, '0')}` } : {}),
      position: role.position,
      managed: role.managed,
      permissions: permissionsFromBitfield(role.permissions),
    })),
    channels: channels.flatMap((channel) => {
      const type = channelType(channel.type);
      if (!type) return [];
      return [{
        id: channel.id as never,
        name: channel.name,
        type,
        ...(channel.parent_id ? { parentId: channel.parent_id as never } : {}),
        overwrites: (channel.permission_overwrites ?? []).map((overwrite): PermissionOverwrite => ({
          targetType: overwrite.type === 1 ? 'member' : 'role',
          targetId: overwrite.id as never,
          allow: permissionsFromBitfield(overwrite.allow),
          deny: permissionsFromBitfield(overwrite.deny),
        })),
      }];
    }),
    metadata: { source: 'discord-rest-sync' },
  };
}

async function storeSnapshot(snapshot: PermissionSnapshot): Promise<void> {
  await prisma.discordGuild.upsert({
    where: { id: snapshot.guild.id },
    create: { id: snapshot.guild.id, name: snapshot.guild.name },
    update: { name: snapshot.guild.name },
  });

  for (const role of snapshot.roles) {
    await prisma.discordRole.upsert({
      where: { id: role.id },
      create: { id: role.id, guildId: snapshot.guild.id, name: role.name, color: role.color ?? null, position: role.position, managed: role.managed, permissions: json(role.permissions) },
      update: { name: role.name, color: role.color ?? null, position: role.position, managed: role.managed, permissions: json(role.permissions) },
    });
  }

  for (const channel of snapshot.channels) {
    await prisma.discordChannel.upsert({
      where: { id: channel.id },
      create: { id: channel.id, guildId: snapshot.guild.id, parentId: channel.parentId ?? null, name: channel.name, type: channel.type, overwrites: json(channel.overwrites) },
      update: { parentId: channel.parentId ?? null, name: channel.name, type: channel.type, overwrites: json(channel.overwrites) },
    });
  }

  await prisma.permissionSnapshot.create({ data: { guildId: snapshot.guild.id, version: snapshot.schemaVersion, data: json(snapshot), reason: 'rest-readonly-sync' } });
  await prisma.auditFinding.deleteMany({ where: { guildId: snapshot.guild.id } });
  const findings = auditSnapshot(snapshot).map((finding) => ({
    guildId: snapshot.guild.id,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    ...(finding.channelId ? { channelId: finding.channelId } : {}),
    ...(finding.roleId ? { roleId: finding.roleId } : {}),
  }));
  if (findings.length) await prisma.auditFinding.createMany({ data: findings });
}

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') ?? 'en';

  if (!allowed) return NextResponse.redirect(new URL(`/guilds?lang=${lang}&sync=unauthorized`, request.url), 303);
  if (!process.env.DISCORD_BOT_TOKEN) return NextResponse.redirect(new URL(`/guilds/${guildId}?lang=${lang}&sync=missing-token`, request.url), 303);

  try {
    await storeSnapshot(await snapshotGuild(guildId));
    return NextResponse.redirect(new URL(`/guilds/${guildId}?lang=${lang}&sync=ok`, request.url), 303);
  } catch (error) {
    console.error('Discord sync failed', error);
    return NextResponse.redirect(new URL(`/guilds/${guildId}?lang=${lang}&sync=failed`, request.url), 303);
  }
}
