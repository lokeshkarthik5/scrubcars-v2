/**
 * Forced update for the native apps: the pure rules. Which version an app
 * must be at least, how two versions compare, and what to tell an app. No
 * env, no database, no network, so every rule is unit-tested; lib/env.ts
 * reads the variables through `readAppConfigEnv` and modules/app-config
 * answers the route.
 *
 * Safe by default: anything unset or unreadable means "no update required".
 * An unconfigured (or mistyped) server must never lock a customer or a
 * garage out of their app.
 */

export const APP_NAMES = ['customer', 'garage'] as const
/** Which app is asking: the customer app or the garage app. */
export type AppName = (typeof APP_NAMES)[number]

export const APP_PLATFORMS = ['ios', 'android'] as const
export type AppPlatform = (typeof APP_PLATFORMS)[number]

/**
 * One app on one platform, as the environment set it. A field is null when
 * it is unset or does not parse.
 */
export interface AppTarget {
  minVersion: string | null
  latestVersion: string | null
  storeUrl: string | null
}

export type AppConfigEnv = Record<AppName, Record<AppPlatform, AppTarget>>

/** What `GET /app-config` answers. */
export interface AppConfigAnswer extends AppTarget {
  updateRequired: boolean
}

/**
 * A version is one to three numbers separated by dots ("1", "1.2",
 * "1.2.3"), each up to six digits; a missing part counts as 0. No
 * pre-release tags, no leading "v": the apps send their plain store
 * version.
 */
const VERSION = /^\d{1,6}(\.\d{1,6}){0,2}$/

export function isValidVersion(value: string): boolean {
  return VERSION.test(value)
}

/** The three numbers of a valid version, or null for anything else. */
export function parseVersion(value: string): [number, number, number] | null {
  if (!VERSION.test(value)) return null
  const [major, minor = '0', patch = '0'] = value.split('.')
  return [Number(major), Number(minor), Number(patch)]
}

/**
 * Compares two versions numerically, so "1.10.0" is above "1.9.0". Negative
 * when `a` is lower, 0 when equal ("1.2" equals "1.2.0"), positive when
 * higher. Throws on a version that does not parse: callers check first.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) throw new Error(`Not a version: ${left ? b : a}`)

  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

/** A version setting from the environment: trimmed, null if unset or not a version. */
function versionSetting(raw: string | undefined): string | null {
  const value = raw?.trim()
  return value && isValidVersion(value) ? value : null
}

/** A store address from the environment: an https address, or null. */
function storeUrlSetting(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Reads every setting. The names share one scheme, `APP_<KIND>_<APP>_<PLATFORM>`,
 * for example `APP_MIN_VERSION_CUSTOMER_IOS`, `APP_LATEST_VERSION_GARAGE_ANDROID`
 * and `APP_STORE_URL_CUSTOMER_ANDROID`. A value that does not parse counts as
 * unset, so a typo turns the check off for that app instead of locking it.
 */
export function readAppConfigEnv(source: Record<string, string | undefined>): AppConfigEnv {
  const read = (app: AppName, platform: AppPlatform): AppTarget => {
    const suffix = `${app.toUpperCase()}_${platform.toUpperCase()}`
    return {
      minVersion: versionSetting(source[`APP_MIN_VERSION_${suffix}`]),
      latestVersion: versionSetting(source[`APP_LATEST_VERSION_${suffix}`]),
      storeUrl: storeUrlSetting(source[`APP_STORE_URL_${suffix}`]),
    }
  }

  return {
    customer: { ios: read('customer', 'ios'), android: read('customer', 'android') },
    garage: { ios: read('garage', 'ios'), android: read('garage', 'android') },
  }
}

/**
 * What to tell an app on `version`.
 *
 * `updateRequired` is true only when a minimum is set and the app is below
 * it. `latestVersion` is the newest release the team announced; with a
 * minimum set it is never below it (unset, it is the minimum).
 */
export function resolveAppConfig(
  config: AppConfigEnv,
  query: { app: AppName; platform: AppPlatform; version: string }
): AppConfigAnswer {
  const target = config[query.app][query.platform]
  const { minVersion, storeUrl } = target

  // Never announce a newest release below the minimum.
  let latestVersion = target.latestVersion
  if (minVersion && (!latestVersion || compareVersions(latestVersion, minVersion) < 0)) {
    latestVersion = minVersion
  }

  return {
    minVersion,
    latestVersion,
    updateRequired: minVersion !== null && compareVersions(query.version, minVersion) < 0,
    storeUrl,
  }
}
