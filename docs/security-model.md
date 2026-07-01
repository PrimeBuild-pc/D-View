# Security Model

## Threats
- Leaked Discord bot token or OAuth secret.
- Unauthorized dashboard access to guild permissions.
- Accidental broad exposure through `@everyone`.
- Accidental Administrator flag changes.
- Malicious or stale imported JSON.
- Partial Discord API failures during batch apply.
- Confusing UI causing unintended permission changes.

## Guardrails
- Secrets only through environment variables. `.env` is ignored.
- Read access: guild owner or Administrator.
- Write access: guild owner, Administrator, or configured Permission Manager role.
- Every write uses a persisted change plan, diff, warning list, and explicit confirmation.
- Reinforced confirmation for `@everyone` and Administrator flag changes.
- Member overwrites are read-only exceptions in v1.
- No channel/role create/delete/reorder in v1.
- Import validates schema, guild ID, object existence, and bot capabilities before planning.

## Audit and accountability
Every future execution records:
- Discord user;
- guild;
- timestamp;
- optional reason;
- diff;
- selected operations;
- result;
- errors.

## Rollback model
Before applying any batch, store a full previous snapshot. Rollback creates a new reviewed change plan from that snapshot. It does not blindly replay state without validation.

## Rate limits and partial failures
The bot apply layer will use ordered idempotent operations, retry/backoff for transient failures, and final reports that distinguish applied, skipped, failed, and unknown operations.

## First-slice security posture
The first slice uses local mock data only. It includes `.env.example`, typed interfaces, and placeholders for auth/write flows, but performs no real Discord auth or mutation.
