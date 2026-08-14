<div align="center">

<img src="assets/banner.png" alt="D-View — see who can actually do what on your Discord server, and change it safely" width="100%" />

<br />

[![Stars](https://img.shields.io/github/stars/PrimeBuild-pc/D-View?style=for-the-badge&logo=github&color=5865F2&labelColor=0b1120)](https://github.com/PrimeBuild-pc/D-View/stargazers)
[![Issues](https://img.shields.io/github/issues/PrimeBuild-pc/D-View?style=for-the-badge&logo=github&color=5865F2&labelColor=0b1120)](https://github.com/PrimeBuild-pc/D-View/issues)
[![Last commit](https://img.shields.io/github/last-commit/PrimeBuild-pc/D-View?style=for-the-badge&logo=git&logoColor=white&color=5865F2&labelColor=0b1120)](https://github.com/PrimeBuild-pc/D-View/commits/main)
[![Licence](https://img.shields.io/badge/licence-MIT-2dd4a7?style=for-the-badge&labelColor=0b1120)](LICENSE)

![Self-hosted](https://img.shields.io/badge/self--hosted-no%20cloud%2C%20no%20tracking-2dd4a7?style=for-the-badge&labelColor=0b1120)
![Permissions](https://img.shields.io/badge/permissions-all%2053-5865F2?style=for-the-badge&labelColor=0b1120)
![Languages](https://img.shields.io/badge/UI-7%20languages-5865F2?style=for-the-badge&labelColor=0b1120)
![Writes](https://img.shields.io/badge/writes-off%20by%20default-ff6b81?style=for-the-badge&labelColor=0b1120)

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=0b1120)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs&labelColor=0b1120)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black&labelColor=0b1120)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white&labelColor=0b1120)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=flat-square&logo=prisma&logoColor=white&labelColor=0b1120)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white&labelColor=0b1120)
![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?style=flat-square&logo=pnpm&logoColor=white&labelColor=0b1120)
![Vitest](https://img.shields.io/badge/Vitest-30%20tests-6E9F18?style=flat-square&logo=vitest&logoColor=white&labelColor=0b1120)

**[Quick start](#-quick-start) · [What it does](#-what-it-does) · [Safety](#-safety-model) · [Languages](#-languages) · [Workspace](#-workspace) · [Limits](#-notes-and-limits)**

</div>

---

## 🔍 What it does

D-View is a **self-hosted** dashboard for Discord server owners and admins. You run
your own copy, with your own bot. There is no hosted service, no account to create,
and no third party that ever sees your server's data.

It answers the questions Discord's own interface makes hard:

| Question | What D-View shows |
|---|---|
| **Who can see this channel, and why?** | Not just yes or no — the ordered chain of rules that produced the answer, with the decisive step highlighted. |
| **What can *this person* actually do?** | Real resolution: the union of all their roles, owner and Administrator bypass, member-specific overwrites, and timeout state. |
| **What is risky right now?** | Ten audit rules: dangerous `@everyone` permissions, channels nobody can reach, public channels inside private categories, conflicting overwrites, and more. |
| **What changed?** | Every sync stores a snapshot. Compare any two and read the difference in plain language. |
| **Can I fix it without breaking something?** | Edit in the UI, review a readable diff, apply behind a confirmation proportional to the risk, and roll it back if you were wrong. |

<details>
<summary><b>Why not just use Discord's own permission screen?</b></summary>

<br />

Discord shows you the overwrites on one channel. It does not tell you the
*result*, and it certainly does not tell you *why* the result is what it is.

Three things in particular are easy to get wrong, and D-View gets them right:

- **Categories are not inheritance.** Discord's resolution never consults a
  channel's parent. Syncing copies overwrites onto the child at edit time, which
  is precisely why a channel can drift out of sync — and why reasoning from the
  category gives wrong answers for every channel that has.
- **A role's own permissions are not the whole story.** Resolution always starts
  from `@everyone` and unions the rest on top. A role with nothing set still
  inherits everything `@everyone` has.
- **Conflicting roles do not resolve in order.** Discord collects *every* deny,
  applies them, then collects every allow. Applying them role by role gives a
  different answer whenever two roles disagree.

</details>

---

## ⚡ Quick start

**Prerequisites** — [Node.js](https://nodejs.org) (recent LTS),
[pnpm](https://pnpm.io) via Corepack, [Docker](https://docs.docker.com/get-docker/)
for PostgreSQL.

### 1 · Create a Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**. Use [`assets/icon.png`](assets/icon.png) as the app icon if you want the one from this repo.
2. **OAuth2** → copy the **Client ID** and **Client Secret**.
3. **OAuth2** → add this redirect URL, exactly:
   ```
   http://localhost:3000/api/auth/callback
   ```
4. **Bot** → **Reset Token**, and copy it. Treat it like a password.
5. *Optional* — **Bot → Privileged Gateway Intents** → enable **Server Members Intent**. Only needed to search the full member list; single-member lookup works without it.

### 2 · Install

```bash
git clone https://github.com/PrimeBuild-pc/D-View.git
cd D-View
corepack enable pnpm
pnpm install
cp .env.example .env
```

Fill in `.env`:

```bash
AUTH_SECRET=              # openssl rand -base64 32
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/discord_permission_dashboard
ENABLE_DISCORD_WRITES=false
```

### 3 · Run

```bash
docker compose up -d
pnpm --filter @dpd/database db:push
pnpm dev
```

Open **<http://localhost:3000/setup>**. Every prerequisite is checked there, and
each failing check tells you exactly how to fix it. That page also generates the
**bot invite link** with the right permissions.

### 4 · Use it

1. Invite the bot (link on `/setup`).
2. Sign in with Discord.
3. Pick your server → **Sync now**. This only reads.
4. Open **Explorer**, pick a role, pick a channel.

---

## 🛡 Safety model

Writing to Discord is **off by default**. When you enable it, every change goes
through a reviewable plan:

| Guard | What it prevents |
|---|---|
| **Operations rebuilt server-side** | The browser cannot claim what a change does, or how risky it is. Nothing it sends is trusted. |
| **Masked intents** | A change declares exactly which permission bits it may touch. Everything else is copied from the live value, so a plan can never strip a permission it was not about. |
| **Live re-read before each write** | If someone changed it in the meantime, that operation is skipped and reported rather than silently overwritten. |
| **Continue-on-error** | Applying reports every operation as applied, skipped, failed or unknown. Anything unknown is verified afterwards by re-reading it. |
| **Pre-apply snapshot + rollback** | Rollback generates a *new reviewable plan* restoring only the bits that were touched — not a blind restore that would clobber concurrent edits. |
| **Audit-log attribution** | Changes appear in your Discord audit log, tied to the plan and the person who ran it. |
| **Proportional confirmation** | Risky changes require typing your server's name, so you have to look at what you are pointing at. |

To actually change something:

```bash
ENABLE_DISCORD_WRITES=true   # in .env, then restart
```

The bot's role must sit **above** every role you intend to edit — Discord refuses
otherwise, and a bot can only grant permissions it holds itself.

> [!WARNING]
> Test on a throwaway channel first. Never test on `@everyone`.

---

## 🌍 Languages

<div align="center">

🇬🇧 English · 🇮🇹 Italiano · 🇩🇪 Deutsch · 🇫🇷 Français · 🇪🇸 Español · 🇨🇳 中文 · 🇷🇺 Русский

</div>

Your choice is remembered in a cookie, and first-time visitors get their browser's
language when it is one of the seven.

English is the source of truth and the other locales are type-checked against it,
so a missing translation **fails the build** rather than leaving a blank patch of
interface. The permission engine emits message codes rather than prose, which is
what makes the explanation trace and the audit list translatable at all.

---

## 🧱 Workspace

```
apps/web                      Next.js app: UI, API routes, Discord REST calls
packages/permission-engine    Pure permission resolution. No network, no database.
packages/shared               Snapshot types, zod schemas, Discord permission bits
packages/database             Prisma client and schema
assets                        Brand assets and the sources they are generated from
```

The permission engine is deliberately dependency-free and side-effect-free. That
is not stylistic: it is what lets the identical code run on the server and in your
browser, which is why selecting a role or channel is instant rather than a page
load.

```bash
pnpm test        # 30 unit tests, concentrated where correctness matters
pnpm typecheck   # strict TypeScript across the workspace
pnpm lint
pnpm build
```

The tests cover bitfield round-trips, Discord's exact overwrite ordering, owner
and Administrator bypass, member resolution, and the guard that refuses any write
reaching outside its mask.

<details>
<summary><b>Brand assets</b></summary>

<br />

| File | Use |
|---|---|
| `assets/icon.svg` | Source for the mark. Pure geometry, no text, so it rasterises identically everywhere. |
| `assets/icon.png` | 512×512 — upload as the Discord application icon. |
| `assets/icon-128.png` | Pre-scaled copy. |
| `assets/banner.png` | This README's header. |
| `assets/banner.html` | Banner source; screenshot with headless Chrome to regenerate. |

The mark is the same shield the app uses in its own header, carrying an allowed
row and a denied row — what the product actually shows. Discord crops avatars to
a circle, so nothing sits near the corners, and the detail is deliberately coarse
because Discord renders it at 32px in member lists.

</details>

---

## 📋 Notes and limits

- **This is not a hosted service.** Each installation talks to Discord with its own credentials and stores data in its own database.
- **Discord does not expose members' country or language.** The `locale` field exists only for the signed-in user, never for members read through a bot, so D-View makes no attempt to guess.
- **These endpoints have no ETag.** Live state is re-read immediately before each write to narrow the window, but a change made in the same instant can still be missed. D-View reports what it did rather than claiming atomicity.
- **Snapshots from before the bitfield migration cannot be upgraded.** They stored permission *names* against a table that had already dropped what it did not recognise. Re-sync instead.
- **Verification is not required** to run this. Discord only requires it past 100 servers, and a self-hosted bot lives in your own.

---

<div align="center">

[Security policy](SECURITY.md) · [Terms](TERMS.md) · [Privacy](PRIVACY.md) · [MIT Licence](LICENSE)

<sub>Built for people who administer Discord servers and would like to know what their permissions actually do.</sub>

</div>
