import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { DEFAULT_REWARDS_SETTINGS, settingsProblems, type RewardsSettings } from '../../lib/rewards.js'
import { rewardsRepository } from './rewards.repository.js'
import { rewardsSettingsSchema } from './rewards.validation.js'

const log = logger.child({ module: 'rewards-settings' })

/** How long one API instance keeps the settings before reading them again. */
export const SETTINGS_TTL_MS = 30_000

export interface SettingsInForce {
  version: number
  settings: RewardsSettings
  actorName: string
  savedAt: Date | null
}

let cache: { at: number; value: SettingsInForce } | null = null

/**
 * The one way the server reads the rewards settings: the latest version in
 * reward_settings, kept for 30 seconds per instance (an admin save clears
 * this instance's copy at once; others pick it up within the TTL). A row
 * that does not read back as valid settings (never written by this API)
 * falls back to the defaults, loudly. The pure rules take the settings as
 * an argument; only services call this.
 */
export async function currentSettings(nowMs = Date.now()): Promise<SettingsInForce> {
  if (cache && nowMs - cache.at < SETTINGS_TTL_MS) return cache.value
  const row = await rewardsRepository.latestSettings()
  let value: SettingsInForce
  if (!row) {
    value = { version: 0, settings: DEFAULT_REWARDS_SETTINGS, actorName: 'Detlio (defaults)', savedAt: null }
  } else {
    const parsed = rewardsSettingsSchema.safeParse(row.settings)
    const problems = parsed.success ? settingsProblems(parsed.data as RewardsSettings) : ['shape']
    if (!parsed.success || problems.length > 0) {
      log.error({ version: row.version, problems }, 'rewards:settings_invalid_using_defaults')
      value = { version: row.version, settings: DEFAULT_REWARDS_SETTINGS, actorName: row.actorName, savedAt: row.createdAt }
    } else {
      value = { version: row.version, settings: parsed.data as RewardsSettings, actorName: row.actorName, savedAt: row.createdAt }
    }
  }
  cache = { at: nowMs, value }
  return value
}

/** After a save, or in tests. */
export function forgetSettings() {
  cache = null
}

/**
 * Whether rewards are live: REWARDS_ENABLED (the master switch, env) and
 * the admin's switch in the settings. With the env off nothing is read.
 */
export async function rewardsLive(): Promise<boolean> {
  if (!env.rewardsEnabled) return false
  return (await currentSettings()).settings.enabled
}
