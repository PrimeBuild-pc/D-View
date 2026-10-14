import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';
import { appUrl, invalidOrigin } from '@/lib/request';

export async function POST(request: Request) {
  if (invalidOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }
  await clearSession();
  return NextResponse.redirect(new URL('/', appUrl()), 303);
}
