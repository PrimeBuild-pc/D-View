# Architecture

## Stack
- TypeScript end-to-end, strict mode, `exactOptionalPropertyTypes`.
- Monorepo with pnpm workspaces.
- `apps/web`: Next.js App Router dashboard, API routes, and all Discord REST calls.
- `packages/shared`: snapshot types, zod schemas, Discord permission bits, masked-intent helpers.
- `packages/permission-engine`: pure permission calculation, audit rules, and diffing.
- `packages/database`: Prisma schema and client for PostgreSQL.

### There is no `apps/bot`

Earlier drafts of this document described a discord.js bot owning Gateway
integration and syncing. It was never built, and it is not going to be:
D-View reads on demand over REST and has no reason to hold a persistent
Gateway connection. A separate always-on process would add deployment
surface and a second place for Discord credentials to live, in exchange
for nothing this product needs.

All Discord traffic goes through one client, `apps/web/src/lib/discord.ts`,
which owns rate-limit handling, retry policy and audit-log attribution.

### UI components

Local components live in `apps/web/src/components`. A `packages/ui` was
deferred "until duplication appears"; duplication appeared and was
extracted, but into the app rather than a package, because there is
exactly one consumer.

## Component boundaries

### Web app
Owns UI, routing, OAuth, API routes, and Discord REST. It must not contain
permission-calculation logic beyond calling the engine.

### Shared package
Owns domain types, zod schemas, the Discord permission bit table, and the
masked-intent primitives (`applyMask`, `assertOnlyTouched`) that every
write goes through.

### Permission engine
Pure functions only. No Discord API, database, filesystem, or network.
This is a hard constraint rather than a stylistic one: it is what allows
the identical code to run on the server and in the browser, which is what
makes the Explorer resolve a selection without a round trip.

Inputs are normalised snapshots; outputs are bitfields plus ordered
explanation steps. The engine emits **codes**, never prose — otherwise the
two most content-heavy panels in the product could not be translated.

### Database package
Owns the persistence schema for cached Discord entities, snapshots, change
plans, executions and per-operation results.

## Key decisions

- **Prisma over Drizzle**, for schema ergonomics and migration tooling.
- **`prisma db push` rather than migrations**, because every installation
  owns its own database and starts from an empty one.
- **Zod for validation** on every externally-supplied payload.
- **Vitest** for unit tests, concentrated in the permission engine.
- **Tailwind v4 with `@theme` tokens, no component library.** Generated
  component boilerplate would outweigh what this app actually uses.
- **No `discord-api-types` dependency.** The permission bit table is
  display-only — writes use masked intents, so an incomplete table cannot
  cause data loss — and a dozen named constants do not justify a
  dependency on the write path.

## Assumptions

- Permissions are stored and transported as **decimal bitfield strings**,
  Discord's own wire format. Never as lists of names: a name list cannot
  represent a permission Discord adds later, and converting through one
  silently drops whatever it does not recognise.
- Cached snapshots are the source of truth for the UI. Live Discord reads
  happen on explicit sync, and immediately before each write.
- Category overwrites are **not** an inheritance layer. Discord's
  `compute_overwrites` never reads `parent_id`; syncing copies overwrites
  onto the child at edit time. Sync state is reported as an annotation.
