# Permission Engine Design

## Goals
The permission engine is pure, deterministic, and independent from Discord APIs. It receives normalized guild state and returns effective permissions with explanation traces.

## Input model
- Guild with `guildId`, `everyoneRoleId`, roles, categories, and channels.
- Role with global permissions and position metadata.
- Channel/category with overwrites.
- Overwrite target type is `role` or `member`; member overwrites are metadata-only in v1.

## Calculation order for a selected role
For each channel and permission:
1. Start with global role permissions.
2. If the role has `Administrator`, return allowed with `administrator-bypass` explanation.
3. Apply category overwrites, if the channel has a parent category:
   - apply `@everyone` role deny/allow;
   - apply selected role deny/allow.
4. Apply channel overwrites if present:
   - apply `@everyone` role deny/allow;
   - apply selected role deny/allow.
5. Channel overwrites are reported as specific when they differ from category overwrites.
6. Member overwrites are not applied for the role result. They are surfaced as read-only exceptions/warnings.

## Explanation shape
Each calculated permission returns:
- permission name;
- final allowed boolean;
- source: global role, category overwrite, channel overwrite, inherited, administrator bypass;
- ordered trace entries with before/after and reason.

## Initial exposed API
- `calculateChannelPermissions(snapshot, roleId, channelId)`
- `calculateGuildTree(snapshot, roleId)`
- `auditSnapshot(snapshot)`

## Important Discord nuance
Discord combines all roles for a member in reality. This dashboard's first primary view is role-centric: it answers “what does this role grant or deny in isolation?” Future member simulation can combine multiple roles.

## Sync semantics
A channel is considered inherited/synced for UI purposes when its role overwrites match the parent category overwrites for the inspected role and `@everyone`. It is not assumed desirable.

## Test cases
- Global allow with no overwrites.
- Category denies `@everyone` ViewChannel.
- Category denies and role allows ViewChannel.
- Channel override differs from category.
- Administrator bypass.
- Member overwrite present creates warning but does not change role result.
