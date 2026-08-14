import { t, fill, type Dict, type Lang } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { guildAccess } from '@/lib/guild';
import { canWriteGuild } from '@/lib/session';
import { WRITE_WINDOW_MINUTES, writeState, type WriteState, type WriteMode } from '@/lib/writes';
import { Badge, Button, Card, CardBody, EmptyState, Notice, SectionTitle, cx } from '@/components/ui';
import { RelativeTime } from '@/components/relative-time';
import { IconCheck, IconCross } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ writes?: string; until?: string; mode?: string }>;
}) {
  const { guildId } = await params;
  const [access, query, lang] = await Promise.all([guildAccess(guildId), searchParams, resolveLang()]);
  const copy = t(lang);
  if (!access) return null;

  if (!canWriteGuild(access.guild)) {
    return <EmptyState title={copy.auth.notAuthorized} description={copy.auth.notAuthorizedHelp} />;
  }

  const state = await writeState(guildId);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{copy.nav.settings}</h1>

      {/* Says exactly what just happened, including how long it lasts. */}
      {query.writes === 'opened' ? (
        <Notice tone="warning">
          {state.mode === 'window'
            ? fill(copy.writes.openedWindow, { minutes: WRITE_WINDOW_MINUTES })
            : copy.writes.opened}
        </Notice>
      ) : null}
      {query.writes === 'closed' ? <Notice tone="allow">{copy.writes.closed}</Notice> : null}
      {query.writes === 'mode' ? <Notice tone="info">{copy.writes.modeChanged}</Notice> : null}

      <WriteSettings guildId={guildId} state={state} copy={copy} lang={lang} />
    </div>
  );
}

function WriteSettings({
  guildId,
  state,
  copy,
  lang,
}: {
  guildId: string;
  state: WriteState;
  copy: Dict;
  lang: Lang;
}) {
  // Configuration wins over the dashboard, and says so rather than showing
  // controls that would silently do nothing.
  if (state.locked || state.forcedAlways) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <SectionTitle>{copy.writes.title}</SectionTitle>
          <Notice tone={state.locked ? 'neutral' : 'warning'} title={state.locked ? copy.writes.lockedTitle : copy.writes.alwaysTitle}>
            {state.locked ? copy.writes.lockedHelp : copy.writes.alwaysHelp}
          </Notice>
        </CardBody>
      </Card>
    );
  }

  const modes: { id: WriteMode; label: string; help: string }[] = [
    {
      id: 'window',
      label: copy.writes.modeWindow,
      help: fill(copy.writes.modeWindowHelp, { minutes: WRITE_WINDOW_MINUTES }),
    },
    { id: 'always', label: copy.writes.modeAlways, help: copy.writes.modeAlwaysHelp },
  ];

  return (
    <div className="space-y-4">
      <Card className={state.enabled ? 'border-warning/40' : undefined}>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <SectionTitle>{copy.writes.title}</SectionTitle>
            <Badge tone={state.enabled ? 'warning' : 'neutral'}>
              {state.enabled ? copy.writes.on : copy.writes.off}
            </Badge>
            {state.enabled ? (
              <span className="text-xs text-ink-faint">
                {state.mode === 'window' && state.until ? (
                  <>
                    {copy.writes.expires} <RelativeTime date={state.until.toISOString()} lang={lang} />
                  </>
                ) : (
                  copy.writes.noExpiry
                )}
              </span>
            ) : null}
          </div>

          <p className="text-sm text-ink-muted">
            {state.enabled ? copy.writes.onHelp : copy.writes.offHelp}
          </p>

          <form action={`/api/guilds/${guildId}/writes`} method="post">
            <input type="hidden" name="action" value={state.enabled ? 'disable' : 'enable'} />
            <input type="hidden" name="mode" value={state.mode} />
            <Button type="submit" tone={state.enabled ? 'default' : 'primary'}>
              {state.enabled
                ? copy.writes.lock
                : state.mode === 'window'
                  ? fill(copy.writes.unlockFor, { minutes: WRITE_WINDOW_MINUTES })
                  : copy.writes.unlock}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <SectionTitle>{copy.writes.policy}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {modes.map((mode) => {
              const active = state.mode === mode.id;
              return (
                <div
                  key={mode.id}
                  className={cx(
                    'flex flex-col gap-2 rounded-xl border p-4',
                    active ? 'border-brand/50 bg-brand/5' : 'border-line',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {active ? (
                      <IconCheck className="text-brand" />
                    ) : (
                      <IconCross className="text-ink-faint" />
                    )}
                    <p className="font-medium">{mode.label}</p>
                    {active ? <Badge tone="brand">{copy.writes.inUse}</Badge> : null}
                  </div>
                  <p className="flex-1 text-sm text-ink-muted">{mode.help}</p>
                  {!active ? (
                    <form action={`/api/guilds/${guildId}/writes`} method="post">
                      <input type="hidden" name="action" value="mode" />
                      <input type="hidden" name="mode" value={mode.id} />
                      <Button type="submit">{copy.writes.useThis}</Button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
