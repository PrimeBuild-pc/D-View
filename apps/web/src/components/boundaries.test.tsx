import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RootLayout, { generateMetadata } from '../app/layout';
import Loading from '../app/loading';
import NotFound from '../app/not-found';
import ErrorBoundary from '../app/error';
import SetupPage from '../app/setup/page';
import { fill, languages, t, type Lang } from '../lib/i18n';
import { LocaleProvider } from './locale-provider';

const mocks = vi.hoisted(() => ({
  resolveLang: vi.fn(), session: vi.fn(), count: vi.fn(), fetch: vi.fn(),
}));
vi.mock('@/lib/i18n/server', () => ({ resolveLang: mocks.resolveLang }));
vi.mock('@/lib/session', () => ({ getSession: mocks.session }));
vi.mock('@dpd/database', () => ({ prisma: { discordGuild: { count: mocks.count } } }));
vi.mock('@/lib/request', () => ({ appUrl: () => new URL('https://dashboard.example') }));
vi.mock('@/lib/writes', () => ({ writesLocked: () => true, writesForcedAlways: () => false }));
vi.mock('@/lib/version', () => ({ appVersion: () => '0.0.0-test' }));
vi.mock('@/components/shell', () => ({
  Brand: ({ tagline }: { tagline: string }) => <span>{tagline}</span>,
  LanguagePicker: ({ lang, label }: { lang: Lang; label: string }) => <span data-lang={lang}>{label}</span>,
  UserMenu: ({ username }: { username: string }) => <span>{username}</span>,
}));

const locales = Object.keys(languages) as Lang[];
const escaped = (text: string) => renderToStaticMarkup(<>{text}</>);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolveLang.mockResolvedValue('en');
  mocks.session.mockResolvedValue(null);
  mocks.count.mockRejectedValue(new Error('Database access is forbidden in these tests'));
  mocks.fetch.mockRejectedValue(new Error('Network access is forbidden in these tests'));
  vi.stubGlobal('fetch', mocks.fetch);
  // Synthetic configuration keeps setup deterministic without loading any .env file.
  vi.stubEnv('AUTH_SECRET', 'dummy-auth-secret-at-least-32-characters');
  vi.stubEnv('NEXTAUTH_SECRET', '');
  vi.stubEnv('DATABASE_URL', 'postgresql://dummy:dummy@offline.invalid/test');
  vi.stubEnv('DISCORD_CLIENT_ID', '123456789012345678');
  vi.stubEnv('DISCORD_CLIENT_SECRET', 'dummy-client-secret');
  vi.stubEnv('DISCORD_BOT_TOKEN', 'dummy-bot-token');
});

afterEach(() => {
  expect(mocks.count).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('localized root SSR', () => {
  it.each(locales)('generates metadata from the resolved %s locale', async (lang) => {
    mocks.resolveLang.mockResolvedValue(lang);
    await expect(generateMetadata()).resolves.toEqual({ title: t(lang).appName, description: t(lang).tagline });
    expect(mocks.resolveLang).toHaveBeenCalledOnce();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it.each(locales)('renders html lang, shell and client error context in %s', async (lang) => {
    mocks.resolveLang.mockResolvedValue(lang);
    const copy = t(lang);
    const markup = renderToStaticMarkup(await RootLayout({
      children: <ErrorBoundary error={new Error('Unauthorized')} reset={() => {}} />,
    }));
    expect(markup).toContain(`<html lang="${lang}">`);
    expect(markup).toContain(escaped(copy.tagline));
    expect(markup).toContain(escaped(copy.nav.language));
    expect(markup).toContain(`data-lang="${lang}"`);
    expect(markup).toContain(escaped(copy.nav.overview));
    expect(markup).toContain('id="main"');
    expect(markup).toContain(escaped(copy.common.somethingWentWrong));
    expect(markup).toContain(escaped(copy.errors.UNAUTHORIZED));
    expect(markup).toContain(escaped(copy.common.retry));
    expect(markup).toContain('D-View v0.0.0-test');
    expect(mocks.resolveLang).toHaveBeenCalledOnce();
  });

  it('keeps the localized shell usable when session configuration fails', async () => {
    mocks.resolveLang.mockResolvedValue('fr');
    mocks.session.mockRejectedValue(new Error('AUTH_SECRET must contain at least 32 characters.'));
    const markup = renderToStaticMarkup(await RootLayout({ children: <p>Setup content</p> }));
    expect(markup).toContain('<html lang="fr">');
    expect(markup).toContain('Setup content');
    expect(markup).not.toContain('AUTH_SECRET');
  });
});

describe('localized application boundaries', () => {
  it.each(locales)('announces the async loading boundary in %s', async (lang) => {
    mocks.resolveLang.mockResolvedValue(lang);
    const markup = renderToStaticMarkup(await Loading());
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain(`aria-label="${escaped(t(lang).common.loading)}"`);
    expect(mocks.resolveLang).toHaveBeenCalledOnce();
  });

  it.each(locales)('renders the async not-found boundary in %s', async (lang) => {
    mocks.resolveLang.mockResolvedValue(lang);
    const copy = t(lang);
    const markup = renderToStaticMarkup(await NotFound());
    expect(markup).toContain(escaped(copy.common.notFound));
    expect(markup).toContain(escaped(copy.common.pageNotFound));
    expect(markup).toContain(escaped(copy.nav.servers));
    expect(markup).toContain('href="/guilds"');
    expect(mocks.resolveLang).toHaveBeenCalledOnce();
  });

  it.each(locales)('uses client locale context for error copy and masks untrusted errors in %s', (lang) => {
    const copy = t(lang);
    const markup = renderToStaticMarkup(
      <LocaleProvider lang={lang}>
        <ErrorBoundary error={new Error('postgresql://private:password@internal.invalid')} reset={() => {}} />
      </LocaleProvider>,
    );
    for (const message of [copy.common.somethingWentWrong, copy.errors.REQUEST_FAILED, copy.common.retry, copy.nav.setup]) {
      expect(markup).toContain(escaped(message));
    }
    expect(markup).toContain('href="/setup"');
    expect(markup).not.toContain('postgresql://');
    expect(markup).not.toContain('password');
    expect(mocks.resolveLang).not.toHaveBeenCalled();
  });

  it('defaults the client error boundary to English without a locale provider', () => {
    const markup = renderToStaticMarkup(<ErrorBoundary error={new Error('Unauthorized')} reset={() => {}} />);
    expect(markup).toContain(escaped(t('en').common.somethingWentWrong));
    expect(markup).toContain(escaped(t('en').errors.UNAUTHORIZED));
  });

  it.each(locales)('renders unauthenticated setup diagnostics in %s without DB or network probes', async (lang) => {
    mocks.resolveLang.mockResolvedValue(lang);
    const copy = t(lang);
    const markup = renderToStaticMarkup(await SetupPage());
    for (const text of [
      copy.setup.title, copy.setup.help, copy.setup.appUrl, copy.setup.authSecret,
      copy.setup.database, copy.setup.oauth, copy.setup.botToken, copy.setup.membersIntent,
      copy.setup.membersIntentHelp, copy.setup.writes, copy.setup.writesLocked,
      copy.setup.writesHelp, copy.setup.botInGuild, copy.setup.botInGuildHelp,
      copy.setup.inviteBot, copy.auth.loginRequired, copy.setup.ok, copy.setup.optional,
      fill(copy.setup.version, { version: '0.0.0-test' }), copy.nav.servers,
    ]) {
      expect(markup).toContain(escaped(text));
    }
    expect(markup).toContain('permissions=0');
    expect(markup).not.toContain('dummy-auth-secret');
    expect(markup).not.toContain('dummy-client-secret');
    expect(markup).not.toContain('dummy-bot-token');
    expect(markup).not.toContain('postgresql://');
    expect(mocks.resolveLang).toHaveBeenCalledOnce();
  });
});
