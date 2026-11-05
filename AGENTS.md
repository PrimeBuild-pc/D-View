# D-View agent rules

## Scope and trust

- Read the relevant code and `package.json` before editing. Keep the pnpm workspace
  boundaries in [docs/architecture.md](docs/architecture.md); permission calculation
  stays pure in `packages/permission-engine`, not API/UI code.
- Treat repository tests as offline checks. Leave `.env`, credentials, OAuth login
  and secret rotation to the user. Use a sanitized copy and dummy credentials;
  `DPD_ENV_FILE` selects a safe file for root app scripts. Compose needs its own
  explicit `--env-file` when testing config. Never print resolved secret config.
- Preserve other workers' uncommitted edits. Do not delete volumes or add Prisma
  destructive flags to make a check pass.

## Consent

Before touching a live instance, read [docs/agent-workflow.md](docs/agent-workflow.md).
Obtain explicit user consent for each live Discord apply/rollback, deployment,
service restart, database/schema/restore operation, and configuration or permission
change. State the target instance/guild, exact actions and risks first. Approval
for an audit or code edit is not approval for these operations. Have the user
enter secrets and perform OAuth authentication; never request tokens in chat.

## Workflow pointers

- **Install, Docker, env, update, backup, restore or schema:** read
  [docs/self-hosting.md](docs/self-hosting.md) before proposing commands. Finish by
  reporting schema/volume compatibility and what was actually tested.
- **Inspect or operate a dashboard:** use the authenticated browser or existing
  API with the user's session and canonical Origin, following
  [docs/agent-workflow.md](docs/agent-workflow.md). There is no D-View MCP endpoint;
  never manufacture sessions, disable authorization/CSRF or write directly to
  Discord/DB as a shortcut.
- **Auth, imports, permissions or execution:** read
  [docs/security-model.md](docs/security-model.md) and relevant route validation;
  preserve server-side rebuilding, fresh authorization and masked writes.

## Completion

Use the root test/typecheck/lint/build scripts for affected application code and
`node --test tests/infra.test.mjs` for infrastructure. Use installed dependencies;
no model downloads or runtime AI integrations are needed. Report exact commands,
results/skips, changed paths and remaining risks. Offline config checks are not a
Docker startup, OAuth or live-write test.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
