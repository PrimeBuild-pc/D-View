import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { NextConfig } from 'next';

const root = path.resolve(process.cwd(), '../..');

// Read at build time, not per request. Reading package.json from disk at runtime
// silently degrades to "dev" whenever the process is started from a different
// directory — which is exactly the situation where you wanted the version.
const version = (
  JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version?: string }
).version ?? 'dev';

const nextConfig: NextConfig = {
  turbopack: { root },
  env: { APP_VERSION: version },
};

export default nextConfig;
