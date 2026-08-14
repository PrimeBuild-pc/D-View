import { getSession, canReadGuild, type DiscordSession, type DiscordUserGuild } from './session';

/**
 * The access check used to be copy-pasted verbatim in six places, which is why
 * four of them rendered a bare untranslated `<p>Not authorized.</p>` with no way
 * back.
 */
export async function guildAccess(
  guildId: string,
): Promise<{ session: DiscordSession; guild: DiscordUserGuild } | null> {
  const session = await getSession().catch(() => null);
  const guild = session?.guilds.find((candidate) => candidate.id === guildId);
  if (!session || !guild || !canReadGuild(guild)) return null;
  return { session, guild };
}
