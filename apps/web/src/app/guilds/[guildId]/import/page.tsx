import { getLang } from '@/lib/i18n';
import { canReadGuild, getSession } from '@/lib/session';
import { ImportForm } from './import-form';

export default async function ImportPage({ params, searchParams }: { params: Promise<{ guildId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const lang = getLang(query.lang);
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) return <p className="text-slate-400">Not authorized.</p>;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h1 className="text-2xl font-semibold text-white">Import JSON</h1>
      <p className="mt-2 text-slate-400">Validation and diff preview only. No Discord changes are applied.</p>
      <div className="mt-6"><ImportForm guildId={guildId} lang={lang} /></div>
    </div>
  );
}
