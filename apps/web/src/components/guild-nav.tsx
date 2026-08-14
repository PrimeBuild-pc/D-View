'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx } from './ui';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** The overview lives at the section root, so it must not match its own children. */
  exact?: boolean;
}

/** Client-side so the active section can be highlighted — the old header gave no indication of where you were. */
export function GuildNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Server sections">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition',
              active
                ? 'bg-surface-overlay font-medium text-ink'
                : 'text-ink-muted hover:bg-surface-overlay hover:text-ink',
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
