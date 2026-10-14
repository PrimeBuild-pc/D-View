import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, it } from 'vitest';

it('loads the chosen root env file and preserves existing environment overrides', () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  mkdirSync(path.join(root, '.verification'), { recursive: true });
  const scratch = mkdtempSync(path.join(root, '.verification/env-test-'));
  try {
    const envFile = path.join(scratch, 'sample.env');
    const cli = path.join(scratch, 'fake-pnpm.mjs');
    writeFileSync(envFile, 'DPD_TEST_VALUE=from-file\n');
    writeFileSync(cli, 'console.log(JSON.stringify({ value: process.env.DPD_TEST_VALUE, args: process.argv.slice(2) }));');
    for (const override of [undefined, 'override']) {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/run.mjs'), 'build'], {
        encoding: 'utf8', env: { NODE_ENV: 'test', PATH: process.env.PATH, DPD_ENV_FILE: envFile, npm_execpath: cli,
          ...(override ? { DPD_TEST_VALUE: override } : {}) },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ value: override || 'from-file', args: ['-r', 'build'] });
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

it('starts the standalone server only after preparing its static assets', () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  mkdirSync(path.join(root, '.verification'), { recursive: true });
  const scratch = mkdtempSync(path.join(root, '.verification/start-test-'));
  try {
    const app = path.join(scratch, 'apps/web');
    const standalone = path.join(app, '.next/standalone/apps/web');
    mkdirSync(path.join(scratch, 'scripts'), { recursive: true });
    mkdirSync(path.join(app, '.next/static'), { recursive: true });
    mkdirSync(standalone, { recursive: true });
    mkdirSync(path.join(app, 'public'), { recursive: true });
    writeFileSync(path.join(app, 'public/icon.txt'), 'icon');
    writeFileSync(path.join(scratch, 'scripts/run.mjs'), readFileSync(path.join(root, 'scripts/run.mjs')));
    writeFileSync(path.join(app, '.next/static/app.css'), 'body { color: red }');
    writeFileSync(path.join(standalone, 'package.json'), '{"type":"module"}');
    writeFileSync(path.join(standalone, 'server.js'), "import { readFileSync } from 'node:fs'; console.log(readFileSync(new URL('./.next/static/app.css', import.meta.url), 'utf8'));");
    const result = spawnSync(process.execPath, [path.join(scratch, 'scripts/run.mjs'), 'start'], {
      encoding: 'utf8', env: { NODE_ENV: 'test', PATH: process.env.PATH },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('body { color: red }');
    expect(readFileSync(path.join(standalone, 'public/icon.txt'), 'utf8')).toBe('icon');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
