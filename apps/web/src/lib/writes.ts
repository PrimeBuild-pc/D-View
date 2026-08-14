import { prisma } from '@dpd/database';

/**
 * Whether D-View may write to Discord, and for how much longer.
 *
 * This used to be `ENABLE_DISCORD_WRITES` alone, which meant editing a file and
 * restarting the server to change anything — and, worse, meant that once it was
 * on it stayed on silently and indefinitely. It is now a window the operator
 * opens from the dashboard, which closes itself.
 *
 * `DISCORD_WRITES_LOCKED=true` still hard-disables everything, for anyone who
 * wants the guarantee that the UI cannot unlock writes at all.
 */

/** How long one unlock lasts. Long enough to review and apply a plan, short enough to forget about safely. */
export const WRITE_WINDOW_MINUTES = 60;

export function writesLocked(): boolean {
  return process.env.DISCORD_WRITES_LOCKED === 'true';
}

export interface WriteWindow {
  enabled: boolean;
  /** null when writes are off. */
  until: Date | null;
  locked: boolean;
}

export async function writeWindow(guildId: string): Promise<WriteWindow> {
  const locked = writesLocked();
  if (locked) return { enabled: false, until: null, locked: true };

  const guild = await prisma.discordGuild.findUnique({
    where: { id: guildId },
    select: { writesEnabledUntil: true },
  });
  const until = guild?.writesEnabledUntil ?? null;
  // Expiry is evaluated on read, so a window that lapses while nobody is looking
  // is closed the next time anything asks — no scheduled job to depend on.
  const enabled = until !== null && until.getTime() > Date.now();
  return { enabled, until: enabled ? until : null, locked: false };
}

export async function openWriteWindow(guildId: string): Promise<Date> {
  const until = new Date(Date.now() + WRITE_WINDOW_MINUTES * 60_000);
  await prisma.discordGuild.update({ where: { id: guildId }, data: { writesEnabledUntil: until } });
  return until;
}

export async function closeWriteWindow(guildId: string): Promise<void> {
  await prisma.discordGuild.update({ where: { id: guildId }, data: { writesEnabledUntil: null } });
}
