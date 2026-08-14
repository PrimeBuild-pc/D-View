/**
 * The running version, injected at build time by next.config.ts.
 *
 * Kept in one place so a bug report can name the build it came from, and so the
 * release workflow and the dashboard can never disagree about the number.
 */
export function appVersion(): string {
  return process.env.APP_VERSION ?? 'dev';
}
