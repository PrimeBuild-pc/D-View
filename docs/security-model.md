# Security model

## Trust boundaries

- Discord OAuth uses `identify` and `guilds`, state validation and the canonical
  `APP_URL` redirect. HTTP is permitted only on loopback; other origins need HTTPS.
- Session cookies encrypt the OAuth bearer token with AES-GCM using `AUTH_SECRET`
  (minimum 32 characters). They are httpOnly, SameSite=Lax, Secure over HTTPS and
  expire within seven days/OAuth expiry. Rotate the secret to invalidate them.
- Guild access requires a valid session and live Discord owner/Administrator
  membership. Read and write access currently use that same policy; there is no
  configurable Permission Manager role. Bot membership alone grants no UI access.
- State-changing API routes require `POST` and the exact canonical Origin;
  payload sizes, schema, guild/object ownership and IDs are validated server-side.
- Anonymous `/setup` exposes configuration readiness, not authenticated bot/DB
  probes. Those checks run after login.
- Runtime credentials stay server-side. `.env` and `.verification` are excluded
  from image builds; the operator must protect secrets, backups and Docker access.

## Discord-write guards

The supplied Compose/example configuration sets `DISCORD_WRITES_LOCKED=true`.
When the operator deliberately removes the lock, Settings offers per-guild
60-minute windows or persistent unlock. `DISCORD_WRITES_ALWAYS=true` bypasses
that unlock; the global lock takes precedence. See [operator instructions](self-hosting.md#optional-discord-writes).

Every apply uses a persisted plan with a server-rebuilt masked intent, diff,
warnings and explicit server-name confirmation. Live state, authorization,
write lock and execution status are checked before writes. The mask preserves
bits outside the proposed change. Drift is skipped rather than overwritten.
Plans are serialized per guild; role hierarchy/managed-role rules and Discord
permissions still constrain the bot. No role/channel create/delete/reorder exists.

Snapshot imports validate version, guild, object existence, target types and bot
capability. Supported member overwrite edits also validate membership; snapshots
are untrusted input, not authority to bypass write checks.

## Accountability, interruption and rollback

Executions record the plan/actor, timestamps, selected operations, observed
before/after values (including overwrite existence), per-operation outcomes and
errors. Discord audit reasons include plan and actor IDs. A live pre-apply
snapshot is stored. Potential writes are recorded before sending so process
interruption leaves evidence; stale executions are recovered conservatively.

Results distinguish applied, skipped-noop, skipped-conflict, failed and unknown.
Only safe reads are automatically retried; mutations are not blindly replayed
on rate limits or ambiguous 5xx responses. Unknown outcomes are re-read when
possible. Global rate limits stop remaining operations; execution has a deadline.

Rollback generates a **new reviewable plan** from operations known to have landed,
restoring only touched bits and respecting existence where recorded. Legacy
results without existence tracking cannot distinguish an absent overwrite from
an explicit zero-valued one. Review rollback diffs carefully. A restored DB can
contain stale plans and does not reverse changes made on Discord.

## Remaining risks

Discord does not provide an atomic compare-and-swap for these edits. A concurrent
change between a live read and write can still race. Large plans, network failure
or process termination can leave partial results. Review outcomes and live state;
never claim an all-or-nothing apply or automatically replay unknown operations.
History has no automatic retention cleanup. Host/TLS security and backup handling
are the operator's responsibility, not guaranteed by container configuration.

[Operations, backups and restores](self-hosting.md) ·
[Agent consent and authenticated access](agent-workflow.md) ·
[Report vulnerabilities](../SECURITY.md)
