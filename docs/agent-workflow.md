# AI-agent workflow

D-View has **no built-in agent, LLM runtime or MCP server**. An external coding
agent can help install/audit or operate the ordinary authenticated dashboard;
its provider may charge separately. No model download is required by D-View.

## Installation assistance

1. Read [the installation guide](../README.md#quick-start) and
   [operations guide](self-hosting.md). Inspect the target and propose a plan.
2. The user creates the Discord application, enters secrets into local `.env`,
   sets the canonical `APP_URL`/OAuth redirect and installs the bot. Secrets stay
   with the user, not in chat, code, tool output or an agent's context.
3. Ask explicit consent before changing live configuration, running Compose,
   deploying/restarting services or pushing schema changes. Identify which host,
   Compose project/volume and release the command affects, including downtime.
4. Verify config using a **temporary fake env file** if consent is only for offline
   checks. `node --test tests/infra.test.mjs` does this without a daemon or live
   service. A successful config check does not prove runtime startup.
5. Have the user verify startup and complete Discord OAuth in the browser. An
   agent may inspect the resulting authenticated UI only with their permission.

An existing browser-automation tool can drive that user-approved session. It is
not a D-View MCP integration and does not grant extra access. Prefer visible UI
review over extracting cookies into scripts.

## Audit first

With consent for the selected guild, use the UI to sync and inspect Explorer,
Matrix, Audit and History. Sync reads Discord but persists local cache/snapshots;
state this effect. Snapshot exports contain guild/member data: ask before saving
or sending them outside the instance. A read-only audit does not authorize writes,
bot permission escalation, unlocking Settings or changing `.env`.

## Optional existing API access

If automation is necessary, use the existing Next API routes **as the same
OAuth-authenticated owner/Administrator**. All state-changing routes use `POST`
and require both a valid session cookie and an `Origin` exactly equal to
`APP_URL`. A Discord bot token alone is not dashboard authentication. In an
approved browser session, same-origin fetch sends httpOnly cookies without
revealing them. For example, after the user agrees to a read-only sync of the
specific guild, execute in that dashboard tab:

```js
// Replace with the user-approved server ID; use the tab at the canonical APP_URL.
const guildId = 'YOUR_GUILD_ID';
const response = await fetch(`/api/guilds/${guildId}/sync`, {
  method: 'POST',
  credentials: 'same-origin',
});
// Redirect status is encoded in the resulting URL (sync=ok/failed/etc.).
console.log(response.url);
```

The browser supplies Origin. For an approved non-browser HTTP client, the user
must supply a legitimate session through their local secure mechanism and set
`Origin: <APP_URL>`; do not paste cookies into chat/command history. Never forge a
session from `AUTH_SECRET`, add a bypass route, change Origin checks, use GET for
mutations, mutate database rows directly or issue bot-token Discord writes outside
the review pipeline.

Useful existing routes (not a new public API contract):

| Route suffix under `/api/guilds/{guildId}` | Behavior                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /snapshot`                            | Authenticated snapshot export.                                              |
| `POST /sync`                               | Read Discord and persist cache/snapshot; redirects to guild page.           |
| `POST /plans`                              | JSON edits validated against a snapshot; returns `planId` and warnings.     |
| `POST /import`                             | Validated snapshot import creates a reviewable plan.                        |
| `POST /writes`                             | Form-based write policy/unlock controls; configuration locks still apply.   |
| `POST /plans/{planId}/execute`             | Form body with `confirm` equal to the guild name; requires unlocked writes. |
| `POST /plans/{planId}/rollback`            | Generates a new rollback plan, not a Discord write.                         |

Before preparing payloads, read the route and schemas in `apps/web/src/lib/plans.ts`
rather than guessing operations or reusing an old schema. The UI is the simplest
way to preserve validation, confirmations and operation selection.

## Live-change consent and reporting

1. Present the **specific guild, role/channel IDs, intended bits, diff, warnings
   and plan ID**. Distinguish drafting/local storage from applying to Discord.
2. Obtain explicit consent for the proposed apply and any prerequisite unlock,
   bot permission grant or configuration change. A broad “fix permissions” request
   is not permission to grant Administrator or unlock everything.
3. Let the user complete the normal confirmation, or automate it only when they
   expressly approve that exact plan. Do not silently switch temporary to
   persistent unlock or set `DISCORD_WRITES_ALWAYS=true`.
4. Inspect each result. Report applied, skipped, failed and unknown outcomes;
   uncertain writes may have landed. Do not blindly repeat a timeout/failure.
5. Lock writes after the approved task if that action was agreed. Rollback needs
   a fresh reviewed plan and fresh consent to apply; a backup restore does not
   undo Discord writes.

For a deployment/restore/config change, similarly report target host/project,
commands, downtime/data implications, verification performed and remaining risks.
Keep credentials redacted and separate from reports. If access, consent or a
safe test environment is missing, hand the relevant steps to the user.
