# Open Questions

1. Which Discord OAuth scopes will be final? Likely `identify` and `guilds` for dashboard read; bot permissions are separate.
2. Should Permission Manager be a Discord role ID per guild, a dashboard-only role, or both?
3. How long should snapshots and execution history be retained?
4. Should role-centric simulation include only one selected role or support multi-role member simulation in v1.1?
5. Which permissions belong in advanced-mode categories beyond the base set?
6. What is the exact reinforced confirmation UX for `@everyone` and Administrator changes?
7. Should imports allow deletion of missing overwrites, or only explicit operation plans?
8. What hosting target is preferred for web and bot?

None of these block the local vertical slice.
