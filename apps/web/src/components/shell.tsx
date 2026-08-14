import Link from 'next/link';
import { setLanguage } from '@/app/actions';
import type { Dict, Lang } from '@/lib/i18n';
import { LanguageSelect } from './language-select';
import { IconShield } from './icons';

export function LanguagePicker({ lang, label }: { lang: Lang; label: string }) {
  return <LanguageSelect lang={lang} label={label} action={setLanguage} />;
}

export function UserMenu({ username, avatar, userId, copy }: {
  username: string;
  avatar: string | null;
  userId: string;
  copy: Dict;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        {avatar ? (
          <img
            src={`https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=32`}
            alt=""
            className="size-6 rounded-full"
          />
        ) : (
          <span className="size-6 rounded-full bg-surface-overlay" />
        )}
        <span className="hidden sm:inline">{username}</span>
      </span>
      {/* POST, not a <Link>: Next prefetches links on viewport entry, which
          logged people out on its own. */}
      <form action="/api/auth/logout" method="post">
        <button type="submit" className="text-sm text-ink-faint hover:text-ink">
          {copy.nav.logout}
        </button>
      </form>
    </div>
  );
}

export function Brand({ tagline }: { tagline?: string }) {
  return (
    <Link href="/guilds" className="flex items-center gap-2">
      <IconShield className="text-brand" width={20} height={20} />
      <span className="font-semibold tracking-tight text-ink">D-View</span>
      {tagline ? <span className="hidden text-xs text-ink-faint lg:inline">{tagline}</span> : null}
    </Link>
  );
}
