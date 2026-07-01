<div align="center">
  <h1>D-View</h1>
  <p><strong>Discord permission visibility dashboard for safer server administration.</strong></p>
  <p>
    <a href="https://github.com/PrimeBuild-pc/D-View/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/PrimeBuild-pc/D-View?style=for-the-badge&logo=github" /></a>
    <a href="https://github.com/PrimeBuild-pc/D-View/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/PrimeBuild-pc/D-View?style=for-the-badge&logo=github" /></a>
    <a href="https://github.com/PrimeBuild-pc/D-View/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/PrimeBuild-pc/D-View?style=for-the-badge&logo=github" /></a>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs" />
    <img alt="pnpm" src="https://img.shields.io/badge/pnpm-11.9-F69220?style=for-the-badge&logo=pnpm&logoColor=white" />
  </p>
  <p>
    <a href="#features">Features</a> ·
    <a href="#quick-start">Quick Start</a> ·
    <a href="#workspace">Workspace</a> ·
    <a href="#safety-model">Safety Model</a>
  </p>
</div>

<hr />

<section id="overview">
  <h2>Overview</h2>
  <p>
    <strong>D-View</strong> is a local-first dashboard that reads Discord guild permission data,
    stores snapshots, explains effective role/channel permissions, and prepares safe reviewable
    change plans before any Discord mutation is allowed.
  </p>
  <p>
    The app is intentionally conservative: read-only sync is available now, while write execution
    is gated behind explicit configuration and confirmation.
  </p>
</section>

<section id="features">
  <h2>Features</h2>
  <ul>
    <li>Discord OAuth login with signed <code>httpOnly</code> session cookie.</li>
    <li>Guild filtering for owner or Administrator access.</li>
    <li>Read-only Discord REST sync for guild roles, channels, and permission overwrites.</li>
    <li>PostgreSQL persistence for guild entities, snapshots, audit findings, and change plans.</li>
    <li>Role-first permission dashboard with category/channel tree.</li>
    <li>Effective permission explanations for <code>ViewChannel</code> and <code>SendMessages</code>.</li>
    <li>Administrator bypass handling.</li>
    <li>Category, channel, role, and <code>@everyone</code> overwrite analysis.</li>
    <li>Audit findings for risky or unusual permission states.</li>
    <li>Snapshot JSON export endpoint.</li>
    <li>Import flow that diffs a candidate snapshot into a reviewable change plan.</li>
    <li>Discord write execution is disabled by default and requires reinforced confirmation.</li>
  </ul>
</section>

<section id="quick-start">
  <h2>Quick Start</h2>

  <h3>Prerequisites</h3>
  <ul>
    <li>Node.js recent LTS or newer</li>
    <li>pnpm via Corepack</li>
    <li>Docker for local PostgreSQL</li>
    <li>A Discord application with OAuth2 configured</li>
    <li>A Discord bot token for read-only guild sync</li>
  </ul>

  <h3>Install</h3>

  <pre><code>corepack enable pnpm
pnpm install
cp .env.example .env</code></pre>

  <h3>Configure environment</h3>
  <p>Fill these values in <code>.env</code>:</p>

  <pre><code>DATABASE_URL=postgresql://postgres:postgres@localhost:5432/discord_permission_dashboard
AUTH_SECRET=replace-with-a-long-random-secret
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_BOT_TOKEN=your-discord-bot-token
NEXTAUTH_URL=http://localhost:3000</code></pre>

  <p>Discord OAuth callback URL:</p>

  <pre><code>http://localhost:3000/api/auth/callback</code></pre>

  <h3>Database</h3>

  <pre><code>docker compose up -d postgres
pnpm --filter @dpd/database db:push</code></pre>

  <h3>Run</h3>

  <pre><code>pnpm dev</code></pre>

  <p>Open <a href="http://localhost:3000">http://localhost:3000</a>, log in, then open <code>/guilds</code>.</p>
</section>

<section id="common-commands">
  <h2>Common Commands</h2>

  <table>
    <thead>
      <tr>
        <th>Command</th>
        <th>Purpose</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>pnpm dev</code></td>
        <td>Start the Next.js web app.</td>
      </tr>
      <tr>
        <td><code>pnpm typecheck</code></td>
        <td>Run TypeScript checks across the workspace.</td>
      </tr>
      <tr>
        <td><code>pnpm test</code></td>
        <td>Run Vitest tests.</td>
      </tr>
      <tr>
        <td><code>pnpm lint</code></td>
        <td>Run ESLint.</td>
      </tr>
      <tr>
        <td><code>pnpm --filter @dpd/database db:push</code></td>
        <td>Apply Prisma schema to the local database.</td>
      </tr>
      <tr>
        <td><code>pnpm --filter @dpd/web build</code></td>
        <td>Build the web app.</td>
      </tr>
    </tbody>
  </table>
</section>

<section id="workspace">
  <h2>Workspace</h2>

  <pre><code>apps/web                  Next.js dashboard and API routes
packages/shared           Shared types, branded IDs, permission bits, Zod schemas
packages/permission-engine Pure permission calculation, diffing, and audit helpers
packages/database         Prisma schema and Prisma client export
docs/                     Product, architecture, security, and design notes</code></pre>
</section>

<section id="app-flow">
  <h2>App Flow</h2>

  <ol>
    <li>User logs in with Discord OAuth.</li>
    <li>The app stores a signed session cookie containing readable guilds.</li>
    <li>User selects a guild from <code>/guilds</code>.</li>
    <li>User runs read-only sync.</li>
    <li>The web API fetches Discord guild, role, and channel data through Discord REST.</li>
    <li>A normalized permission snapshot is stored in PostgreSQL.</li>
    <li>The dashboard loads the latest snapshot and explains effective permissions.</li>
    <li>Optional JSON import compares a candidate snapshot and creates a reviewable plan.</li>
  </ol>
</section>

<section id="routes">
  <h2>Important Routes</h2>

  <table>
    <thead>
      <tr>
        <th>Route</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>/guilds</code></td>
        <td>Readable Discord guild list.</td>
      </tr>
      <tr>
        <td><code>/guilds/[guildId]</code></td>
        <td>Main synced permission dashboard.</td>
      </tr>
      <tr>
        <td><code>/guilds/[guildId]/matrix</code></td>
        <td>Compact roles × channels matrix.</td>
      </tr>
      <tr>
        <td><code>/guilds/[guildId]/import</code></td>
        <td>Import JSON snapshot and generate a change plan.</td>
      </tr>
      <tr>
        <td><code>/changes</code></td>
        <td>Recent change plans.</td>
      </tr>
      <tr>
        <td><code>/api/guilds/[guildId]/sync</code></td>
        <td>Read-only Discord REST sync.</td>
      </tr>
      <tr>
        <td><code>/api/guilds/[guildId]/snapshot</code></td>
        <td>Download latest stored snapshot as JSON.</td>
      </tr>
    </tbody>
  </table>
</section>

<section id="safety-model">
  <h2>Safety Model</h2>

  <ul>
    <li>Read-only sync is the default operational mode.</li>
    <li>Discord writes require <code>ENABLE_DISCORD_WRITES=true</code>.</li>
    <li>Apply flow requires typing <code>APPLY</code>.</li>
    <li>A pre-apply snapshot is saved before execution.</li>
    <li>Risky changes such as <code>@everyone</code> or Administrator edits are flagged.</li>
    <li>Secrets belong in local <code>.env</code> files only; they are gitignored.</li>
  </ul>
</section>

<section id="checks">
  <h2>Verified Checks</h2>

  <pre><code>pnpm typecheck
pnpm test</code></pre>
</section>

<section id="status">
  <h2>Status</h2>

  <p>Works now:</p>
  <ul>
    <li>OAuth login</li>
    <li>Guild listing</li>
    <li>Read-only sync</li>
    <li>Snapshot storage and export</li>
    <li>Permission explanation dashboard</li>
    <li>Audit findings</li>
    <li>Import-to-plan flow</li>
  </ul>

  <p>Intentionally gated:</p>
  <ul>
    <li>Discord permission writes</li>
    <li>Rollback automation</li>
    <li>Background/continuous sync</li>
  </ul>
</section>

<hr />

<div align="center">
  <p><strong>D-View</strong> — understand Discord permissions before changing them.</p>
</div>
