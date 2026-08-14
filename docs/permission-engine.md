# Permission engine

Pure functions over a normalised snapshot. No network, no database, no
filesystem — which is what allows the same code to run on the server and
in the browser.

## Resolution order

Verified against Discord's documented `compute_base_permissions` and
`compute_overwrites`.

```
0.  owner                        -> KNOWN_BITS, stop
1.  perms  = @everyone role permissions
2.  perms |= union of the subject's other role permissions
3.  ADMINISTRATOR set             -> KNOWN_BITS, stop
4.  @everyone channel overwrite:  perms &= ~deny ; perms |= allow
5.  collect allow-union and deny-union across the subject's role overwrites
6.  perms &= ~denyUnion
7.  perms |= allowUnion
8.  member overwrite (member view only): perms &= ~deny ; perms |= allow
9.  raw
10. effective = raw & VIEW_CHANNEL ? raw : raw & ~CHANNEL_SCOPED
```

### Things that are easy to get wrong

**Steps 4–7 are not interleavable.** All `@everyone` handling completes
before any role handling, and every deny is collected before any allow is
applied. Applying deny-then-allow per role gives a different answer
whenever two of the subject's roles disagree about a bit.

**`@everyone` must never appear in the subject's role list.** Discord's
`member.roles` excludes it and the algorithm applies it separately. If it
leaks into the list it is applied twice, and the result genuinely
diverges: when the `@everyone` overwrite allows a bit and another role
denies it, the correct answer is denied, because the allow-union at step 7
must not contain `@everyone`'s allow.

**Base permissions include `@everyone`.** A role with no permissions of
its own still sees everything `@everyone` sees.

**Categories are not consulted.** `compute_overwrites` never reads
`parent_id`. Category syncing physically copies overwrites onto the child
at edit time — which is precisely why a channel can become de-synced.
Treating the category as a read-time fallback produces correct answers
only for synced channels and invents permissions for de-synced ones.

**Step 10 is presentation only.** Writing `effective` back to Discord
would strip allow bits nobody edited.

**`ALL` is `KNOWN_BITS`, never `~0n`.** A two's-complement-infinite bigint
reaching a diff or a PATCH body sends garbage.

**Threads** have no overwrites of their own and resolve against their
parent channel. This is the one real inheritance in Discord.

## Subjects

```ts
type PermissionSubject =
  | { kind: 'role';   roleId: string }
  | { kind: 'member'; userId: string; roleIds: readonly string[]; isOwner: boolean };
```

One implementation serves both views. The role view answers "what does
this role grant here, in isolation" and skips the member step; the member
view is Discord's real answer for a person.

## Output

`explainChannelPermissions` returns `{ raw, effective, steps }`, where
`steps` is roughly ten whole-bitfield transitions with a typed `Stage`.
`traceForBit` filters those steps for one permission; the last one is
decisive.

`Stage` values double as translation keys. The engine emits codes and
parameters and never prose — otherwise the trace and the audit list, the
two most content-heavy panels in the product, could not be localised.

## Sync state

```ts
channelSyncState(index, channelId): 'synced' | 'desynced' | 'no-parent'
```

Set equality over the channel's full normalised overwrite set against its
parent's, ignoring entries that neither allow nor deny anything. It is a
property of the channel, not of whichever role you are inspecting.

Being de-synced is reported, never treated as undesirable.

## Changes

A change is a masked intent, not a value:

```
touched   : the only bits this operation may alter
nextAllow / nextDeny
```

applied against the live value read immediately beforehand:

```
role:      permissions = (live      & ~touched) | nextAllow
overwrite: allow       = (liveAllow & ~touched) | nextAllow
           deny        = (liveDeny  & ~touched) | nextDeny
```

Bits Discord invents after the snapshot survive untouched, the allow/deny/
neutral tri-state is expressible without extra fields, and inversion for
rollback is `nextAllow = observedAllow & touched`.

## Audit

Ten rules, each emitting a code plus parameters and one of three
severities. Critical findings sort first — an earlier version emitted
every Administrator warning before any channel finding and the UI capped
the list, so on a server with a handful of admin roles every critical
result was invisible.

Findings are computed on read. They were previously written to a table on
every sync that nothing ever read.
