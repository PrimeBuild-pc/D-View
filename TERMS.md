# Terms of Service

**Last updated: 14 August 2026**

D-View is free, open-source, **self-hosted** software published under the
[MIT Licence](LICENSE). These terms cover using it.

---

## 1. What you are agreeing to

By running D-View, or by using an instance someone else runs, you accept these
terms. If you do not, do not run it.

There is no account to create with the project authors, no subscription, and no
service being sold. You install the software and it talks to Discord using
credentials you supply.

## 2. It is provided as-is

As stated in the MIT Licence: **the software is provided without warranty of any
kind.** The authors are not liable for any damage arising from its use.

This matters more than usual here, because D-View can modify real permissions on
a real Discord server. **You are responsible for the changes you apply.**

The software is built to make that responsibility manageable rather than
theoretical:

- Writing to Discord is disabled unless you explicitly set
  `ENABLE_DISCORD_WRITES=true`.
- Every change is reviewed as a plan before anything is sent.
- A change may only alter the permission bits it explicitly declares.
- Live state is re-checked immediately before each write, and conflicting
  operations are skipped rather than forced.
- A snapshot is stored before applying, and rollback plans can be generated from
  what was actually applied.

None of that removes your responsibility. Test on a channel you do not care
about before touching anything that matters.

## 3. Your obligations

- You must comply with the [Discord Terms of
  Service](https://discord.com/terms), the [Discord Developer Terms of
  Service](https://discord.com/developers/docs/policies-and-agreements/developer-terms-of-service),
  and Discord's [Developer
  Policy](https://discord.com/developers/docs/policies-and-agreements/developer-policy).
- Only use D-View on servers you own or administer, or where the owner has asked
  you to.
- Keep your bot token, OAuth client secret, and `AUTH_SECRET` private. Anyone
  holding them can act as your bot.
- Do not use D-View to gain or escalate access you were not granted.

## 4. Availability

There is no uptime commitment, because there is no hosted service. Your instance
runs when you run it.

Discord's API may change or become unavailable, which will affect the software.
The authors are under no obligation to keep it working.

## 5. If you run an instance for other people

You become the operator, and the responsibilities in the
[Privacy Policy](PRIVACY.md) become yours: you control the database, you handle
data requests, and you are the party those users are dealing with.

## 6. Changes

These terms may change. Changes are committed to this repository, and its history
is public.

## 7. Contact

**lorenzomassafra18@gmail.com** — or open an issue on
[GitHub](https://github.com/PrimeBuild-pc/D-View/issues).

Security reports: see [SECURITY.md](SECURITY.md).

---

*This document describes a self-hosted, non-commercial open-source tool. It is
not legal advice. If you operate an instance for others, have it reviewed.*
