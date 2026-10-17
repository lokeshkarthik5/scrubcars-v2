import { textClientFor, type TextClient } from '../../lib/ai.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { aiConfigFor, describeServiceWith } from './ai.describe.js'
import type { DescribeServiceInput } from './ai.validation.js'

/**
 * AI help in the admin panel. There is no repository: nothing here reads or
 * writes the database. A description is only text for a form field; it is
 * saved, if at all, by the editor's own Save changes like anything typed.
 *
 * This file only wires the env's client and the logger in; what each
 * outcome means is ai.describe.ts, where the tests reach it.
 */

// Built once per instance: the SDK client holds its own connection pool.
let client: TextClient | null | undefined

function textClient(): TextClient | null {
  if (client === undefined) {
    client = textClientFor({
      apiKey: env.openaiApiKey,
      model: env.aiTextModel,
      fake: env.aiFake,
    })
  }
  return client
}

export const aiService = {
  /** Which AI helpers the admin panel may show. All off without a key. */
  config() {
    return aiConfigFor(textClient())
  },

  describeService(input: DescribeServiceInput) {
    return describeServiceWith(textClient(), input, logger)
  },
}
