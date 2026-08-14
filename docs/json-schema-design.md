# Snapshot format

Snapshots are the export/import unit and the substrate for history and
rollback. They must be readable by a human or an external tool, and
validated before anything acts on them.

## Version 2.0.0

```json
{
  "schemaVersion": "2.0.0",
  "exportedAt": "2026-08-14T10:33:21.004Z",
  "guild": {
    "id": "1206...",
    "name": "My Server",
    "ownerId": "884...",
    "everyoneRoleId": "1206..."
  },
  "roles": [
    {
      "id": "1207...",
      "name": "Moderator",
      "color": "#5865f2",
      "position": 10,
      "managed": false,
      "permissions": "8598323264"
    }
  ],
  "channels": [
    {
      "id": "1208...",
      "name": "announcements",
      "type": 0,
      "parentId": "1209...",
      "position": 3,
      "overwrites": [
        { "targetType": "role", "targetId": "1206...", "allow": "1024", "deny": "2048" }
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

`permissions`, `allow` and `deny` are therefore decimal strings validated
by `/^\d+$/` and nothing more. An unknown future bit round-trips through
export and import untouched.

**1.0.0 snapshots are rejected, not upgraded.** Reconstructing bits from
names would reintroduce exactly the loss that made them wrong. Re-sync.

### Channels

`type` is the raw Discord channel type number, so forum, stage, media,
announcement and thread channels survive. An earlier mapping collapsed
everything to three names and discarded the rest, which meant the audit
reported those servers as clean because it could not see the channels.

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
10. Require confirmation proportional to the risk.
11. Snapshot before applying, apply, and store per-operation results.

## Conventions

- IDs are authoritative; names travel alongside them for review only.
- Bitfields are strings because JSON has no integer wide enough.
- Unknown metadata is preserved under `metadata` after validation.
