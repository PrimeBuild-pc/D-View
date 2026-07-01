# Architecture

## Stack
- TypeScript end-to-end, strict mode.
- Monorepo with pnpm workspaces.
- `apps/web`: Next.js App Router dashboard.
- `apps/bot`: discord.js bot entrypoint.
- `packages/shared`: shared IDs, permission names, snapshot schemas.
- `packages/permission-engine`: pure permission calculation and audit helpers.
- `packages/database`: Prisma schema/client for PostgreSQL.

`packages/ui` is intentionally skipped for the first slice. Local Tailwind components are enough; extract later when duplication appears.

## Component boundaries

### Web app
Owns UI, dashboard routing, mock vertical slice, future Discord OAuth callbacks, and API routes. It must not contain raw permission-calculation logic beyond calling the engine.

### Bot app
Owns Discord Gateway/API integration, guild syncing, rate-limit aware reads, and future batch application. First slice only validates configuration and starts cleanly.

### Shared package
Owns stable domain types and Zod schemas used by web, bot, database import/export, and tests.

### Permission engine
Pure functions only. No Discord API, database, filesystem, or network. Inputs are normalized snapshots; outputs include effective permissions plus explanation traces.

### Database package
Owns persistence schema for cached Discord entities, snapshots, change plans, executions, audit findings, dashboard authorization, and preset templates.

## Main flows

### Future OAuth dashboard flow
1. User signs in with Discord OAuth.
2. App fetches guilds visible to user.
3. App filters guilds where user is owner or has Administrator for read access.
4. Write access requires owner, Administrator, or configured Permission Manager role.
5. Web reads cached snapshot and renders through permission engine.

### Future Discord sync flow
1. Bot reads guild roles/channels/overwrites.
2. Bot normalizes Discord API objects into shared snapshot shape.
3. Snapshot is stored with schema version.
4. Audit rules run and persist findings.

### Future change flow
1. User/import/preset creates a `PermissionChangePlan`.
2. Server validates schema, guild, role/channel existence, bot permissions.
3. Engine computes diff and impact warnings.
4. User selects operations and confirms batch.
5. Bot applies idempotent operations with rate-limit handling.
6. Execution report and backup snapshot are stored.
7. Rollback uses the previous snapshot to generate a new plan, not direct blind restore.

## Technical decisions
- Prisma over Drizzle for fast schema readability and common PostgreSQL workflow.
- Zod for import validation and typed parsing.
- Vitest for package unit tests.
- Tailwind without shadcn in slice one to avoid generated boilerplate.
- React tree/panels as primary UI. Graph libraries are deferred.

## Assumptions
- IDs are strings branded by TypeScript; runtime still validates with Zod string schemas.
- Cached snapshots are source-of-truth for UI; live Discord reads happen through explicit sync.
- Channel-level overwrites override inherited category explanations when present.
