import { fill, type Dict, type Lang } from '@/lib/i18n';
import { WRITE_WINDOW_MINUTES, type WriteWindow } from '@/lib/writes';
import { Badge, Button, Card, CardBody, Notice, SectionTitle } from './ui';
import { RelativeTime } from './relative-time';

/**
 * The writes switch.
 *
 * Previously this was `ENABLE_DISCORD_WRITES` in `.env` plus a restart, which
 * made it awkward enough that the realistic outcome was leaving it on. Unlocking
 * from here grants a window instead of a permanent state, so the convenient
 * option is also the one that turns itself off.
 */
export function WriteToggle({
  guildId,
  window,
  copy,
  lang,
}: {
  guildId: string;
  window: WriteWindow;
  copy: Dict;
  lang: Lang;
}) {
  if (window.locked) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <SectionTitle>{copy.writes.title}</SectionTitle>
          <Notice tone="neutral" title={copy.writes.lockedTitle}>
            {copy.writes.lockedHelp}
          </Notice>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className={window.enabled ? 'border-warning/40' : undefined}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SectionTitle>{copy.writes.title}</SectionTitle>
          <Badge tone={window.enabled ? 'warning' : 'neutral'}>
            {window.enabled ? copy.writes.on : copy.writes.off}
          </Badge>
          {window.enabled && window.until ? (
            <span className="text-xs text-ink-faint">
              {fill(copy.writes.expires, { when: '' })}{' '}
              <RelativeTime date={window.until.toISOString()} lang={lang} />
            </span>
          ) : null}
        </div>

        <p className="text-sm text-ink-muted">
          {window.enabled ? copy.writes.onHelp : copy.writes.offHelp}
        </p>

        <form action={`/api/guilds/${guildId}/writes`} method="post">
          <input type="hidden" name="enable" value={window.enabled ? 'false' : 'true'} />
          <Button type="submit" tone={window.enabled ? 'default' : 'primary'}>
            {window.enabled
              ? copy.writes.lock
              : fill(copy.writes.unlock, { minutes: WRITE_WINDOW_MINUTES })}
          </Button>
        </form>

        {!window.enabled ? <p className="text-xs text-ink-faint">{copy.writes.windowNote}</p> : null}
      </CardBody>
    </Card>
  );
}
