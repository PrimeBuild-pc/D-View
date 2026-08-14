import Link from 'next/link';
import type { Dict, Lang } from '@/lib/i18n';
import type { WriteState } from '@/lib/writes';
import { Notice } from './ui';
import { RelativeTime } from './relative-time';

/**
 * A standing reminder that D-View can currently change this server.
 *
 * Shown on every page of the guild while writing is unlocked, because the whole
 * hazard of an "on" switch is that it stops being visible. In window mode it
 * states when it closes; in always mode it states plainly that it does not.
 */
export function WriteBanner({
  guildId,
  state,
  copy,
  lang,
}: {
  guildId: string;
  state: WriteState;
  copy: Dict;
  lang: Lang;
}) {
  if (!state.enabled) return null;

  return (
    <Notice tone="warning">
      <span className="flex flex-wrap items-center gap-1.5">
        {state.mode === 'window' && state.until ? (
          <>
            <span>{copy.writes.bannerWindow}</span>
            <RelativeTime date={state.until.toISOString()} lang={lang} />
            <span>.</span>
          </>
        ) : (
          <>
            <span>{copy.writes.banner}</span>
            <span className="text-ink-faint">{copy.writes.noExpiry}.</span>
          </>
        )}
        <Link href={`/guilds/${guildId}/settings`} className="underline">
          {copy.nav.settings}
        </Link>
      </span>
    </Notice>
  );
}
