import { cookies, headers } from 'next/headers';
import { LANG_COOKIE, negotiateLang, type Lang } from './index';

/**
 * Resolve the language for a request.
 *
 * The old implementation read a query parameter and nothing else, so the
 * language was lost on every click of the header nav. A cookie survives
 * navigation; Accept-Language covers the first visit.
 */
export async function resolveLang(): Promise<Lang> {
  const stored = (await cookies()).get(LANG_COOKIE)?.value;
  return negotiateLang(stored, (await headers()).get('accept-language') ?? '');
}
