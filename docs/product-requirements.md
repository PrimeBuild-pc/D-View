# Discord Permission Dashboard — Product Requirements

## Scope
A Discord bot plus web dashboard for server administrators to inspect, audit, and eventually modify role permissions and role permission overwrites on categories/channels.

## First-version goals
- Read guilds, roles, categories, text channels, voice channels, role overwrites, member overwrites as read-only exceptions, global role permissions, and Administrator flag.
- Dashboard login via Discord OAuth in a future milestone; first slice uses local mock authentication/configuration.
- Role-first dashboard: select a role and inspect effective access through a guild → category → channel tree.
- Show badges: visible, hidden, read-only, can write, voice access, inherited, channel override, Administrator bypass, member exception.
- Secondary matrix roles x channels is planned, virtualized later.
- Initial scale target: ~50 roles, ~100 channels.

## Base permissions
Base view covers:
- ViewChannel
- SendMessages
- ReadMessageHistory
- AddReactions
- CreatePublicThreads
- CreatePrivateThreads
- SendMessagesInThreads
- Connect
- Speak
- ManageMessages
- ManageThreads
- MentionEveryone
- ManageChannels

Advanced mode will expose all Discord permissions grouped by category.

## Modification model
No direct mutation from chat or text request. Every change must become a change plan with:
- proposed operations;
- per-operation include/exclude;
- before/after diff;
- warnings;
- one explicit batch confirmation;
- final report.

## Explicitly out of scope for v1
- Member-specific overwrite management. Detect and warn only.
- Channel creation/deletion/rename.
- Role creation/deletion/reordering.
- Member, webhook, integration, or server-general setting changes.
- Real Discord OAuth, real bot sync, real mutation, real rollback in the first vertical slice.

## High-risk rules
- `@everyone` is visible and modifiable later, but requires reinforced confirmation.
- Administrator must show clear warnings and bypass behavior in simulation.
- Direct Administrator flag edits require block or reinforced confirmation.
- Category/channel sync is never automatic.

## Audit severities
- Info
- Warning
- Critical

Planned rules include non-synced channels, redundant overwrites, private categories with public channels, no non-admin access, public read-only channels, Administrator roles, conflicting overwrites, too many overwrites, member exceptions, and unexpected differences between similar channels.
