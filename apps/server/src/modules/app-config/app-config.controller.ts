import type { Context } from 'hono'
import { appConfigService } from './app-config.service.js'
import type { AppConfigQuery } from './app-config.validation.js'

export function getAppConfig(c: Context, query: AppConfigQuery) {
  // An old answer would keep a forced update on after the team lowered the
  // minimum, or off after they raised it.
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: appConfigService.get(query) })
}
