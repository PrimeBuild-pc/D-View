import { NextResponse } from 'next/server';
import { prisma } from '@dpd/database';
import { permissionsToBitfield, type PermissionName, type PermissionOverwrite } from '@dpd/shared';
import { canReadGuild, getSession } from '@/lib/session';

function json(value: unknown): never {
  return value as never;
}

async function discord(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: response.ok, status: response.status, body };
}

async function applyOperation(guildId: string, operation: { kind: string; targetId: string; after: unknown }) {
  if (operation.kind === 'set-role-permissions') {
    const roleId = operation.targetId;
    return discord(`/guilds/${guildId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ permissions: permissionsToBitfield(operation.after as PermissionName[]) }),
    });
  }

  const [channelId, targetType, targetId] = operation.targetId.split(':');
  if (!channelId || targetType !== 'role' || !targetId) return { ok: false, status: 400, body: 'Unsupported operation target' };

  if (operation.kind === 'delete-role-channel-overwrite') {
    return discord(`/channels/${channelId}/permissions/${targetId}`, { method: 'DELETE' });
  }

  if (operation.kind === 'set-role-channel-overwrite') {
    const overwrite = operation.after as PermissionOverwrite;
    return discord(`/channels/${channelId}/permissions/${targetId}`, {
      method: 'PUT',
      body: JSON.stringify({
        type: 0,
        allow: permissionsToBitfield(overwrite.allow),
        deny: permissionsToBitfield(overwrite.deny),
      }),
    });
  }

  return { ok: false, status: 400, body: `Unsupported operation kind: ${operation.kind}` };
}

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string; planId: string }> }) {
  const { guildId, planId } = await params;
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) return NextResponse.redirect(new URL(`/guilds/${guildId}/plans/${planId}?execute=unauthorized`, request.url), 303);

  const form = await request.formData();
  if (form.get('confirm') !== 'APPLY') return NextResponse.redirect(new URL(`/guilds/${guildId}/plans/${planId}?execute=confirm`, request.url), 303);
  if (process.env.ENABLE_DISCORD_WRITES !== 'true') return NextResponse.redirect(new URL(`/guilds/${guildId}/plans/${planId}?execute=disabled`, request.url), 303);
  if (!process.env.DISCORD_BOT_TOKEN) return NextResponse.redirect(new URL(`/guilds/${guildId}/plans/${planId}?execute=missing-token`, request.url), 303);

  const plan = await prisma.permissionChangePlan.findFirst({ where: { id: planId, guildId }, include: { operations: { orderBy: { order: 'asc' } } } });
  const latest = await prisma.permissionSnapshot.findFirst({ where: { guildId }, orderBy: { createdAt: 'desc' } });
  if (!plan || !latest) return NextResponse.redirect(new URL(`/guilds/${guildId}/plans/${planId}?execute=missing`, request.url), 303);

  await prisma.permissionSnapshot.create({ data: { guildId, version: latest.version, data: json(latest.data), reason: `pre-apply-plan:${planId}` } });
  const execution = await prisma.permissionChangeExecution.create({ data: { planId, status: 'running', result: [] } });

  const results = [];
  for (const operation of plan.operations) {
    const result = await applyOperation(guildId, operation);
    results.push({ operationId: operation.id, kind: operation.kind, targetId: operation.targetId, ...result });
    if (!result.ok) break;
  }

  const failed = results.some((result) => !result.ok);
  await prisma.permissionChangeExecution.update({
    where: { id: execution.id },
    data: { status: failed ? 'failed' : 'succeeded', result: json(results), finishedAt: new Date() },
  });
  await prisma.permissionChangePlan.update({ where: { id: planId }, data: { status: failed ? 'failed' : 'applied' } });

  return NextResponse.redirect(new URL(`/guilds/${guildId}/plans/${planId}?execute=${failed ? 'failed' : 'ok'}`, request.url), 303);
}
