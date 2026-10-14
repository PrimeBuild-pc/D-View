import { cpSync, existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const commands = {
  dev: ['--filter', '@dpd/web', 'dev'],
  build: ['-r', 'build'],
  'db:push': ['--filter', '@dpd/database', 'db:push'],
  'db:generate': ['--filter', '@dpd/database', 'prisma:generate'],
};
const command = process.argv[2];
const args = commands[command];
if (!args && command !== 'start') throw new Error('Unknown dashboard command.');
const envFile = path.resolve(root, process.env.DPD_ENV_FILE || '.env');
if (existsSync(envFile)) loadEnvFile(envFile);
if (command === 'start') {
  const app = path.join(root, 'apps/web');
  const standalone = path.join(app, '.next/standalone/apps/web');
  // Next deliberately omits static assets from standalone output; prepare them before serving.
  cpSync(path.join(app, '.next/static'), path.join(standalone, '.next/static'), { recursive: true });
  if (existsSync(path.join(app, 'public'))) cpSync(path.join(app, 'public'), path.join(standalone, 'public'), { recursive: true });
  await import(pathToFileURL(path.join(standalone, 'server.js')).href);
} else {
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw new Error('Run this command through pnpm.');
  const child = spawn(process.execPath, [pnpm, ...args], { cwd: root, stdio: 'inherit', env: process.env });
  child.on('error', () => { process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
