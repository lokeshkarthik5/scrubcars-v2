import { documentClientFor, type DocumentClient } from '../../lib/ai.js'
import { env } from '../../lib/env.js'
import { FAKE_GARAGE_READING } from '../../lib/garage-import/vision.js'
import { logger } from '../../lib/logger.js'
import { extractGarages } from './vendor-imports.extract.js'
import { vendorImportsRepository } from './vendor-imports.repository.js'
import type { ExtractImportInput } from './vendor-imports.validation.js'

/**
 * Add garage's import: a poster, photo, PDF or Tally file in, a draft of the
 * garage out, for the admin to check and correct on the review screen.
 * Nothing is saved here — the admin's Create does that, through POST
 * /admin/vendors, always as Pending and not verified — and the files are
 * never stored.
 *
 * This file only wires the env's reader and the logger in; what each
 * outcome means is vendor-imports.extract.ts, where the tests reach it.
 */

// Built once per instance: the SDK client holds its own connection pool.
let reader: DocumentClient | null | undefined

function documentClient(): DocumentClient | null {
  if (reader === undefined) {
    reader = documentClientFor({
      apiKey: env.openaiApiKey,
      model: env.aiVisionModel,
      fake: env.aiFake,
      fakeAnswer: JSON.stringify(FAKE_GARAGE_READING),
    })
  }
  return reader
}

const log = logger.child({ module: 'vendor-imports' })

export const vendorImportsService = {
  extract(input: ExtractImportInput) {
    return extractGarages(documentClient(), input, log)
  },

  /**
   * Who a typed owner phone already belongs to, if anyone. Create attaches
   * the garage to that account (and makes it a garage owner), so the form
   * says so before the admin presses it. The number itself is never logged.
   */
  async ownerAccount(phone: string) {
    const user = await vendorImportsRepository.findUserByPhone(phone)
    if (!user) return { account: null }
    const garages = await vendorImportsRepository.listGaragesOwnedBy(user.id)
    return {
      account: {
        name: user.name,
        isCustomer: user.isCustomer,
        garages: garages.map(({ id, businessName, status }) => ({ id, businessName, status })),
      },
    }
  },
}
