import { calculateChannelPermissions } from '@dpd/permission-engine';
import { prisma } from '@dpd/database';
import { permissionSnapshotSchema, type PermissionSnapshot } from '@dpd/shared';
import Link from 'next/link';
import { getLang } from '@/lib/i18n';
import { canReadGuild, getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MatrixPage({ params, searchParams }: { params: Promise<{ guildId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ guildId }, query] = await Promise.all([params, searchParams]);
  const lang = getLang(query.lang);
  const session = await getSession();
  const allowed = session?.guilds.some((guild) => guild.id === guildId && canReadGuild(guild));
  if (!allowed) return <p className="text-slate-400">Not authorized.</p>;
  const latest = await prisma.permissionSnapshot.findFirst({ where: { guildId }, orderBy: { createdAt: 'desc' } });
  if (!latest) return <p className="text-slate-400">No snapshot found.</p>;
  const snapshot = permissionSnapshotSchema.parse(latest.data) as PermissionSnapshot;
  const roles = snapshot.roles.slice(0, 50);
  const channels = snapshot.channels.filter((channel) => channel.type !== 'category').slice(0, 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Roles × Channels</h1>
          <p className="text-sm text-slate-400">Compact secondary matrix. V = visible, W = writable, A = Administrator bypass.</p>
        </div>
        <Link href={`/guilds/${guildId}?lang=${lang}`} className="text-sm text-slate-300">Back</Link>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-950">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-900">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-900 p-2 text-left text-slate-300">Role</th>
              {channels.map((channel) => <th key={channel.id} className="max-w-28 truncate border-l border-slate-800 p-2 text-left text-slate-300">{channel.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-t border-slate-800">
                <th className="sticky left-0 z-10 max-w-44 truncate bg-slate-950 p-2 text-left font-medium text-white">{role.name}</th>
                {channels.map((channel) => {
                  const result = calculateChannelPermissions(snapshot, role.id, channel.id);
                  const view = result.permissions.ViewChannel?.allowed;
                  const write = result.permissions.SendMessages?.allowed;
                  const admin = result.permissions.ViewChannel?.source === 'administrator-bypass';
                  return <td key={channel.id} className="border-l border-slate-800 p-2 text-center text-slate-200">{admin ? 'A' : view ? (write ? 'V/W' : 'V') : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
