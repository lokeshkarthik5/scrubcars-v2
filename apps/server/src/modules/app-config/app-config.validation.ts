import { z } from 'zod'
import { APP_NAMES, APP_PLATFORMS, isValidVersion } from '../../lib/app-config.js'

/**
 * What an app sends: which app, which platform and its own version. Strict,
 * so nothing else rides along; a version that is not one to three dotted
 * numbers ("1.2.3") is a validation error, never a guess.
 */
export const appConfigQuerySchema = z
  .object({
    app: z.enum(APP_NAMES),
    platform: z.enum(APP_PLATFORMS),
    version: z.string().trim().refine(isValidVersion, 'Not a version like 1.2.3'),
  })
  .strict()

export type AppConfigQuery = z.infer<typeof appConfigQuerySchema>
