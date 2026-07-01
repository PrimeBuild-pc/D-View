import { prisma } from '@dpd/database';
import { permissionSnapshotSchema, type PermissionSnapshot } from '@dpd/shared';
import Link from 'next/link';
import { PermissionDashboard } from '../../permission-dashboard';
import { getLang, t } from '@/lib/i18n';
import { canReadGuild, getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SyncedGuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ role?: string; channel?: string; lang?: string; sync?: string }>;
}) {
  const [{ guildId }, query, session] = await Promise.all([params, searchParams, getSession()]);
  const lang = getLang(query.lang);
  const copy = t(lang);
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-2xl font-semibold text-white">{copy.notAuthorized}</h1>
        <p className="mt-2 text-slate-400">{copy.loginHelp}</p>
        <Link href={`/guilds?lang=${lang}`} className="mt-4 inline-block text-indigo-300">{copy.backToGuilds}</Link>
      </div>
    );
  }

  const syncMessage =
    query.sync === 'ok'
      ? copy.syncOk
      : query.sync === 'failed'
        ? copy.syncFailed
        : query.sync === 'missing-token'
          ? copy.syncMissingToken
          : undefined;

  const latest = await prisma.permissionSnapshot.findFirst({ where: { guildId }, orderBy: { createdAt: 'desc' } });
  if (!latest) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-2xl font-semibold text-white">{copy.noSnapshot}</h1>
        <p className="mt-2 text-slate-400">{copy.runSync} <code>SYNC_GUILD_ID={guildId}</code>, {copy.thenRefresh}</p>
        <form action={`/api/guilds/${guildId}/sync?lang=${lang}`} method="post">
          <button className="mt-4 rounded bg-indigo-600 px-4 py-2 text-white">{copy.syncNow}</button>
        </form>
      </div>
    );
  }

  const snapshot = permissionSnapshotSchema.parse(latest.data) as PermissionSnapshot;
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-3">
        <Link className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" href={`/guilds/${guildId}/matrix?lang=${lang}`}>{copy.matrix}</Link>
        <Link className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" href={`/guilds/${guildId}/import?lang=${lang}`}>{copy.importJson}</Link>
        <a className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" href={`/api/guilds/${guildId}/snapshot`}>{copy.exportJson}</a>
        <form action={`/api/guilds/${guildId}/sync?lang=${lang}`} method="post">
          <button className="rounded bg-indigo-600 px-3 py-2 text-sm text-white">{copy.syncNow}</button>
        </form>
      </div>
      {syncMessage ? <p className="rounded border border-slate-800 bg-slate-950 p-3 text-sm text-slate-200">{syncMessage}</p> : null}
    <PermissionDashboard
      snapshot={snapshot}
      selectedRoleId={query.role}
      selectedChannelId={query.channel}
      subtitle={`${copy.syncedSubtitle} ${snapshot.exportedAt}`}
      lang={lang}
    />
    </div>
  );
}
