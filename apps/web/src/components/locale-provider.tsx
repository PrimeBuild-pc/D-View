'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Lang } from '@/lib/i18n';

const LocaleContext = createContext<Lang>('en');

/** Client error boundaries share the server-selected locale, including on first render. */
export function LocaleProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LocaleContext.Provider value={lang}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Lang {
  return useContext(LocaleContext);
}
