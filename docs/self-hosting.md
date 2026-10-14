# Self-hosting and operations

[README quick start](../README.md#quick-start) · [Security](security-model.md) · [AI agents](agent-workflow.md)

## What runs

| Service    | Purpose                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `postgres` | PostgreSQL 16, persistent `postgres_data` volume; no host port.                                                                      |
| `schema`   | Non-root, one-shot safe index preparation and Prisma `db push --skip-generate`, after DB readiness. No destructive flags. Exit 0 is required before web starts. |
| `web`      | Non-root Node/Next standalone server, static files included, on host `127.0.0.1:3000`.                                               |

Web and schema drop capabilities, forbid privilege escalation and use read-only
root filesystems with bounded temporary storage. PostgreSQL uses its upstream
entrypoint to initialize/own the volume and then runs as the postgres user; it
needs writable persistent storage. The web image contains standalone output, not
the development workspace. Source/build stages contain tools for building and
schema synchronization. Base-image tags can change; rebuild for security updates
and record the release commit and image IDs for rollback. This is not a claim of
a complete CIS/host security audit.

Dependency lifecycle scripts are allowed only for Prisma, esbuild and sharp in
`pnpm-workspace.yaml`; newly introduced install scripts need explicit review.
No `.env`, `.env.*`, local dependencies, `.next` or `.verification` enter the build
context. Images are built without Discord credentials or a live database. Do not
add secret build arguments, copy secret files or put secrets in `NEXT_PUBLIC_*`.
There is currently no `apps/web/public` directory; if one is added, copy it into
the standalone web stage as well as the existing `.next/static` copy.

## Configuration

Use `.env` **at repository root**, with values from [`.env.example`](../.env.example).
Compose reads it for variable interpolation and explicitly passes runtime fields
to each service. `docker compose --env-file /path/to/local.env ...` selects another
file. Avoid sharing `docker compose config` output: it contains resolved secrets.
Use `docker compose config --quiet` for local validation without printing them.
Runtime environment is visible to users with Docker/host administrator access;
protect the host and local env file, not only the repository.

For native commands the root `scripts/run.mjs` uses Node's `loadEnvFile`; existing
process environment wins. `DPD_ENV_FILE=/path/to/local.env pnpm dev` selects another
file (PowerShell: `$env:DPD_ENV_FILE = 'C:\path\local.env'`). `DPD_ENV_FILE` does not
change Compose's env-file selection. Keep Next-specific `.env*` files out of
`apps/web` to avoid a second source of configuration.

Compose always creates its own internal `DATABASE_URL` with host `postgres`;
it does not use a native `DATABASE_URL`. Use a generated hexadecimal
`POSTGRES_PASSWORD` to avoid URL escaping/interpolation pitfalls. There is no
embedded default password. An empty required credential makes Compose refuse
configuration before starting anything. App-level diagnostics validate the origin
and auth secret length, not just whether Compose received nonempty strings.

### HTTPS and remote access

If Doorman runs on the same host, choose port **3001** in its installer and use
`http://localhost:3001` and the matching OAuth callback there. Leave D-View on
3000 and Gnosis on 8080; keep their Discord apps, credentials and volumes separate.
For local-only administration of a remote D-View host, run
`ssh -N -L 3000:127.0.0.1:3000 USER@HOST` and open `http://localhost:3000`, keeping
the default `APP_URL` and OAuth callback. No public domain or router port is needed.

Default web publication is loopback only. Run an HTTPS reverse proxy on the host
forwarding to `http://127.0.0.1:3000`. If a proxy is in another container, attach it
to the same Compose network and upstream `http://web:3000` instead; keep PostgreSQL
unpublished. TLS/domain/proxy provisioning is the operator's responsibility.

1. Set `APP_URL=https://d-view.example.com` to the canonical browser origin.
   HTTP is allowed only for `localhost`, `127.0.0.1` and IPv6 loopback.
2. Register `https://d-view.example.com/api/auth/callback` exactly in Discord.
3. Configure the proxy to preserve the browser's `Origin` and cookies and permit
   long-running apply requests (up to five minutes). Do not rewrite the Origin to
   an internal host. Proxy headers do not override `APP_URL`.
4. Recreate web after env changes: `docker compose up -d --no-deps --force-recreate web`.
5. Open the canonical URL, sign in and check `/setup`. Use a fresh login after
   switching hostnames or HTTP/HTTPS; secure cookies require HTTPS remotely.

An HTTPS origin mismatch yields rejected POSTs/OAuth failure, not a reason to
weaken Origin checks. Do not publish port 3000 publicly as a substitute for TLS.
Older Docker Engines may expose loopback-published ports to hosts on the same L2
network; use a current patched engine and host firewall for sensitive installs.

### Optional Discord writes

Keep `DISCORD_WRITES_LOCKED=true` for read-only operation. Reading needs bot guild
membership, not Administrator or management permissions. A portal invite with
`bot` scope and `permissions=0` is the least-privilege starting point; grant View
Channels only where required for intended visibility. No messages are read.

To deliberately allow edits:

1. Decide which roles/channels the bot may manage. Grant **Manage Roles** for role
   permissions and channel overwrite edits. Do not grant Administrator. Manage
   Channels is not required by the current permission-edit pipeline. The `/setup`
   invite intentionally grants neither management permission.
2. Put the bot's highest role above roles it will edit. It cannot edit managed
   roles or grant permissions it does not itself possess. Channel permissions
   and Discord hierarchy may still cause 403s; granting Administrator is not the
   troubleshooting default.
3. Set `DISCORD_WRITES_LOCKED=false`, keep `DISCORD_WRITES_ALWAYS=false`, and
   recreate web. Existing per-guild persistent unlocks may resume when the global
   lock is removed; inspect Settings before allowing live changes.
4. Sign in as guild owner/Administrator, review the server's Settings policy,
   unlock for the default 60-minute window, and create/review a plan.
5. Apply only after explicit confirmation; test with a disposable role/channel.
   Inspect applied/skipped/failed/unknown results before considering rollback.

Changing policy in Settings relocks writes. Rollback only generates a new plan;
it is another live write when applied. No configurable Permission Manager role
exists today. For automation, follow [the consent workflow](agent-workflow.md).

## Native development

Use **Node.js 24 LTS** (or >=22.13) and the pinned **pnpm 11.9.0**. Node's env loader,
pnpm 11, Next and the locked tooling are not compatible with older Node versions.
If Corepack is installed, `corepack enable pnpm` uses `packageManager`; otherwise
install pnpm through its official instructions and verify `pnpm --version`.

For local development with Compose PostgreSQL, explicitly opt into loopback DB
publication. Create **`compose.native.yml`** locally (do not use it for hosting):

```yaml
services:
  postgres:
    ports:
      - '127.0.0.1:5432:5432'
```

Fill the root `.env` as in the README and uncomment the native `DATABASE_URL`
with the same hex password and `localhost:5432`. Compose interpolation validates
all services, so fill all required variables even when selecting only postgres.

```bash
docker compose -f docker-compose.yml -f compose.native.yml up -d postgres
pnpm install --frozen-lockfile
pnpm db:push
pnpm dev
```

Alternatively use an existing local PostgreSQL 16 instance and set `DATABASE_URL`
to it; no Docker override is then needed. `pnpm db:push` changes the selected
schema: back it up if it contains data. Do not point development at production.
`pnpm install` generates Prisma; `pnpm db:generate` regenerates without DB writes.
Use root commands: direct `pnpm --filter ... db:push` bypasses root env loading.
Stop native dev before starting Compose web: both use port 3000.

For a native production-style check, `pnpm build` then `pnpm start`. The start
wrapper copies static assets into `apps/web/.next/standalone/apps/web` and launches
its `server.js`; it needs the matching workspace build. If Next's dev origin does
not match `APP_URL`, open the configured hostname rather than disabling CSRF.

## Existing installations

**Back up before upgrading.** The original database-only Compose used the same
`postgres_data` key, database `discord_permission_dashboard` and user `postgres`,
but a weak default password and a published host port. Keep the **same Compose
project name and directory** (or the original `-p` project name): changing them
can create a different empty volume. Never use `docker compose down -v` for an
upgrade. `docker compose down` without `-v` retains data but causes downtime.

PostgreSQL only applies `POSTGRES_PASSWORD` on **first initialization**. A new env
value does not change the password in an existing volume. With the current
password set temporarily, take a backup; then the operator can open a local SQL
session with `docker compose exec postgres psql -U postgres -d discord_permission_dashboard`
and run `\password postgres` interactively. Enter the new hex password without
putting it in a command/history, update root `.env` to match and recreate services.
Do not leave the old default password in place. During this procedure web should
be stopped and writes globally locked. Credentials supplied to web/schema must
match the volume's actual password.

An old local port override can keep publishing PostgreSQL: inspect and remove it
when moving from native development to hosting. Do not delete a volume to fix an
authentication failure.

## Updates and schema changes

The repository currently uses **Prisma `db push`**, not versioned SQL migrations.
It does not provide an automatic data migration or a guaranteed downgrade path.
Fields such as `ownerId` and execution/overwrite existence tracking have changed;
old volumes must have the current schema before web starts. Legacy name-based
snapshots cannot be converted safely: sync again rather than inventing lost bits.

1. Lock Discord writes, finish any running plan and stop web. Allow for a
   five-minute in-flight apply; inspect history/results before restarting.
2. [Back up](#backups) the database and secure configuration; record the current
   release/commit, Compose project name, PostgreSQL major and image IDs.
3. Fetch/select a reviewed release in a clean checkout. Preserve local config
   and the original project/volume identity. Review schema/release differences.
4. Build, remove only the previous one-shot **container**, and start:

   ```bash
   docker compose build schema web
   docker compose stop web
   docker compose rm -f schema
   docker compose up -d schema web
   docker compose ps -a
   docker compose logs --tail=100 schema web
   ```

5. Confirm schema exit 0, web startup, authenticated `/setup`, and a read-only
   guild sync before deliberately restoring write access.

The shared native/Docker `db:push` command first creates the execution/operation
unique index if the result table already exists. PostgreSQL validates existing
rows; duplicates stop the job without deleting or merging historical results.
Resolve such duplicates only through a reviewed migration against a backup/test
restore. Keep web stopped during this upgrade. The preparation is idempotent and
does not suppress Prisma's warnings about any other schema changes.

If Prisma reports possible data loss or fails, **stop and plan a migration against
a backup/test restore**. Do not add `--accept-data-loss`, `--force-reset` or delete
volumes just to unblock startup. Backups do not make an unreviewed destructive
schema change safe. Test old-volume upgrades on a separate restored copy first.
Re-running `up` alone is not a reliable update procedure for an already-completed
schema container; remove/recreate that container as above.

Changing PostgreSQL major versions requires PostgreSQL upgrade/dump-restore
procedures; never attach a 16 data directory to a different major blindly.
Rollback code only if the schema is compatible; otherwise restore the matching
backup and code together, accepting the loss of DB changes since that backup.
A DB restore does **not** revert Discord permissions already changed on Discord.

## Backups

Snapshots/JSON exports are not full backups: they omit execution history and other
DB state. Store database dumps and secrets/configuration separately, encrypted,
with restricted access, off the Docker host. Dumps include member data. Choose
retention and disk monitoring: history grows without automatic pruning.

For a consistent operational backup, globally lock writes and stop web, then:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U postgres -d discord_permission_dashboard -Fc -f /tmp/d-view.dump
docker compose cp postgres:/tmp/d-view.dump backups/d-view.dump
docker compose exec -T postgres rm /tmp/d-view.dump
```

Use dated filenames to avoid overwriting the last good backup. On PowerShell,
create the directory with `New-Item -ItemType Directory -Force backups`; the
`docker compose cp` method avoids corrupting binary dumps through shell output
redirection. PostgreSQL remains running for the dump; `pg_dump` uses a consistent
DB snapshot, but not an atomic snapshot of live Discord. Restart web only after
the backup succeeds, with writes still locked. Securely back up `.env` separately
using your own secret storage, never in git or an image. Regularly test a restore.

## Restores

Prefer first restoring into an isolated Compose project/volume with no public
ports and **fake Discord credentials**, to validate the dump/schema without
contacting Discord. The following overwrites the selected database's contents;
confirm project/volume identity and take a fresh backup before proceeding.

1. Set `DISCORD_WRITES_LOCKED=true` and `DISCORD_WRITES_ALWAYS=false`. Stop web and
   schema so no application operations race the restore.
2. Use the matching PostgreSQL major and release. With postgres running:

   ```bash
   docker compose stop web schema
   docker compose cp backups/d-view.dump postgres:/tmp/d-view.dump
   docker compose exec -T postgres pg_restore -U postgres -d discord_permission_dashboard --clean --if-exists --no-owner --single-transaction --exit-on-error /tmp/d-view.dump
   docker compose exec -T postgres rm /tmp/d-view.dump
   ```

3. Verify restore success. Keep the current volume's DB password in `.env`: a
   database dump is not a backup/restore of PostgreSQL role credentials.
4. Rotate `AUTH_SECRET` to invalidate every prior dashboard session, remove the
   old schema container and start schema/web with the matching reviewed code.
   Confirm schema exit 0 and sign in again. If schema would lose data, stop.
5. Inspect history and live Discord state before any new apply. Restored plans or
   persistent unlock settings may be stale; the global lock must remain on until
   the operator reviews them. Never replay old plans automatically.

## Sessions and credential rotation

Sessions are encrypted, httpOnly cookies, limited to at most seven days (also
bounded by OAuth token expiry), with Secure enabled for HTTPS. The hardened
session format invalidates older signed-only cookies: existing users must log in
again after upgrading. Rotate `AUTH_SECRET` and recreate web to invalidate all
current cookies. OAuth/token revocation may require login sooner. Changing the
Discord bot/client secret requires replacing it locally and recreating web;
Docker restart alone does not pick up changed environment variables.

## Troubleshooting and verification

- **Schema job failed:** inspect its logs locally; check real volume credentials
  and schema compatibility. Never paste credentials or unredacted config output.
- **Guild missing/401:** sign in as its owner/Administrator and ensure that the
  installed bot belongs to the guild. OAuth guild access is rechecked against
  Discord; old cached access is not a bypass.
- **403 on POST:** exact browser origin must equal `APP_URL`; use a session and
  same-origin request. See [agent workflow](agent-workflow.md).
- **Member list failure:** check the optional Server Members intent. Individual
  lookup remains available without bulk sync.
- **Port busy:** stop the native dev server or conflicting service. Changing the
  published port also requires updating `APP_URL` and the OAuth redirect.
- **Static assets missing:** rebuild the web image; the standalone server requires
  the matching `.next/static` tree, not only `server.js`.
- **Windows build: `EPERM ... symlink`:** Next's standalone packaging needs permission
  to create symbolic links. Prefer the Linux-container Docker path or WSL with the
  checkout on its Linux filesystem. Windows Developer Mode may also permit links,
  if your machine policy allows it; changing OS policy is an operator decision.
  Successful compilation alone does not mean standalone packaging succeeded.

Offline self-check: `node --test tests/infra.test.mjs`. It checks Dockerfile/context
rules and resolves Compose with a **temporary fake env file**, no daemon, database
or Discord calls. If the Compose CLI is missing those cases are explicitly skipped.
The full application gates are in root `package.json`. Run them in a sanitized
copy with dummy env rather than loading production `.env`.

Actual Docker builds and container startup/readiness, new-DB/old-volume schema
pushes, HTTPS OAuth and live Discord writes require a separate operator-approved
staging check. Static/config checks cannot establish that those paths work on a
particular Docker host. No automatic deployment is bundled.
