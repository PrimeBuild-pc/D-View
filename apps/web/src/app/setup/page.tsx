import { prisma } from '@dpd/database';
import { t } from '@/lib/i18n';
import { resolveLang } from '@/lib/i18n/server';
import { Badge, Card, CardBody, LinkButton, SectionTitle } from '@/components/ui';
import { IconCheck, IconCross, IconDash } from '@/components/icons';

export const dynamic = 'force-dynamic';

type Level = 'ok' | 'problem' | 'optional';

interface Check {
  label: string;
  level: Level;
  detail?: string | undefined;
  help?: string | undefined;
}

/**
 * Setup diagnostics.
 *
 * This page must not require a session: a missing AUTH_SECRET now throws by
 * design, and this is the page that tells you so.
 */
export default async function SetupPage() {
  const lang = await resolveLang();
  const copy = t(lang);

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '';
  const clientId = process.env.DISCORD_CLIENT_ID ?? '';
  const checks: Check[] = [];

  checks.push({
    label: copy.setup.authSecret,
    level: secret.length >= 32 ? 'ok' : 'problem',
    help: copy.setup.authSecretHelp,
  });

  let database: Check = { label: copy.setup.database, level: 'problem', help: copy.setup.databaseHelp };
  try {
    await prisma.discordGuild.count();
    database = { label: copy.setup.database, level: 'ok' };
  } catch (error) {
    database.detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
  }
  checks.push(database);

  checks.push({
    label: copy.setup.oauth,
    level: clientId && process.env.DISCORD_CLIENT_SECRET ? 'ok' : 'problem',
    help: copy.setup.oauthHelp,
  });

  const token = process.env.DISCORD_BOT_TOKEN ?? '';
  let botCheck: Check = { label: copy.setup.botToken, level: 'problem', help: copy.setup.botTokenHelp };
  if (token) {
    try {
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { authorization: `Bot ${token}` },
        cache: 'no-store',
      });
      if (response.ok) {
        const me = (await response.json()) as { username: string };
        botCheck = { label: copy.setup.botToken, level: 'ok', detail: me.username };
      } else {
        botCheck.detail = `HTTP ${response.status}`;
      }
    } catch (error) {
      botCheck.detail = error instanceof Error ? error.message : String(error);
    }
  }
  checks.push(botCheck);

  checks.push({
    label: copy.setup.membersIntent,
    level: 'optional',
    help: copy.setup.membersIntentHelp,
  });

  const writes = process.env.ENABLE_DISCORD_WRITES === 'true';
  checks.push({
    label: copy.setup.writes,
    level: 'optional',
    detail: writes ? copy.setup.writesEnabled : copy.setup.writesDisabled,
    help: copy.setup.writesHelp,
  });

  // Minimum permissions: read the guild, manage roles and channels for applying.
  const invite = clientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=268435472`
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{copy.setup.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{copy.setup.help}</p>
      </div>

      <Card>
        <CardBody className="p-0">
          <ul>
            {checks.map((check) => (
              <li key={check.label} className="flex items-start gap-3 border-b border-line/60 px-4 py-3 last:border-0">
                <span className="mt-0.5">
                  {check.level === 'ok' ? (
                    <IconCheck className="text-allow" />
                  ) : check.level === 'problem' ? (
                    <IconCross className="text-critical" />
                  ) : (
                    <IconDash className="text-ink-faint" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {check.label}
                    {check.detail ? <Badge tone="neutral">{check.detail}</Badge> : null}
                  </p>
                  {/* Every failing check states its own remedy. */}
                  {check.level !== 'ok' && check.help ? (
                    <p className="mt-0.5 text-sm text-ink-muted">{check.help}</p>
                  ) : null}
                </div>
                <Badge tone={check.level === 'ok' ? 'allow' : check.level === 'problem' ? 'critical' : 'neutral'}>
                  {check.level === 'ok'
                    ? copy.setup.ok
                    : check.level === 'problem'
                      ? copy.setup.problem
                      : copy.setup.optional}
                </Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <SectionTitle>{copy.setup.botInGuild}</SectionTitle>
          <p className="text-sm text-ink-muted">{copy.setup.botInGuildHelp}</p>
          {invite ? (
            <LinkButton href={invite} tone="primary" target="_blank" rel="noreferrer">
              {copy.setup.inviteBot}
            </LinkButton>
          ) : null}
        </CardBody>
      </Card>

      <LinkButton href="/guilds">{copy.nav.servers}</LinkButton>
    </div>
  );
}
