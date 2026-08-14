'use client';

import { useTransition } from 'react';
import { languages, type Lang } from '@/lib/i18n';

/** Applies on change — the old switcher needed a second click to take effect. */
export function LanguageSelect({
  lang,
  label,
  action,
}: {
  lang: Lang;
  label: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <select
        defaultValue={lang}
        disabled={pending}
        onChange={(event) => {
          const data = new FormData();
          data.set('lang', event.target.value);
          startTransition(() => action(data));
        }}
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink-muted disabled:opacity-60"
      >
        {Object.entries(languages).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
