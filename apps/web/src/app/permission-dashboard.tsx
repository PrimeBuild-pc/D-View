import { auditSnapshot, calculateGuildTree } from '@dpd/permission-engine';
import type { ChannelPermissionResult, PermissionExplanation } from '@dpd/permission-engine';
import type { PermissionSnapshot, RoleId } from '@dpd/shared';
import { type Lang, t } from '@/lib/i18n';

function Badge({ children, tone = 'slate' }: { children: string; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'purple' | undefined }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-200 border-slate-700',
    green: 'bg-green-950 text-green-200 border-green-800',
    red: 'bg-red-950 text-red-200 border-red-800',
    amber: 'bg-amber-950 text-amber-200 border-amber-800',
    blue: 'bg-blue-950 text-blue-200 border-blue-800',
    purple: 'bg-purple-950 text-purple-200 border-purple-800',
  };
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${tones[tone]}`}>{children}</span>;
}

function badges(node: ChannelPermissionResult, lang: Lang): Array<{ text: string; tone?: Parameters<typeof Badge>[0]['tone'] }> {
  const copy = t(lang);
  const view = node.permissions.ViewChannel;
  const send = node.permissions.SendMessages;
  return [
    { text: view?.allowed ? copy.visible : copy.hidden, tone: view?.allowed ? 'green' : 'red' },
    { text: send?.allowed ? copy.write : copy.readOnly, tone: send?.allowed ? 'blue' : 'amber' },
    { text: node.hasChannelSpecificOverride ? copy.override : copy.inherited, tone: node.hasChannelSpecificOverride ? 'purple' : 'slate' },
    ...(view?.source === 'administrator-bypass' ? [{ text: copy.admin, tone: 'red' as const }] : []),
    ...(node.memberOverwriteCount > 0 ? [{ text: copy.memberException, tone: 'amber' as const }] : []),
  ];
}

function Explain({ title, explanation, lang }: { title: string; explanation: PermissionExplanation | undefined; lang: Lang }) {
  const copy = t(lang);
  if (!explanation) return null;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-medium text-white">{title}</h3>
        <Badge tone={explanation.allowed ? 'green' : 'red'}>{explanation.allowed ? copy.allowed : copy.denied}</Badge>
      </div>
      <ol className="space-y-1 text-xs text-slate-300">
        {explanation.trace.map((entry, index) => (
          <li key={`${entry.source}-${index}`} className="rounded border border-slate-800 bg-slate-900 p-2">
            <span className="text-slate-400">{entry.source}</span>: {entry.reason}{' '}
            <span className="text-slate-500">({String(entry.allowedBefore)} → {String(entry.allowedAfter)})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ChannelLine({ node, selected, roleId, lang }: { node: ChannelPermissionResult; selected: boolean; roleId: string; lang: Lang }) {
  return (
    <a
      href={`?lang=${lang}&role=${encodeURIComponent(roleId)}&channel=${encodeURIComponent(node.channel.id)}`}
      className={`grid grid-cols-[1fr_auto] items-center gap-3 border-t border-slate-800 px-3 py-2 text-sm hover:bg-slate-900 ${selected ? 'bg-slate-900' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-slate-500">{node.channel.type === 'voice' ? '🔊' : '#'}</span>
        <span className="truncate text-slate-100">{node.channel.name}</span>
      </div>
      <div className="flex flex-wrap justify-end gap-1">{badges(node, lang).map((badge) => <Badge key={badge.text} tone={badge.tone}>{badge.text}</Badge>)}</div>
    </a>
  );
}

export function PermissionDashboard({
  snapshot,
  selectedRoleId,
  selectedChannelId,
  subtitle,
  lang,
}: {
  snapshot: PermissionSnapshot;
  selectedRoleId?: string | undefined;
  selectedChannelId?: string | undefined;
  subtitle: string;
  lang: Lang;
}) {
  const copy = t(lang);
  const selectedRole = snapshot.roles.find((role) => role.id === selectedRoleId) ?? snapshot.roles.find((role) => role.id !== snapshot.guild.everyoneRoleId) ?? snapshot.roles[0];
  if (!selectedRole) return <p className="text-slate-400">No roles available.</p>;

  const tree = calculateGuildTree(snapshot, selectedRole.id as RoleId);
  const channels = tree.flatMap((category) => category.children);
  const selectedChannel = channels.find((node) => node.channel.id === selectedChannelId) ?? channels[0];
  const findings = auditSnapshot(snapshot);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs text-slate-500">{subtitle}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">{snapshot.guild.name}</h1>
            <p className="text-sm text-slate-400">{copy.compactTree}</p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex gap-2 text-xs">
              <a className={lang === 'en' ? 'text-white' : 'text-slate-400'} href="?lang=en">EN</a>
              <a className={lang === 'it' ? 'text-white' : 'text-slate-400'} href="?lang=it">IT</a>
              <a className={lang === 'zh' ? 'text-white' : 'text-slate-400'} href="?lang=zh">中文</a>
            </div>
          <form>
            <label className="block text-xs text-slate-400" htmlFor="role">{copy.role}</label>
            <select id="role" name="role" defaultValue={selectedRole.id} className="mt-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
              {snapshot.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
            <input type="hidden" name="lang" value={lang} />
            {selectedChannel ? <input type="hidden" name="channel" value={selectedChannel.channel.id} /> : null}
            <button className="ml-2 rounded bg-indigo-600 px-3 py-2 text-sm text-white">{copy.apply}</button>
          </form>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          {tree.map((category) => (
            <div key={category.channel.id}>
              <div className="flex items-center justify-between gap-3 bg-slate-900/80 px-3 py-2">
                <h2 className="truncate text-sm font-semibold uppercase tracking-wide text-slate-300">▾ {category.channel.name}</h2>
                <div className="flex flex-wrap justify-end gap-1">{badges(category, lang).slice(0, 3).map((badge) => <Badge key={badge.text} tone={badge.tone}>{badge.text}</Badge>)}</div>
              </div>
              {category.children.map((channel) => (
                <ChannelLine key={channel.channel.id} node={channel} selected={channel.channel.id === selectedChannel?.channel.id} roleId={selectedRole.id} lang={lang} />
              ))}
            </div>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <h2 className="font-semibold text-white">{copy.selectedRole}</h2>
            <div className="mt-3 flex items-center gap-3">
              <span className="h-4 w-4 rounded-full" style={{ background: selectedRole.color ?? '#94a3b8' }} />
              <div className="min-w-0">
                <div className="truncate text-white">{selectedRole.name}</div>
                <div className="text-xs text-slate-400">{selectedRole.permissions.join(', ') || copy.noGlobalPermissions}</div>
              </div>
            </div>
          </div>

          {selectedChannel ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="truncate font-semibold text-white">#{selectedChannel.channel.name}</h2>
                <div className="flex flex-wrap justify-end gap-1">{badges(selectedChannel, lang).map((badge) => <Badge key={badge.text} tone={badge.tone}>{badge.text}</Badge>)}</div>
              </div>
              <div className="space-y-3">
                <Explain title="ViewChannel" explanation={selectedChannel.permissions.ViewChannel} lang={lang} />
                <Explain title="SendMessages" explanation={selectedChannel.permissions.SendMessages} lang={lang} />
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <h2 className="font-semibold text-white">{copy.audit}</h2>
            <div className="mt-3 space-y-2">
              {findings.slice(0, 8).map((finding, index) => (
                <div key={index} className="rounded border border-slate-800 bg-slate-900 p-3 text-sm">
                  <Badge tone={finding.severity === 'Critical' ? 'red' : finding.severity === 'Warning' ? 'amber' : 'blue'}>{finding.severity}</Badge>
                  <div className="mt-2 font-medium text-white">{finding.title}</div>
                  <p className="text-slate-400">{finding.description}</p>
                </div>
              ))}
              {findings.length === 0 && <p className="text-slate-400">{copy.noFindings}</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
