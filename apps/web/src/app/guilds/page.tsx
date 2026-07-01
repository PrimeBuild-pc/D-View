import Link from 'next/link';
import { getLang, t } from '@/lib/i18n';
import { canReadGuild, getSession } from '@/lib/session';

export default async function GuildsPage({ searchParams }: { searchParams: Promise<{ lang?: string; sync?: string }> }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const lang = getLang(params.lang);
  const copy = t(lang);
  if (!session) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-2xl font-semibold text-white">{copy.loginRequired}</h1>
        <p className="mt-2 text-slate-400">{copy.loginHelp}</p>
        <a className="mt-4 inline-block rounded bg-indigo-600 px-4 py-2 text-white" href="/api/auth/login">{copy.login}</a>
      </div>
    );
  }

  const readableGuilds = session.guilds.filter(canReadGuild);
  const syncMessage = params.sync === 'unauthorized' ? copy.syncUnauthorized : undefined;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{copy.readableGuilds}</h1>
          <p className="mt-1 text-slate-400">{copy.signedInAs} {session.user.username}. {copy.showingGuilds}</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="?lang=en" className={lang === 'en' ? 'text-white' : 'text-slate-400'}>EN</Link>
          <Link href="?lang=it" className={lang === 'it' ? 'text-white' : 'text-slate-400'}>IT</Link>
          <Link href="?lang=zh" className={lang === 'zh' ? 'text-white' : 'text-slate-400'}>中文</Link>
          <Link href="/api/auth/logout" className="text-slate-300">{copy.logout}</Link>
        </div>
      </div>
      {syncMessage ? <p className="mt-4 rounded border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">{syncMessage}</p> : null}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {readableGuilds.map((guild) => (
          <div key={guild.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="font-medium text-white">{guild.name}</h2>
            <p className="text-sm text-slate-400">{guild.owner ? 'Owner' : 'Administrator'} · {copy.readAllowed}</p>
            <div className="mt-3 flex items-center gap-3">
              <Link href={`/guilds/${guild.id}?lang=${lang}`} className="text-sm text-indigo-300">{copy.openSnapshot}</Link>
              <form action={`/api/guilds/${guild.id}/sync?lang=${lang}`} method="post">
                <button className="text-sm text-slate-300 underline">{copy.syncNow}</button>
              </form>
            </div>
          </div>
        ))}
        {readableGuilds.length === 0 && <p className="text-slate-400">{copy.noGuilds}</p>}
      </div>
    </div>
  );
}
