import { prisma } from '@dpd/database';

/**
 * Whether D-View may write to Discord.
 *
 * The operator chooses the policy from the dashboard, per guild:
 *
 *   window  — writing is unlocked for a fixed period and then locks itself.
 *   always  — writing stays unlocked until it is switched off.
 *
 * `window` is the default because a permanent flag stays on silently and
 * nothing ever reminds you, but it is a preference, not a constraint.
 *
 * Two environment variables still win over the dashboard, for operators who want
 * the decision fixed at deploy time rather than clickable:
 *
 *   DISCORD_WRITES_LOCKED=true  — writing is impossible, whatever the UI says.
 *   DISCORD_WRITES_ALWAYS=true  — writing is always on, no unlocking needed.
 *
 * LOCKED wins over ALWAYS if both are set, because the safe reading of a
 * contradictory configuration is the restrictive one.
 */

export type WriteMode = 'window' | 'always';

/** Length of one temporary unlock. Long enough to review and apply a plan. */
export const WRITE_WINDOW_MINUTES = 60;

export function writesLocked(): boolean {
  return process.env.DISCORD_WRITES_LOCKED === 'true';
}

export function writesForcedAlways(): boolean {
  return !writesLocked() && process.env.DISCORD_WRITES_ALWAYS === 'true';
}

export interface WriteState {
  enabled: boolean;
  mode: WriteMode;
  /** When the current temporary unlock ends. Null unless a window is open. */
  until: Date | null;
  /** Forced off by configuration; the dashboard controls are disabled. */
  locked: boolean;
  /** Forced on by configuration; the dashboard controls are disabled. */
  forcedAlways: boolean;
}

export async function writeState(guildId: string): Promise<WriteState> {
  if (writesLocked()) {
    return { enabled: false, mode: 'window', until: null, locked: true, forcedAlways: false };
  }
  if (writesForcedAlways()) {
    return { enabled: true, mode: 'always', until: null, locked: false, forcedAlways: true };
  }

  const guild = await prisma.discordGuild.findUnique({
    where: { id: guildId },
    select: { writeMode: true, writesEnabledUntil: true },
  });

  const mode: WriteMode = guild?.writeMode === 'always' ? 'always' : 'window';

  if (mode === 'always') {
    // In this mode the timestamp doubles as the on/off switch: a far-future value
    // means on. Reusing one column keeps "is writing on right now" a single read.
    const on = guild?.writesEnabledUntil !== null && guild?.writesEnabledUntil !== undefined;
    return { enabled: on, mode, until: null, locked: false, forcedAlways: false };
  }

  const until = guild?.writesEnabledUntil ?? null;
  // Expiry is evaluated on read, so a window that lapses while nobody is looking
  // is closed the next time anything asks. No scheduled job to depend on.
  const enabled = until !== null && until.getTime() > Date.now();
  return { enabled, mode, until: enabled ? until : null, locked: false, forcedAlways: false };
}

/** Far enough out that it never expires in practice; used as the "on" marker in `always` mode. */
const ALWAYS_UNTIL = new Date('9999-12-31T00:00:00.000Z');

export async function enableWrites(guildId: string, mode: WriteMode): Promise<Date | null> {
  if (mode === 'always') {
    await prisma.discordGuild.update({
      where: { id: guildId },
      data: { writeMode: 'always', writesEnabledUntil: ALWAYS_UNTIL },
    });
    return null;
  }
  const until = new Date(Date.now() + WRITE_WINDOW_MINUTES * 60_000);
  await prisma.discordGuild.update({
    where: { id: guildId },
    data: { writeMode: 'window', writesEnabledUntil: until },
  });
  return until;
}

export async function disableWrites(guildId: string): Promise<void> {
  await prisma.discordGuild.update({ where: { id: guildId }, data: { writesEnabledUntil: null } });
}

export async function setWriteMode(guildId: string, mode: WriteMode): Promise<void> {
  // Changing policy always locks writing again, so switching to a more permissive
  // mode is never itself the thing that turns writing on.
  await prisma.discordGuild.update({
    where: { id: guildId },
    data: { writeMode: mode, writesEnabledUntil: null },
  });
}
