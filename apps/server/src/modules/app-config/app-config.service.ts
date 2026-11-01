import { resolveAppConfig, type AppConfigEnv } from '../../lib/app-config.js'
import { env } from '../../lib/env.js'
import type { AppConfigQuery } from './app-config.validation.js'

export const appConfigService = {
  /**
   * Whether the asking app must update. `config` is the environment's
   * settings (a test passes its own); with nothing set, nobody is ever told
   * to update.
   */
  get(query: AppConfigQuery, config: AppConfigEnv = env.appConfig) {
    return resolveAppConfig(config, query)
  },
}
