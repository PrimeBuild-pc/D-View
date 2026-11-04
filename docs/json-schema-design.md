# Snapshot format

Snapshots are the export/import unit and the substrate for history and
rollback. They must be readable by a human or an external tool, and
validated before anything acts on them.

## Version 2.0.0

The authoritative validator is `permissionSnapshotSchema` in
`packages/shared/src/index.ts`. This example uses synthetic IDs:

```json
{
  "schemaVersion": "2.0.0",
  "exportedAt": "2026-08-14T10:33:21.004Z",
  "guild": {
    "id": "120600000000000001",
    "name": "My Server",
    "ownerId": "884000000000000001",
    "everyoneRoleId": "120600000000000001"
  },
  "roles": [
    {
      "id": "120600000000000001",
      "name": "@everyone",
      "color": "#5865f2",
      "position": 0,
      "managed": false,
      "permissions": "1024"
    }
  ],
  "channels": [
    {
      "id": "120800000000000001",
      "name": "announcements",
      "type": 0,
      "position": 3,
      "overwrites": [
        { "targetType": "role", "targetId": "120600000000000001", "allow": "1024", "deny": "2048" }
      ]
    }
  ],
  "metadata": { "source": "discord-rest-sync" }
}
```

### Why bitfields, not names

Version 1.0.0 stored permission *names*. That format cannot represent a
permission Discord introduces later, and the table it was written against
had already dropped everything it did not recognise — so a name-based
export was lossy the moment it was written, and applying one stripped
real permissions off live roles.

`permissions`, `allow` and `deny` are therefore decimal strings, limited to
40 digits. Unknown permission bits are preserved within that limit. IDs contain
1–20 digits; roles, channels and overwrite targets must be unique, `@everyone`
must match the guild ID, and allow/deny masks cannot overlap.

**1.0.0 snapshots are rejected, not upgraded.** Reconstructing bits from
names would reintroduce exactly the loss that made them wrong. Re-sync.

### Channels

`type` is the raw Discord channel type number, so forum, stage, media,
announcement and thread channels survive. An earlier mapping collapsed
everything to three names and discarded the rest, which meant the audit
reported those servers as clean because it could not see the channels.
The guild-channels sync endpoint does not enumerate every thread; representing a
channel type in the schema does not imply complete thread collection or write support.

Categories are channels with `type: 4`. There is one `channels` array
rather than separate `categories` and `channels`; `parentId` expresses
the relationship.

## Import pipeline

An imported file is never applied directly:

1. Reject bodies over 8 MB.
2. Parse JSON; report syntax errors as such.
3. Reject a `schemaVersion` other than the current one, by name.
4. Validate against the zod schema, reporting the first twenty issues with paths.
5. Verify `guild.id` matches the selected guild.
6. Diff against the stored snapshot, producing **masked intents** covering
   only the bits that actually differ.
7. Recompute warnings server-side from the engine.
8. Present a readable diff with per-operation include/exclude.
9. Create a change plan — the server rebuilds every operation; nothing the
   client sent about what a change does, or how risky it is, is trusted.
10. Require the guild name as explicit confirmation before execution.
11. Snapshot before applying, apply, and store per-operation results.

## Conventions

- IDs are authoritative; names travel alongside them for review only.
- Bitfields are strings because JSON has no integer wide enough.
- Unknown metadata is preserved under `metadata` after validation.

## Readable map (for people and LLMs)

**Export readable map (for AI)** downloads `GET /api/guilds/{id}/snapshot?format=readable`:
the same snapshot as a tree of categories and channels, with role names and
permission names instead of IDs and bitfields. It starts with a `howToEdit` list,
so an LLM can be given the file plus a request such as "deny SendMessages to
@everyone in the whole INFO category except #feedback" and return an edited file.

```json
{
  "format": "d-view-readable",
  "formatVersion": 1,
  "roles": [{ "id": "…", "name": "Member", "permissions": ["ViewChannel", "SendMessages"] }],
  "channels": [{
    "id": "…", "name": "INFO", "type": "category",
    "overwrites": [{ "role": "@everyone", "allow": [], "deny": ["SendMessages"] }],
    "channels": [
      { "id": "…", "name": "rules", "type": "text", "syncedWithCategory": true },
      { "id": "…", "name": "feedback", "type": "text", "syncedWithCategory": false,
        "overwrites": [{ "role": "@everyone", "allow": ["SendMessages"], "deny": [] }] }
    ]
  }]
}
```

Importing it uses the normal **Import** page. `fromReadable` (in `@dpd/shared`)
rebuilds a full 2.0.0 snapshot on top of the current one, then the usual
validation, plan review and confirmation apply. Rules:

- Only permissions are imported; IDs must not change. Unknown role/channel IDs,
  unknown permission names, ambiguous role names and allow/deny overlaps are rejected.
- Roles or channels missing from the file are left unchanged.
- `"syncedWithCategory": true` copies the (edited) category overwrites to that channel.
- Permission bits without a name in this build are preserved from the live value.
