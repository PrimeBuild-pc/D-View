import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(path.join(root, name), 'utf8');

// Allow only process-launch essentials: never inherit the user's app/Docker secrets.
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    [
      'PATH',
      'SYSTEMROOT',
      'WINDIR',
      'TEMP',
      'TMP',
      'PATHEXT',
      'PROGRAMFILES',
      'PROGRAMDATA',
      'PROGRAMFILES(X86)',
    ].includes(key.toUpperCase()),
  ),
);
const scratch = mkdtempSync(path.join(tmpdir(), 'd-view-infra-'));
const envFile = path.join(scratch, 'fake.env');
const fake = {
  POSTGRES_PASSWORD: '0123456789abcdef'.repeat(4),
  AUTH_SECRET: 'abcdef0123456789'.repeat(4),
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'fake-oauth-secret',
  DISCORD_BOT_TOKEN: 'fake-bot-token',
};
const env = {
  ...environment,
  COMPOSE_DISABLE_ENV_FILE: '1',
  DOCKER_CONFIG: scratch,
};
const cli = spawnSync('docker', ['compose', 'version'], {
  env,
  encoding: 'utf8',
});
const composeAvailable = cli.status === 0;
const configure = (values) => {
  writeFileSync(
    envFile,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  return spawnSync(
    'docker',
    [
      'compose',
      '--project-name',
      'd-view-offline-check',
      '--project-directory',
      root,
      '--env-file',
      envFile,
      '-f',
      path.join(root, 'docker-compose.yml'),
      'config',
      '--format',
      'json',
    ],
    { env, encoding: 'utf8' },
  );
};

try {
  await test('build excludes private env/local artifacts and serves non-root standalone static assets', () => {
    const ignored = read('.dockerignore').split(/\r?\n/);
    for (const pattern of [
      '**/.env',
      '**/.env.*',
      '**/.verification',
      '**/node_modules',
      '**/.next',
      '**/*.dump',
    ]) {
      assert.ok(
        ignored.includes(pattern),
        `Missing Docker exclusion: ${pattern}`,
      );
    }
    assert.ok(
      !ignored.some((line) => line.startsWith('!')),
      'Do not re-include excluded secrets',
    );
    const dockerfile = read('Dockerfile');
    const web = dockerfile.split('FROM base AS web')[1];
    assert.match(web, /USER node/);
    assert.match(web, /\.next\/standalone/);
    assert.match(web, /\.next\/static \.\/apps\/web\/\.next\/static/);
    assert.match(web, /CMD \["node", "apps\/web\/server\.js"\]/);
    assert.doesNotMatch(web, /npm install|COPY \. \./);
    assert.match(dockerfile, /DPD_ENV_FILE=\/tmp\/dpd-build\.env/);
    assert.match(
      dockerfile,
      /FROM source AS schema[\s\S]*?USER node[\s\S]*?"db:push", "--skip-generate"/,
    );
    assert.doesNotMatch(
      dockerfile,
      /--accept-data-loss|--force-reset|ARG .*SECRET|ARG .*TOKEN/,
    );
    const workspace = read('pnpm-workspace.yaml');
    assert.doesNotMatch(
      workspace,
      /dangerouslyAllowAllBuilds|set this to true or false/,
    );
    for (const name of [
      "'@prisma/client'",
      "'@prisma/engines'",
      'esbuild',
      'prisma',
      'sharp',
    ]) {
      assert.ok(workspace.includes(`${name}: true`));
    }
    const manifest = JSON.parse(read('package.json'));
    assert.ok(
      dockerfile.includes(`pnpm@${manifest.packageManager.split('@')[1]}`),
    );
  });

  await test(
    'Compose uses isolated DB, readiness and one-shot schema gates with safe defaults',
    {
      skip:
        !composeAvailable &&
        'Docker Compose CLI unavailable (no daemon needed)',
    },
    () => {
      const result = configure(fake);
      assert.equal(result.status, 0, result.stderr);
      const { services, volumes } = JSON.parse(result.stdout);
      const { postgres, schema, web } = services;
      assert.equal(postgres.image, 'postgres:16-alpine');
      assert.equal(postgres.ports, undefined);
      assert.ok(volumes.postgres_data);
      assert.equal(postgres.volumes[0].source, 'postgres_data');
      assert.equal(postgres.volumes[0].target, '/var/lib/postgresql/data');
      assert.ok(
        postgres.healthcheck.test.includes(
          'pg_isready -h 127.0.0.1 -U postgres -d discord_permission_dashboard',
        ),
      );
      assert.equal(schema.depends_on.postgres.condition, 'service_healthy');
      assert.equal(web.depends_on.postgres.condition, 'service_healthy');
      assert.equal(
        web.depends_on.schema.condition,
        'service_completed_successfully',
      );
      assert.equal(schema.restart, 'no');
      assert.equal(schema.build.target, 'schema');
      assert.equal(web.build.target, 'web');
      assert.equal(web.ports.length, 1);
      assert.equal(web.ports[0].host_ip, '127.0.0.1');
      assert.equal(web.ports[0].target, 3000);
      assert.equal(String(web.ports[0].published), '3000');
      for (const service of [schema, web]) {
        assert.equal(service.read_only, true);
        assert.deepEqual(service.cap_drop, ['ALL']);
        assert.ok(service.security_opt.includes('no-new-privileges:true'));
        assert.ok(service.tmpfs.length > 0);
        assert.equal(
          service.environment.DATABASE_URL,
          `postgresql://postgres:${fake.POSTGRES_PASSWORD}@postgres:5432/discord_permission_dashboard`,
        );
        assert.equal(service.env_file, undefined);
      }
      assert.equal(schema.environment.DISCORD_BOT_TOKEN, undefined);
      assert.equal(web.environment.APP_URL, 'http://localhost:3000');
      assert.equal(web.environment.DISCORD_WRITES_LOCKED, 'true');
      assert.equal(web.environment.DISCORD_WRITES_ALWAYS, 'false');
    },
  );

  await test(
    'Compose rejects missing credentials and respects deliberate origin/write overrides',
    {
      skip:
        !composeAvailable &&
        'Docker Compose CLI unavailable (no daemon needed)',
    },
    () => {
      for (const key of Object.keys(fake)) {
        const missing = { ...fake, [key]: '' };
        assert.notEqual(
          configure(missing).status,
          0,
          `${key} must be required`,
        );
      }
      const result = configure({
        ...fake,
        APP_URL: 'https://dashboard.example.com',
        DISCORD_WRITES_LOCKED: 'false',
      });
      assert.equal(result.status, 0, result.stderr);
      const web = JSON.parse(result.stdout).services.web;
      assert.equal(web.environment.APP_URL, 'https://dashboard.example.com');
      assert.equal(web.environment.DISCORD_WRITES_LOCKED, 'false');
      assert.equal(web.environment.DISCORD_WRITES_ALWAYS, 'false');
    },
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
