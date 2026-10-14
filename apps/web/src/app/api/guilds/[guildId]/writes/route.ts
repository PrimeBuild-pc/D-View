import { NextResponse } from 'next/server';
import { guildAccess } from '@/lib/guild';
import { appUrl, invalidOrigin, readForm, requestError } from '@/lib/request';
import { disableWrites, enableWrites, setWriteMode, writesForcedAlways, writesLocked } from '@/lib/writes';

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  if (invalidOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  if (!(await guildAccess(guildId))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (writesLocked() || writesForcedAlways()) {
    return NextResponse.json({ error: 'Write access is fixed by configuration.' }, { status: 403 });
  }
  try {
    const form = await readForm(request);
    const action = form.get('action');
    const back = new URL(`/guilds/${guildId}/settings`, appUrl());
    if (action === 'mode' || action === 'enable') {
      if (!['always', 'window'].includes(String(form.get('mode')))) {
        return NextResponse.json({ error: 'Invalid write mode.' }, { status: 400 });
      }
      const mode = form.get('mode') === 'always' ? 'always' : 'window';
      if (action === 'mode') {
        await setWriteMode(guildId, mode);
        back.searchParams.set('writes', 'mode');
        back.searchParams.set('mode', mode);
      } else {
        const until = await enableWrites(guildId, mode);
        back.searchParams.set('writes', 'opened');
        if (until) back.searchParams.set('until', until.toISOString());
      }
    } else if (action === 'disable') {
      await disableWrites(guildId);
      back.searchParams.set('writes', 'closed');
    } else {
      return NextResponse.json({ error: 'Invalid write action.' }, { status: 400 });
    }
    return NextResponse.redirect(back, 303);
  } catch (error) { return requestError(error); }
}
