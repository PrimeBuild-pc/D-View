import Link from 'next/link';
import { prisma } from '@dpd/database';
import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { canReadGuild, getSession } from '@/lib/session';
import { Badge, Button, Card, CardBody, EmptyState, LinkButton, Notice } from '@/components/ui';
import { IconRefresh } from '@/components/icons';
import { RelativeTime } from '@/components/relative-time';

export const dynamic = 'force-dynamic';

export default async function GuildsPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; detail?: string }>;
}) {
  const [session, params, lang] = await Promise.all([getSession(), searchParams, resolveLang()]);
  const copy = t(lang);

  if (!session) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardBody className="space-y-3">
          <h1 className="text-2xl font-semibold">{copy.auth.loginRequired}</h1>
          <p className="text-ink-muted">{copy.auth.loginHelp}</p>
          <LinkButton tone="primary" href="/api/auth/login">
            {copy.auth.login}
          </LinkButton>
        </CardBody>
      </Card>
    );
  }

  const readable = session.guilds.filter(canReadGuild);
  // Sync state per server, so "open" is no longer a coin flip into an empty page.
  const synced = await prisma.discordGuild.findMany({
    where: { id: { in: readable.map((guild) => guild.id) } },
    select: { id: true, snapshots: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } },
  });
  const lastSync = new Map(synced.map((row) => [row.id, row.snapshots[0]?.createdAt ?? null]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{copy.guilds.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{copy.tagline}</p>
      </div>

      {params.sync === 'unauthorized' ? <Notice tone="critical">{copy.sync.unauthorized}</Notice> : null}
      {params.sync === 'failed' ? (
        <Notice tone="critical" title={copy.sync.failed}>
          {/* The real cause used to end up in the server console only. */}
          {params.detail ? <code className="text-xs break-all">{params.detail}</code> : null}
        </Notice>
      ) : null}
      {params.sync === 'missing-token' ? (
        <Notice tone="warning" title={copy.sync.missingToken}>
          <Link href="/setup" className="underline">
            {copy.nav.setup}
          </Link>
        </Notice>
      ) : null}

      {readable.length === 0 ? (
        <EmptyState
          title={copy.guilds.empty}
          description={copy.guilds.emptyHelp}
          action={
            <LinkButton href="/setup" tone="default">
              {copy.nav.setup}
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {readable.map((guild) => {
            const when = lastSync.get(guild.id) ?? null;
            return (
              <Card key={guild.id}>
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-3">
                    {/* guild.icon was captured at login and never rendered. */}
                    {guild.icon ? (
                      <img
                        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
                        alt=""
                        className="size-10 rounded-xl"
                      />
                    ) : (
                      <span className="flex size-10 items-center justify-center rounded-xl bg-surface-overlay text-sm font-semibold text-ink-muted">
                        {guild.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{guild.name}</p>
                      <Badge tone={guild.owner ? 'brand' : 'neutral'}>
                        {guild.owner ? copy.guilds.owner : copy.guilds.administrator}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-ink-faint">
                    {when ? <RelativeTime date={when.toISOString()} lang={lang} /> : copy.guilds.neverSynced}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <LinkButton href={`/guilds/${guild.id}`} tone={when ? 'primary' : 'default'}>
                      {copy.guilds.open}
                    </LinkButton>
                    <form action={`/api/guilds/${guild.id}/sync`} method="post">
                      <Button type="submit" tone={when ? 'default' : 'primary'}>
                        <IconRefresh />
                        {copy.guilds.syncNow}
                      </Button>
                    </form>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
