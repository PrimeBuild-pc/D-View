# Security Policy

## Reporting a vulnerability

If you find a security issue in D-View, please email
**lorenzomassafra18@gmail.com** with details and, if possible, steps to
reproduce. Do not open a public GitHub issue for security reports.

You should get a response within a few days. Please give a reasonable
amount of time to investigate and fix the issue before any public
disclosure.

## Scope

In scope:

- The web application under `apps/web` (authentication/session handling,
  authorization checks, API routes, and rendered pages).
- Shared packages under `packages/` that ship as part of this repository.

Out of scope:

- Discord's own platform, APIs, and infrastructure.
- Issues that require access to another operator's database or
  environment variables (each deployment is isolated — see below).
- Denial-of-service reports against a self-hosted instance you do not
  control.

## Deployment model

D-View is a **local-first, self-hosted** tool. There is no shared,
Anthropic- or maintainer-operated instance. Each operator:

- Registers their own Discord application and supplies their own Discord
  OAuth credentials and bot token.
- Runs and owns their own database.
- Generates and stores their own signing secret (`AUTH_SECRET`).

This means each deployment's data, credentials, and attack surface are
isolated to that operator. Security reports should focus on flaws in the
application code itself (e.g. broken authorization, injection, unsafe
defaults) rather than the security posture of any particular operator's
deployment.
