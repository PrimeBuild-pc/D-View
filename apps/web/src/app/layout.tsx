import type { Metadata } from 'next';
import './globals.css';
import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { getSession } from '@/lib/session';
import { Brand, LanguagePicker, UserMenu } from '@/components/shell';

export const metadata: Metadata = {
  title: 'D-View',
  description: 'Discord permission visibility dashboard for safer server administration.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await resolveLang();
  const copy = t(lang);
  // A missing AUTH_SECRET now throws by design; the shell must still render so
  // the operator can reach /setup and read what to fix.
  const session = await getSession().catch(() => null);

  return (
    // Was hardcoded to "en", so screen readers announced Chinese and Russian
    // with an English voice.
    <html lang={lang}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-brand focus:px-3 focus:py-2 focus:text-white"
        >
          {copy.nav.overview}
        </a>
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-[110rem] items-center justify-between gap-4 px-4 py-3">
            <Brand tagline={copy.tagline} />
            <div className="flex items-center gap-4">
              <LanguagePicker lang={lang} label={copy.nav.language} />
              {session ? (
                <UserMenu
                  username={session.user.username}
                  avatar={session.user.avatar ?? null}
                  userId={session.user.id}
                  copy={copy}
                />
              ) : null}
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[110rem] px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
