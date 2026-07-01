# JSON Snapshot and Import Design

## Snapshot goals
The snapshot must be readable by humans and external AI tools, while still validated before import.

## Top-level shape
```json
{
  "schemaVersion": "1.0.0",
  "exportedAt": "2026-07-01T00:00:00.000Z",
  "guild": { "id": "...", "name": "...", "everyoneRoleId": "..." },
  "roles": [],
  "categories": [],
  "channels": [],
  "metadata": { "source": "discord-permission-dashboard" }
}
```

## Role shape
```json
{
  "id": "role-id",
  "name": "Moderator",
  "color": "#5865F2",
  "position": 10,
  "managed": false,
  "permissions": ["ViewChannel", "ManageMessages"]
}
```

## Channel/category shape
```json
{
  "id": "channel-id",
  "name": "announcements",
  "type": "text",
  "parentId": "category-id",
  "overwrites": [
    { "targetType": "role", "targetId": "role-id", "allow": ["ViewChannel"], "deny": ["SendMessages"] }
  ],
  "memberOverwriteMetadata": [
    { "userId": "user-id", "allow": [], "deny": ["ViewChannel"], "readonly": true }
  ]
}
```

## Import pipeline
Imported JSON is never applied directly. Required pipeline:
1. Validate schema version and Zod schema.
2. Verify `guild.id` matches selected guild.
3. Verify all role and channel IDs exist.
4. Verify bot has required permissions and role hierarchy.
5. Compute diff against current snapshot.
6. Simulate impact and warnings.
7. Create a change plan.
8. Require manual approval.
9. Create backup snapshot.
10. Apply idempotent batch.
11. Store execution report.

## Change plan operations
Initial operation kinds:
- `set-role-permissions`
- `set-role-channel-overwrite`
- `delete-role-channel-overwrite`

Member overwrite operation kinds are intentionally absent in v1.

## Readability conventions
- Use Discord permission names, not numeric bitfields, in exported JSON.
- Include names alongside IDs for review, but IDs are authoritative.
- Preserve unknown future metadata under a versioned `metadata` object only after validation rules allow it.
