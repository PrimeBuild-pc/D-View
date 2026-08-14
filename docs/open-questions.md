# Open questions

1. Should write access be grantable through a configurable per-guild
   "Permission Manager" role, or stay owner/Administrator only? Today it
   is owner or Administrator, via `canWriteGuild`, kept deliberately
   separate from `canReadGuild` so loosening reads cannot loosen writes.

2. How long should snapshots and execution history be retained? Every
   sync and every apply writes one, and nothing prunes them.

3. Should presets be per-guild or shareable across servers, given that
   role and channel IDs are guild-specific?

4. Should the member view offer a hypothetical mode — "what would this
   person see if we gave them role X"?

5. Is a flat 250 ms inter-write delay enough, or should the client track
   per-bucket rate-limit headers? Only matters for plans well beyond a
   few dozen operations.

## Answered

- **Which OAuth scopes?** `identify` and `guilds`. Bot permissions are
  separate and requested at invite time.
- **What is the reinforced confirmation UX?** Typing the server's name,
  not a fixed word, with the button disabled until it matches. It forces
  the operator to look at what they are pointing at.
- **Should imports allow deleting missing overwrites?** Yes, as an
  explicit `delete-channel-overwrite` operation that is visible in the
  diff and individually excludable.
- **Which permissions belong in advanced mode?** None — there is no
  advanced mode. All permissions are shown, grouped by scope, with the
  ones that are off hidden behind a toggle.
- **What hosting target?** Self-hosted only. Each operator runs their own
  instance with their own credentials.
