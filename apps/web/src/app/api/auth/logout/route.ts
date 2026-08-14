import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }
  await clearSession();
  return NextResponse.redirect(new URL('/', request.url));
}
