# Implementation status

## Done

- Monorepo, strict TypeScript, ESLint, Prettier, Vitest.
- Discord OAuth login with a signed httpOnly session cookie.
- Read-only REST sync of guild, roles, channels and overwrites, in one
  transaction, pruning entities deleted on Discord.
- Bitfield-native permission engine matching Discord's documented
  resolution order, for both roles and real members.
- Explorer: role and member selection, channel search and filters,
  collapsible categories, all permissions grouped by scope, and an ordered
  trace with the decisive step highlighted. Calculation runs in the
  browser, so selection is instant.
- Role-by-channel matrix with clickable cells.
- Single-member lookup (no privileged intent) and optional bulk member
  sync (needs Server Members intent).
- Ten audit rules, severity-ordered and filterable, each linking to the
  place that produced it.
- Snapshot history with comparison between any two snapshots.
- Snapshot export and import, validated and diffed into a change plan.
- Permission editing in the UI, producing masked-intent change plans that
  the server rebuilds and re-risk-assesses.
- Apply to Discord behind `ENABLE_DISCORD_WRITES`, with live re-validation,
  rate-limit handling, audit-log attribution, per-operation results and a
  verification pass for uncertain writes.
- Rollback as a generated plan restoring only the touched bits.
- Seven UI languages with English as the type-checked source.
- `/setup` diagnostics with per-check remediation and a bot invite link.

## Not done

- **Presets.** Named permission templates applied to a scope. Nothing has
  been built; the change-plan pipeline would carry them unchanged.
- **Playwright end-to-end coverage.** The engine has unit tests; the UI
  has none.
- **Scheduled or continuous sync.** Sync is manual and on demand.
- **Permission Manager role.** Write access is owner or Administrator.
  A configurable per-guild role remains open (see open-questions.md).
- **Per-bucket rate limiting.** A flat 250 ms spacing plus 429 retry is
  enough for plans of a few dozen operations.
