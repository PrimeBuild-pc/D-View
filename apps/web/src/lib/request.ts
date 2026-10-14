import { NextResponse } from 'next/server';

/** Canonical public origin; never derive OAuth redirects from an untrusted Host header. */
export function appUrl(): URL {
  const url = new URL(process.env.APP_URL || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) throw new Error('APP_URL must be an HTTP(S) origin.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('APP_URL requires HTTPS except on loopback.');
  }
  return url;
}

export function invalidOrigin(request: Request): boolean {
  return request.headers.get('origin') !== appUrl().origin ||
    request.headers.get('sec-fetch-site') === 'cross-site';
}

export class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Enforce bytes while streaming, including requests without Content-Length. */
export async function readBody(request: Request, maxBytes: number): Promise<string> {
  const size = request.headers.get('content-length');
  if (size && (!/^\d+$/.test(size) || Number(size) > maxBytes)) throw new RequestError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestError('Request body timed out.', 408)), 15_000);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new RequestError('Request is too large.', 413);
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    clearTimeout(timer!);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function readJson(request: Request, maxBytes = 256 * 1024): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    throw new RequestError('Expected application/json.', 415);
  }
  try { return JSON.parse(await readBody(request, maxBytes)); }
  catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('Invalid JSON.');
  }
}

export async function readForm(request: Request): Promise<FormData> {
  const text = await readBody(request, 16 * 1024);
  try {
    return await new Request(request.url, {
      method: 'POST', headers: { 'content-type': request.headers.get('content-type') || '' }, body: text,
    }).formData();
  } catch { throw new RequestError('Invalid form.'); }
}

export function requestError(error: unknown): NextResponse {
  if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('Dashboard request failed:', error instanceof Error ? error.name : 'Unknown error');
  return NextResponse.json({ error: 'The request failed. Check the server configuration and try again.' }, { status: 500 });
}
