# Implementation Plan

## Milestone 0 — Repository and docs
- [x] Capture product requirements.
- [x] Capture architecture.
- [x] Capture permission-engine design.
- [x] Capture JSON schema/import design.
- [x] Capture security model.
- [x] Track open questions.

## Milestone 1 — Local vertical slice
- Initialize pnpm monorepo.
- Add TypeScript strict config, ESLint, Prettier, Vitest.
- Create `packages/shared` with branded IDs, permissions, and snapshot schemas.
- Create `packages/permission-engine` with pure calculation and tests.
- Create `packages/database` with Prisma schema.
- Create `apps/bot` minimal discord.js shell.
- Create `apps/web` Next.js dashboard with mock guild data.
- Render role selector, channel tree, badges, detail panel, audit list, Presets placeholder, Changes placeholder.
- Run test, typecheck, lint, and build checks.

## Milestone 2 — Real Discord read-only integration
- [x] Add Discord OAuth in web.
- [x] Add signed cookie session storage.
- [x] Add guild selector from Discord user guild list.
- [x] Add one-shot bot guild sync job.
- [x] Normalize Discord roles/channels/overwrites into snapshot JSON.
- [x] Store snapshots in PostgreSQL.
- [x] Gate read access by owner/Administrator.
- [x] Add audit rule runner persistence.
- [ ] Render full synced permission tree, not only snapshot summary.
- [x] Add refresh/sync trigger UI with status.

## Milestone 3 — Snapshot export/import planning
- [x] Export current snapshot JSON.
- [x] Import candidate JSON with Zod validation.
- [x] Verify guildId and role/channel existence.
- [x] Compute diff preview into change-plan-like operations.
- [x] Add warnings and impact summary.
- [x] Add UI to include/exclude operations.

## Milestone 4 — Safe write operations
- [x] Persist selected import diff operations as `PermissionChangePlan` drafts.
- [x] Add plan detail page with before/after and warnings.
- [x] Add recent plan list in Changes / History.
- [x] Add write authorization through owner/Administrator (Permission Manager role remains future config).
- [x] Add reinforced confirmation for all applies, including `@everyone` and Administrator risk.
- [x] Create pre-apply backup snapshots.
- [x] Apply role permission and role overwrite batches through Discord REST when `ENABLE_DISCORD_WRITES=true`.
- [x] Store execution report and partial failure details.

## Milestone 5 — Rollback and presets
- Generate rollback plan from backup snapshots.
- Add preset template authoring and scoped application.
- Add preset preview/diff before apply.

## Milestone 6 — Scale and UX
- Virtualized matrix roles x channels.
- Advanced permission mode.
- More audit rules.
- Search/filtering.
- Playwright e2e coverage.
