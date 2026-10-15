import en from './en';
import it from './it';
import de from './de';
import fr from './fr';
import es from './es';
import zh from './zh';
import ru from './ru';

/** English is the source of truth; every other locale must satisfy its shape. */
export type Dict = typeof en;
export { localizedError } from './errors';

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
  return typeof value === 'string' && Object.hasOwn(languages, value);
}

export function t(lang: Lang): Dict {
  return isLang(lang) ? dictionaries[lang] : en;
}

/** A saved choice wins; otherwise rank valid language ranges by quality. */
export function negotiateLang(stored: unknown, header = ''): Lang {
  if (isLang(stored)) return stored;
  const ranges = header.split(',').map((part, order) => {
    const [range = '', ...parameters] = part.trim().split(';');
    const quality = parameters.length === 0 ? '1' : parameters.length === 1
      ? /^\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/i.exec(parameters[0]!)?.[1]
      : undefined;
    return { range: range.trim().toLowerCase(), quality: quality === undefined ? 0 : Number(quality), order };
  }).filter(({ range, quality }) => quality > 0 && /^(?:\*|[a-z]{1,8}(?:-[a-z0-9]{1,8})*)$/.test(range))
    .sort((a, b) => b.quality - a.quality || a.order - b.order);
  for (const { range } of ranges) {
    if (range === '*') return 'en';
    const base = range.split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

/** Interpolate `{name}` placeholders. */
export function fill(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : match,
  );
}

/** `one|other`, or Russian `one|few|many`, selected by the locale's rules. */
export function plural(template: string, count: number, params: Record<string, string | number> = {}, lang: Lang = 'en'): string {
  const forms = template.split('|');
  const category = new Intl.PluralRules(lang).select(count);
  const index = category === 'one' ? 0 : forms.length === 3 && category === 'few' ? 1 : forms.length - 1;
  return fill(forms[index] ?? template, { ...params, count });
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
