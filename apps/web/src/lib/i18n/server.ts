import { cookies, headers } from 'next/headers';
import { LANG_COOKIE, isLang, type Lang } from './index';

/**
 * Resolve the language for a request.
 *
 * The old implementation read a query parameter and nothing else, so the
 * language was lost on every click of the header nav. A cookie survives
 * navigation; Accept-Language covers the first visit.
 */
export async function resolveLang(): Promise<Lang> {
  const stored = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(stored)) return stored;

  const header = (await headers()).get('accept-language') ?? '';
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (isLang(tag)) return tag;
  }
  return 'en';
}
