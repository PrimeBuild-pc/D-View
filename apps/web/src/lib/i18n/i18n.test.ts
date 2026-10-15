import { beforeEach, describe, expect, it, vi } from 'vitest';
import { channelKind, channelTypeNumbers, permissionBits, permissionGroups } from '@dpd/shared';
import { setLanguage } from '../../app/actions';
import en from './en';
import itCopy from './it';
import de from './de';
import fr from './fr';
import es from './es';
import zh from './zh';
import ru from './ru';
import { isLang, LANG_COOKIE, languages, negotiateLang, t, type Lang } from './index';
import { resolveLang } from './server';

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), headers: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies, headers: mocks.headers }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

const dictionaries = { en, it: itCopy, de, fr, es, zh, ru };
const locales = Object.keys(dictionaries) as Lang[];
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();

function expectDictionary(actual: unknown, source: unknown, path: string): void {
  if (typeof source === 'string') {
    expect(typeof actual, path).toBe('string');
    const expected = placeholders(source.split('|')[0]!);
    for (const [index, form] of (actual as string).split('|').entries()) {
      expect(form.trim(), `${path}, form ${index}`).not.toBe('');
      expect(placeholders(form), `${path}, form ${index}`).toEqual(expected);
    }
    return;
  }
  expect(actual, path).not.toBeNull();
  expect(typeof actual, path).toBe('object');
  const reference = source as Record<string, unknown>;
  const translated = actual as Record<string, unknown>;
  expect(Object.keys(translated).sort(), path).toEqual(Object.keys(reference).sort());
  for (const key of Object.keys(reference)) {
    expectDictionary(translated[key], reference[key], `${path}.${key}`);
  }
}

const stored = new Map<string, string>();
const requestHeaders = new Headers();
const cookieStore = {
  get: vi.fn((name: string) => stored.has(name) ? { value: stored.get(name)! } : undefined),
  set: vi.fn((name: string, value: string) => { stored.set(name, value); }),
};

beforeEach(() => {
  vi.clearAllMocks();
  stored.clear();
  requestHeaders.delete('accept-language');
  mocks.cookies.mockResolvedValue(cookieStore);
  mocks.headers.mockResolvedValue(requestHeaders);
});

describe('dictionary contracts', () => {
  it('registers exactly the seven supported locales', () => {
    expect(Object.keys(languages).sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'ru', 'zh']);
  });

  it.each(locales)('%s has exact recursive English keys and preserves placeholders in every plural form', (lang) => {
    expectDictionary(dictionaries[lang], en, lang);
    expect(t(lang)).toBe(dictionaries[lang]);
    expect(isLang(lang)).toBe(true);
  });

  it.each(locales)('%s covers the shared permission, group and channel tables', (lang) => {
    const copy = dictionaries[lang];
    expect(Object.keys(copy.permissionNames).sort()).toEqual(Object.keys(permissionBits).sort());
    expect(Object.keys(copy.permissionGroups).sort()).toEqual(Object.keys(permissionGroups).sort());
    const kinds = new Set([...Object.values(channelTypeNumbers), -1].map(channelKind));
    expect(Object.keys(copy.channelKinds).sort()).toEqual([...kinds].sort());
    for (const name of Object.values(permissionGroups).flat()) {
      expect(copy.permissionNames[name].trim()).not.toBe('');
    }
  });

  it.each([
    '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty',
    'EN', 'en-US', 'xx', '', null, undefined, 1, {}, ['en'],
  ])('rejects invalid runtime locale %j and safely falls back to English', (value) => {
    expect(isLang(value)).toBe(false);
    expect(t(value as Lang)).toBe(en);
  });
});

describe('Accept-Language negotiation', () => {
  it.each(locales)('gives a valid %s cookie precedence over headers', (lang) => {
    expect(negotiateLang(lang, 'ru;q=1, de;q=0.9, *;q=0.8')).toBe(lang);
  });

  it.each(['__proto__', 'constructor', 'toString', 'en-US', '', null, undefined, {}])('ignores invalid cookie %j', (cookie) => {
    expect(negotiateLang(cookie, 'fr-CA, en;q=0.5')).toBe('fr');
  });

  it.each([
    ['fr;q=0.2, de;q=0.9, it;q=0.5', 'de'],
    ['de;q=0.5, it', 'it'],
    ['ja-JP, zh-Hant-TW;q=0.8, en;q=0.2', 'zh'],
    [' FR-ca ; Q=0.900 , DE-de;q=0.8 ', 'fr'],
    ['es-MX, en-US;q=0.8', 'es'],
    ['ru-RU, en;q=0.8', 'ru'],
    ['it;q=0.8, de;q=0.8', 'it'],
    ['de;q=0.8, it;q=0.8', 'de'],
    ['fr;q=0, de;q=0.4', 'de'],
    ['fr;q=0.000, it;q=0.001', 'it'],
    ['fr;q=1.000, de;q=0.999', 'fr'],
    ['ja;q=1, it;q=0.5', 'it'],
    ['*', 'en'],
    ['*;q=0.9, fr;q=0.8', 'en'],
    ['fr;q=0.9, *;q=0.8', 'fr'],
    ['*;q=0, es;q=0.2', 'es'],
    ['de;q=1.1, it;q=0.8', 'it'],
    ['de;q=-0.1, it;q=0.8', 'it'],
    ['de;q=NaN, it;q=0.8', 'it'],
    ['de;q=0.1234, it;q=0.1', 'it'],
    ['de;q=.9, it;q=0.8', 'it'],
    ['de;q=, it;q=0.8', 'it'],
    ['de;foo=bar, it;q=0.8', 'it'],
    ['de;q=0.9;q=0.8, it;q=0.7', 'it'],
    ['de;q=0.9;foo=bar, it;q=0.7', 'it'],
    ['fr_CA, de--DE, it;q=0.7', 'it'],
    ['fr-*, it;q=0.7', 'it'],
    [', ;q=1, __proto__, constructor, it;q=0.7', 'it'],
    ['', 'en'],
    ['ja-JP, ko-KR;q=0.8', 'en'],
    ['fr;q=0, de;q=0, *;q=0', 'en'],
    ['garbage;q=nope, @@, en_US', 'en'],
  ] as const)('negotiates %s as %s', (header, expected) => {
    expect(negotiateLang(undefined, header)).toBe(expected);
  });

  it('defaults to English when neither preference is present', () => {
    expect(negotiateLang(undefined)).toBe('en');
  });
});

describe('request locale and language action', () => {
  it('resolves the saved cookie before the browser preference', async () => {
    stored.set(LANG_COOKIE, 'zh');
    requestHeaders.set('accept-language', 'de-DE, en;q=0.8');
    await expect(resolveLang()).resolves.toBe('zh');
    expect(cookieStore.get).toHaveBeenCalledWith(LANG_COOKIE);
  });

  it('uses the browser when the cookie is missing or invalid', async () => {
    requestHeaders.set('accept-language', 'es-MX, en;q=0.8');
    await expect(resolveLang()).resolves.toBe('es');
    stored.set(LANG_COOKIE, '__proto__');
    await expect(resolveLang()).resolves.toBe('es');
  });

  it('resolves absent or unsupported preferences as English', async () => {
    await expect(resolveLang()).resolves.toBe('en');
    requestHeaders.set('accept-language', 'ja-JP');
    await expect(resolveLang()).resolves.toBe('en');
  });

  it.each(locales)('persists %s for subsequent requests and revalidates the root layout', async (lang) => {
    requestHeaders.set('accept-language', lang === 'en' ? 'fr' : 'en');
    const form = new FormData();
    form.set('lang', lang);
    await setLanguage(form);
    expect(cookieStore.set).toHaveBeenCalledExactlyOnceWith(LANG_COOKIE, lang, {
      path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith('/', 'layout');
    await expect(resolveLang()).resolves.toBe(lang);
  });

  it.each(['__proto__', 'constructor', 'toString', 'EN', 'en-US', 'xx', '', null])('does not persist or revalidate invalid form locale %j', async (lang) => {
    stored.set(LANG_COOKIE, 'it');
    const form = new FormData();
    if (lang !== null) form.set('lang', lang);
    await expect(setLanguage(form)).resolves.toBeUndefined();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(stored.get(LANG_COOKIE)).toBe('it');
  });

  it('rejects a file instead of a language string', async () => {
    const form = new FormData();
    form.set('lang', new Blob(['en']), 'language.txt');
    await setLanguage(form);
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
