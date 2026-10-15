import { describe, expect, it } from 'vitest';
import { languages, t, type Dict, type Lang } from './index';
import { localizedError } from './errors';

type ErrorCode = keyof Dict['errors'];
const legacyMessages: readonly [string, ErrorCode][] = [
  ['Invalid origin', 'INVALID_ORIGIN'],
  ['Unauthorized', 'UNAUTHORIZED'],
  ['Write access is fixed by configuration.', 'WRITE_ACCESS_FIXED'],
  ['Invalid write mode.', 'INVALID_WRITE_MODE'],
  ['Invalid write action.', 'INVALID_WRITE_ACTION'],
  ['Enter a Discord user ID or paste a mention.', 'INVALID_MEMBER_ID'],
  ['DISCORD_BOT_TOKEN is not configured.', 'BOT_TOKEN_MISSING'],
  ['DISCORD_BOT_TOKEN is not set. Add it to your .env file.', 'BOT_TOKEN_MISSING'],
  ['That user is not a member of this server.', 'MEMBER_NOT_FOUND'],
  ['Member lookup failed. Check bot access or try again later.', 'MEMBER_LOOKUP_FAILED'],
  ['Sync this server before importing members.', 'SYNC_REQUIRED'],
  ['A member sync is already running for this server.', 'MEMBER_SYNC_RUNNING'],
  ['Discord refused the member list. Enable the SERVER MEMBERS INTENT for this application in the Discord Developer Portal (Bot → Privileged Gateway Intents), then try again.', 'MEMBERS_INTENT_REQUIRED'],
  ['Member sync failed. Check bot access or try again later.', 'MEMBER_SYNC_FAILED'],
  ['No snapshot found', 'NO_SNAPSHOT'],
  ['No usable snapshot', 'NO_SNAPSHOT'],
  ['No usable snapshot. Re-sync this server.', 'NO_SNAPSHOT'],
  ['No current snapshot. Sync this guild first.', 'NO_SNAPSHOT'],
  ['Snapshot predates the current schema. Re-sync this guild.', 'OUTDATED_SNAPSHOT'],
  ['Stored snapshot predates the current schema. Re-sync this guild.', 'OUTDATED_SNAPSHOT'],
  ['That is not valid JSON.', 'INVALID_JSON'],
  ['Invalid JSON.', 'INVALID_JSON'],
  ['The uploaded snapshot does not match the expected format.', 'INVALID_SNAPSHOT'],
  ['This snapshot belongs to a different server.', 'WRONG_GUILD'],
  ['Snapshot belongs to a different guild.', 'WRONG_GUILD'],
  ['Imported snapshot guild id does not match the selected guild.', 'WRONG_GUILD'],
  ['Import has more than 500 changes. Split it into smaller plans.', 'TOO_MANY_CHANGES'],
  ['Cannot verify bot capabilities.', 'BOT_UNAVAILABLE'],
  ['Cannot verify bot capabilities. Try again later.', 'BOT_UNAVAILABLE'],
  ['Invalid import', 'INVALID_IMPORT'],
  ['Invalid request', 'INVALID_REQUEST'],
  ['No operations', 'NO_OPERATIONS'],
  ['Invalid stored operation. Create a new plan.', 'INVALID_PLAN'],
  ['Invalid stored role target.', 'INVALID_PLAN'],
  ['Invalid stored overwrite target.', 'INVALID_PLAN'],
  ['Invalid stored permission intent.', 'INVALID_PLAN'],
  ['A plan cannot edit the same target twice.', 'DUPLICATE_TARGETS'],
  ['Duplicate targets. Create a new plan.', 'DUPLICATE_TARGETS'],
  ['Role is missing from this snapshot or managed by Discord.', 'ROLE_NOT_FOUND'],
  ['Managed roles cannot be edited.', 'MANAGED_ROLE'],
  ['No permission bits selected.', 'NO_PERMISSION_BITS'],
  ['Channel is missing or cannot have overwrites.', 'INVALID_CHANNEL'],
  ['Overwrite target type changed.', 'OVERWRITE_TYPE_CHANGED'],
  ['Overwrite target is not a current member of this server.', 'MEMBER_TARGET_NOT_FOUND'],
  ['Select non-overlapping permission bits.', 'OVERLAPPING_BITS'],
  ['Plan not found', 'PLAN_NOT_FOUND'],
  ['Wait for this plan to finish before generating a rollback.', 'PLAN_RUNNING'],
  ['This plan has no applied operations to roll back.', 'NOTHING_TO_ROLLBACK'],
  ['Request is too large.', 'REQUEST_TOO_LARGE'],
  ['Request body timed out.', 'NETWORK_ERROR'],
  ['Expected application/json.', 'JSON_REQUIRED'],
  ['Invalid form.', 'INVALID_FORM'],
  ['Failed to fetch', 'NETWORK_ERROR'],
  ['fetch failed', 'NETWORK_ERROR'],
  ['NetworkError when attempting to fetch resource.', 'NETWORK_ERROR'],
  ['Load failed', 'NETWORK_ERROR'],
  ['Discord guild listing failed. Sign in again or try later.', 'GUILD_LIST_FAILED'],
  ['AUTH_SECRET must contain at least 32 characters.', 'AUTH_CONFIG_INVALID'],
  ['APP_URL must be an HTTP(S) origin.', 'APP_URL_INVALID'],
  ['APP_URL requires HTTPS except on loopback.', 'APP_URL_INVALID'],
  ['Execution interrupted. Sync and review live state before making another plan.', 'EXECUTION_INTERRUPTED'],
  ['excluded from the plan', 'EXCLUDED'],
  ['target no longer exists', 'TARGET_MISSING'],
  ['changed on Discord since this plan was created', 'LIVE_CONFLICT'],
  ['Stopped: execution deadline, write lock or authorization changed.', 'EXECUTION_STOPPED'],
  ['Execution stopped before writing: authorization, write lock or execution changed.', 'EXECUTION_STOPPED'],
  ['Execution deadline expired.', 'EXECUTION_STOPPED'],
  ['Discord global rate limit: remaining operations were not attempted.', 'RATE_LIMITED'],
  ['Discord refused the bot permissions or role hierarchy.', 'DISCORD_FORBIDDEN'],
  ['Write response unavailable; verifying live state.', 'WRITE_UNCONFIRMED'],
  ['Cannot validate live target.', 'INVALID_TARGET'],
  ['Role 123456789012345678 does not belong to this guild.', 'ROLE_NOT_FOUND'],
  ['Channel 3 does not belong to this guild.', 'CHANNEL_NOT_FOUND'],
  ['Unknown role in import: 123', 'ROLE_NOT_FOUND'],
  ['Unknown channel in import: 456', 'CHANNEL_NOT_FOUND'],
  ['Unknown channel: 789', 'CHANNEL_NOT_FOUND'],
  ['This file uses snapshot format 1.0.0; this version of D-View reads 2.0.0. Export a fresh snapshot and edit that instead — older files stored permission names, which cannot be converted back to bitfields without losing permissions.', 'SNAPSHOT_VERSION_MISMATCH'],
  ['Discord global rate limit hit; retry after 1250ms', 'RATE_LIMITED'],
  ['rate limited after 3 attempts', 'RATE_LIMITED'],
  ['Discord 403 for /guilds/123/roles: sensitive Discord detail', 'DISCORD_FORBIDDEN'],
  ['Discord 429 for /channels/123: sensitive Discord detail', 'RATE_LIMITED'],
  ['Discord 502 for /guilds/123: sensitive Discord detail', 'DISCORD_ERROR'],
];

describe('localizedError', () => {
  it.each(Object.keys(languages) as Lang[])('localizes codes and legacy errors in %s without changing stored messages', (lang) => {
    const copy = t(lang);
    for (const code of Object.keys(copy.errors) as ErrorCode[]) {
      expect(localizedError(copy, code)).toBe(copy.errors[code]);
      expect(localizedError(copy, new Error(code))).toBe(copy.errors[code]);
    }
    for (const [message, code] of legacyMessages) {
      const error = new Error(message);
      expect(localizedError(copy, message), message).toBe(copy.errors[code]);
      expect(localizedError(copy, error), message).toBe(copy.errors[code]);
      expect(error.message).toBe(message);
    }
  });

  it.each(Object.keys(languages) as Lang[])('never displays unknown prose, secrets or inherited object keys in %s', (lang) => {
    const copy = t(lang);
    for (const error of [
      undefined, null, 403, {}, { message: 'Unauthorized' }, { error: 'UNAUTHORIZED' },
      '__proto__', 'constructor', 'toString', 'SECRET_CODE',
      'postgres://user:password@private/database', new Error('Bot secret-token'),
      'Prefix Role 123 does not belong to this guild.',
      'Role 123 does not belong to this guild. secret-token',
      'Role secret-token does not belong to this guild.',
      'Role 123 does not belong to this guild.\n',
      'Unknown channel in import: 123 extra',
      'This file uses snapshot format 1.0.0; secret-token',
      'Discord 502 for /guilds/123: secret-token\nextra',
    ]) {
      expect(localizedError(copy, error)).toBe(copy.errors.REQUEST_FAILED);
    }
  });
});
