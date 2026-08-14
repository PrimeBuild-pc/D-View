<div align="center">
  <img src="assets/banner.png" alt="D-View — see who can actually do what on your Discord server, and change it safely" width="100%" />
  <p>
    <a href="https://github.com/PrimeBuild-pc/D-View/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/PrimeBuild-pc/D-View?style=for-the-badge&logo=github" /></a>
    <a href="https://github.com/PrimeBuild-pc/D-View/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/PrimeBuild-pc/D-View?style=for-the-badge&logo=github" /></a>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs" />
    <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" />
  </p>
</div>

---

## What it is

D-View is a **self-hosted** dashboard for Discord server owners and admins. You run your own copy, with your own bot — there is no hosted service and no third party ever sees your server's data.

It answers the questions Discord's own UI makes hard:

- **Who can see this channel, and why?** Not just yes or no — the exact ordered chain of rules that produced the answer, with the decisive step highlighted.
- **What can this specific person do?** Real resolution: the union of all their roles, owner and Administrator bypass, member-specific overwrites, timeout state.
- **What is risky right now?** Ten audit rules covering dangerous `@everyone` permissions, channels nobody can reach, public channels inside private categories, conflicting overwrites, and more.
- **What changed?** Every sync stores a snapshot. Compare any two and read the difference in plain language.
- **Can I fix it without breaking something?** Edit permissions in the UI, review a readable diff, apply it to Discord behind a confirmation proportional to the risk, and roll it back if you were wrong.

### Safety

Writing to Discord is **off by default**. When enabled, every change goes through a reviewable plan, and:

- Operations are rebuilt server-side from the snapshot. Nothing the browser claims about what a change does — including how risky it is — is trusted.
- A change carries a **mask** of exactly which permission bits it may alter. Everything else is copied from the live value, so a plan can never strip a permission it was not about.
- Live state is re-read immediately before each write. If someone changed it in the meantime, that operation is skipped and reported rather than silently overwritten.
- Applying continues past a failure and reports every operation as applied, skipped, failed or unknown. Anything unknown is verified afterwards by re-reading it.
- A snapshot is taken before applying, and rollback generates a **new reviewable plan** restoring only the bits that were touched.
- Changes appear in your Discord audit log attributed to the plan and the person who ran it.

---

## Quick start

You will need [Node.js](https://nodejs.org) (recent LTS), [pnpm](https://pnpm.io) via Corepack, and [Docker](https://docs.docker.com/get-docker/) for PostgreSQL.

### 1. Create a Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**. Use [`assets/icon.png`](assets/icon.png) as the app icon if you want the one in the screenshots.
2. Under **OAuth2**, copy the **Client ID** and **Client Secret**.
3. Still under **OAuth2**, add this redirect URL exactly:
   ```
   http://localhost:3000/api/auth/callback
   ```
4. Under **Bot**, click **Reset Token** and copy the token. Treat it like a password.
5. *(Optional)* Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent**. This is only needed to search the full member list; looking up one member by ID works without it.

### 2. Install and configure

```bash
git clone https://github.com/PrimeBuild-pc/D-View.git
cd D-View
corepack enable pnpm
pnpm install
cp .env.example .env
```

Fill in `.env`:

```bash
# Generate with: openssl rand -base64 32
AUTH_SECRET=

DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/discord_permission_dashboard

# Leave false until you actually intend to change permissions.
ENABLE_DISCORD_WRITES=false
```

### 3. Start the database and the app

```bash
docker compose up -d
pnpm --filter @dpd/database db:push
pnpm dev
```

Open <http://localhost:3000/setup>. Every prerequisite is checked there, and each failing check tells you how to fix it. The same page gives you an **invite link** for your bot with the right permissions.

### 4. Use it

1. Invite the bot to your server (link on `/setup`).
2. Sign in with Discord at <http://localhost:3000>.
3. Pick your server and press **Sync now** — this only reads.
4. Open **Explorer**, pick a role, pick a channel.

---

## Enabling writes

Only when you want to change permissions:

1. Set `ENABLE_DISCORD_WRITES=true` in `.env` and restart.
2. Make sure the bot's role sits **above** every role you intend to edit. Discord refuses otherwise, and a bot can only grant permissions it holds itself.
3. Edit permissions in the Explorer, review the plan, and confirm by typing your server's name.

Try it on a throwaway channel first. Never test on `@everyone`.

---

## Workspace

```
apps/web                      Next.js app: UI, API routes, Discord REST calls
packages/permission-engine    Pure permission resolution. No network, no database.
packages/shared               Snapshot types, zod schemas, Discord permission bits
packages/database             Prisma client and schema
assets                        Brand assets and the sources they are generated from
```

### Brand assets

| File | Use |
|---|---|
| `assets/icon.svg` | Source for the mark. Pure geometry, no text, so it renders identically everywhere. |
| `assets/icon.png` | 512×512 — upload this as the Discord application icon. |
| `assets/icon-128.png` | Small copy, if something wants a pre-scaled one. |
| `assets/banner.png` | The README header. |
| `assets/banner.html` | Source for the banner; screenshot it with headless Chrome to regenerate. |

The mark is the same shield the app uses in its own header, carrying an allowed
row and a denied row — what the product actually shows. Discord crops avatars to
a circle, so nothing sits near the corners, and the detail is deliberately coarse
because Discord renders it at 32px in member lists.

The permission engine is deliberately dependency-free and side-effect-free, which is what lets the exact same code run on the server and in your browser. That is why selecting a role or channel in the Explorer is instant rather than a page load.

`packages/permission-engine` carries the tests that matter: bitfield round-trips, Discord's overwrite ordering, owner and Administrator bypass, member resolution, and the guard that refuses any write reaching outside its mask.

```bash
pnpm test        # unit tests
pnpm typecheck   # strict TypeScript across the workspace
pnpm lint
pnpm build
```

---

## Language

The interface ships in English, Italian, German, French, Spanish, Chinese and Russian. Your choice is remembered in a cookie; first-time visitors get their browser's language when it is one of the seven.

English is the source of truth for the dictionary and the other locales are type-checked against it, so a missing translation fails the build rather than leaving a blank spot.

---

## Notes and limits

- **This is not a hosted service.** Each installation talks to Discord with its own credentials and stores data in its own database.
- **Discord does not expose members' country or language.** The `locale` field only exists for the signed-in user, never for members read through a bot, so D-View makes no attempt to guess where your members are from.
- **These endpoints have no ETag.** Live state is re-read immediately before each write to narrow the window, but a change made in the same instant can still be missed. D-View reports what it did rather than claiming the operation was atomic.
- **Snapshots from before the bitfield migration cannot be upgraded.** They stored permission *names* against a table that had already dropped what it did not recognise. Re-sync instead.

Security policy: [SECURITY.md](SECURITY.md). Licence: [MIT](LICENSE).
