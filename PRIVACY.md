# Privacy Policy

**Last updated: 14 August 2026**

D-View is **self-hosted software**. There is no service operated by the project
authors, no shared database, and no server that collects anything. Each person
who runs D-View runs their own copy, connected to their own Discord application
and their own database.

This policy describes what the software processes when you run it. If you are
running your own instance, you are the operator, and this policy describes what
*your* instance does with *your* data.

---

## 1. Who is responsible

The operator of the instance you are using. For the instance run by the author of
this repository, that is Lorenzo Massafra, reachable at
**lorenzomassafra18@gmail.com**.

The project authors have no access to any instance they do not personally run.

## 2. What the software processes

**When you sign in with Discord (OAuth `identify` and `guilds` scopes):**

- Your Discord user ID, username, and avatar hash
- The list of servers you belong to, with your permission integer in each

This is stored in a **signed cookie in your own browser** for up to 7 days. It is
not written to the database. The OAuth access token is discarded immediately
after the sign-in exchange and never stored.

**When a server is synced (read through the bot):**

- Server ID, name, and owner ID
- Roles: ID, name, colour, position, and permission bitfield
- Channels and categories: ID, name, type, position, parent, and permission overwrites
- A timestamped snapshot of all of the above

**Only if the operator explicitly runs a member sync** (which requires enabling
the Server Members privileged intent):

- For each member: user ID, username, display name, nickname, avatar hash, role
  IDs, join date, pending state, and timeout expiry

**When a permission change is applied:**

- The change plan, who created it, the stated reason, and the result of each
  operation, including the values read from Discord immediately before the write

## 3. What the software does not process

- **Message content.** D-View never reads messages. It does not request the
  Message Content intent.
- **Location or language of members.** Discord does not expose this to bots, and
  D-View makes no attempt to infer it.
- **Email addresses.** The OAuth `email` scope is never requested.
- **Analytics, telemetry, tracking, advertising.** There is none, of any kind.

## 4. Where data goes

Nowhere except your own database and Discord's own API.

There are no third-party services, no external logging, no CDNs receiving your
data. The only outbound network requests the application makes are to
`discord.com`, using your own bot token and OAuth credentials.

## 5. Retention

Data stays in the operator's database until they delete it. Note that a snapshot
is written on every sync and before every applied change, so these accumulate;
nothing prunes them automatically.

To delete everything, drop the database (`docker compose down -v`).

To end your own session, sign out — this clears the cookie.

## 6. Discord

Your use of Discord is governed by [Discord's Privacy
Policy](https://discord.com/privacy). D-View reads data Discord already holds
about your server, through Discord's official API, using credentials you supply.

## 7. Your rights

Because the data lives in an operator's own database, requests for access,
correction, or deletion go to that operator. If you run the instance yourself,
you already have full access via the database.

## 8. Changes

Changes to this policy will be committed to this repository, and its history is
public.

---

*This document describes the software's actual behaviour, verified against the
source in this repository. It is not legal advice. If you operate an instance
serving other people, particularly across jurisdictions, have it reviewed.*
