'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LANG_COOKIE, isLang } from '@/lib/i18n';

export async function setLanguage(formData: FormData): Promise<void> {
  const lang = formData.get('lang');
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  // A cookie, not a query parameter: the previous implementation lost the
  // language on every click of the header navigation.
  revalidatePath('/', 'layout');
}
