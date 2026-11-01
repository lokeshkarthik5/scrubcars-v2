/**
 * In place of packages/core/src/analytics.ts (metro.config.js), which needs
 * sessionStorage and the browser's beacon. Core's hooks call `track`; on the phone
 * it records nothing yet. There is no ad tracking in this app, ever.
 */
export function track(_event: string, _props?: Record<string, unknown>): void {}
export function currentVisitId(): null {
  return null;
}
