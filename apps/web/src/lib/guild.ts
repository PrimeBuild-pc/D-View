import { cache } from 'react';
import { getSession, canReadGuild, type DiscordSession, type DiscordUserGuild } from './session';
import { discord, type DiscordGuildPayload, type DiscordMemberPayload, type DiscordRolePayload } from './discord';
import { recoverStaleExecutions } from './recovery';

/** Recheck Discord membership and current roles, never trust permissions captured at login. */
export async function authorizeGuild(
  session: DiscordSession, guildId: string,
): Promise<DiscordUserGuild | null> {
  if (!/^\d{1,20}$/.test(guildId) || session.expiresAt <= Date.now()) return null;
  try {
    const [guild, member, roles] = await Promise.all([
      discord<DiscordGuildPayload>(`/guilds/${guildId}`),
      discord<DiscordMemberPayload>(`/guilds/${guildId}/members/${session.user.id}`),
      discord<DiscordRolePayload[]>(`/guilds/${guildId}/roles`),
    ]);
    if (guild.id !== guildId || member.user.id !== session.user.id) return null;
    const ids = new Set([guildId, ...member.roles]);
    const permissions = roles.reduce((bits, role) => ids.has(role.id) ? bits | BigInt(role.permissions) : bits, 0n);
    const result: DiscordUserGuild = {
      id: guild.id, name: guild.name, icon: guild.icon, owner: guild.owner_id === session.user.id,
      permissions: permissions.toString(),
    };
    return canReadGuild(result) ? result : null;
  } catch { return null; }
}

// React cache is request-scoped: layouts/pages share reads, subsequent requests do not.
export const guildAccess = cache(async (
  guildId: string,
): Promise<{ session: DiscordSession; guild: DiscordUserGuild } | null> => {
  const session = await getSession();
  if (!session) return null;
  const guild = await authorizeGuild(session, guildId);
  if (!guild) return null;
  await recoverStaleExecutions(guildId);
  return { session, guild };
});

export async function readableGuilds(session: DiscordSession): Promise<DiscordUserGuild[]> {
  const guilds: DiscordUserGuild[] = [];
  let after = '0';
  for (let page = 0; page < 100; page += 1) {
    const response = await fetch(`https://discord.com/api/v10/users/@me/guilds?limit=200&after=${after}`, {
      headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Discord guild listing failed. Sign in again or try later.');
    const rows = await response.json() as DiscordUserGuild[];
    guilds.push(...rows.filter(canReadGuild));
    if (rows.length < 200) return guilds;
    const next = rows.at(-1)!.id;
    if (!/^\d{1,20}$/.test(next) || BigInt(next) <= BigInt(after)) throw new Error('Invalid Discord pagination.');
    after = next;
  }
  throw new Error('Discord guild listing exceeded pagination limit.');
}
