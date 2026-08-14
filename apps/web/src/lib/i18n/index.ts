import en from './en';
import it from './it';
import de from './de';
import fr from './fr';
import es from './es';
import zh from './zh';
import ru from './ru';

/** English is the source of truth; every other locale must satisfy its shape. */
export type Dict = typeof en;

export const languages = {
  en: 'English',
  it: 'Italiano',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  zh: '中文',
  ru: 'Русский',
} as const;

export type Lang = keyof typeof languages;

const dictionaries: Record<Lang, Dict> = { en, it, de, fr, es, zh, ru };

export const LANG_COOKIE = 'dpd_lang';

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && value in languages;
}

export function t(lang: Lang): Dict {
  return dictionaries[lang];
}

/** Interpolate `{name}` placeholders. */
export function fill(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** `one|many` plural forms, enough for the two counters that need it. */
export function plural(template: string, count: number, params: Record<string, string | number> = {}): string {
  const [one = template, many = one] = template.split('|');
  return fill(count === 1 ? one : many, { ...params, count });
}

/**
 * Relative time via Intl rather than a date library, and rendered on the client
 * so it reflects the reader's clock — the old code called toLocaleString() in a
 * server component, formatting in the server's timezone.
 */
export function relativeTime(date: Date | string, lang: Lang): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.round((value.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let duration = seconds;
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) return formatter.format(Math.round(duration), unit);
    duration /= amount;
  }
  return formatter.format(Math.round(duration), 'year');
}

export function absoluteTime(date: Date | string, lang: Lang): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}
