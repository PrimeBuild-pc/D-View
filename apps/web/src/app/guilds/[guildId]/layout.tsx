import Link from 'next/link';
import { prisma } from '@dpd/database';
import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { Card, CardBody, EmptyState, LinkButton } from '@/components/ui';
import { GuildNav } from '@/components/guild-nav';
import { RelativeTime } from '@/components/relative-time';
import { SyncButton } from './sync-button';
import {
  IconAlert,
  IconHash,
  IconRefresh,
  IconSearch,
  IconShield,
  IconUser,
} from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [access, lang] = await Promise.all([guildAccess(guildId), resolveLang()]);
  const copy = t(lang);

  if (!access) {
    return (
      <EmptyState
        title={copy.auth.notAuthorized}
        description={copy.auth.notAuthorizedHelp}
        action={
          <LinkButton href="/guilds" tone="primary">
            {copy.nav.servers}
          </LinkButton>
        }
      />
    );
  }

  const base = `/guilds/${guildId}`;
  const items = [
    { href: base, label: copy.nav.overview, icon: <IconShield />, exact: true },
    { href: `${base}/explorer`, label: copy.nav.explorer, icon: <IconSearch /> },
    { href: `${base}/matrix`, label: copy.nav.matrix, icon: <IconHash /> },
    { href: `${base}/members`, label: copy.nav.members, icon: <IconUser /> },
    { href: `${base}/audit`, label: copy.nav.audit, icon: <IconAlert /> },
    { href: `${base}/history`, label: copy.nav.history, icon: <IconRefresh /> },
    { href: `${base}/changes`, label: copy.nav.changes, icon: <IconRefresh /> },
  ];

  const latest = await prisma.permissionSnapshot.findFirst({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        <Card>
          <CardBody className="space-y-2 p-3">
            <div className="flex items-center gap-2">
              {access.guild.icon ? (
                <img
                  src={`https://cdn.discordapp.com/icons/${guildId}/${access.guild.icon}.png?size=64`}
                  alt=""
                  className="size-8 rounded-lg"
                />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-lg bg-surface-overlay text-xs font-semibold">
                  {access.guild.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{access.guild.name}</p>
                <Link href="/guilds" className="text-xs text-ink-faint hover:text-ink">
                  {copy.nav.servers}
                </Link>
              </div>
            </div>
          </CardBody>
        </Card>

        <GuildNav items={items} />

        <Card>
          <CardBody className="space-y-2 p-3 text-xs text-ink-faint">
            <p>
              {latest ? <RelativeTime date={latest.createdAt.toISOString()} lang={lang} /> : copy.guilds.neverSynced}
            </p>
            <form action={`/api/guilds/${guildId}/sync`} method="post">
              <SyncButton idle={copy.guilds.syncNow} pending={copy.guilds.syncing} />
            </form>
          </CardBody>
        </Card>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
