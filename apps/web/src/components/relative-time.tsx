'use client';

import { useEffect, useState } from 'react';
import { absoluteTime, relativeTime, type Lang } from '@/lib/i18n';

/**
 * Rendered on the client on purpose.
 *
 * The old code called `toLocaleString()` inside server components, so timestamps
 * were formatted in the server's timezone and locale rather than the reader's —
 * and raw ISO strings leaked into the UI in several places.
 */
export function RelativeTime({ date, lang }: { date: string; lang: Lang }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setText(relativeTime(date, lang));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [date, lang]);

  return (
    <time dateTime={date} title={absoluteTime(date, lang)} suppressHydrationWarning>
      {text ?? ''}
    </time>
  );
}
