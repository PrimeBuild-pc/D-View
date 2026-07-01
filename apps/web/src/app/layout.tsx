import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Discord Permission Dashboard',
  description: 'Safe Discord permission analysis dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-800 bg-slate-950/80">
            <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-lg font-semibold text-white">Discord Permission Dashboard</Link>
              <div className="flex gap-4 text-sm text-slate-300">
                <Link href="/guilds">Guilds</Link>
                <Link href="/changes">Changes / History</Link>
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
