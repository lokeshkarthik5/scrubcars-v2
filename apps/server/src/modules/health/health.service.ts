import { logger } from '../../lib/logger.js'
import { APP_VERSION } from '../../lib/version.js'
import { healthRepository } from './health.repository.js'

const log = logger.child({ module: 'health' })

// Past this, the database counts as down even if it would answer eventually:
// a page that takes longer than this to get a first query through is a page
// customers are giving up on.
const DB_TIMEOUT_MS = 3000

export type HealthReport = {
  status: 'ok' | 'down'
  db: 'ok' | 'down'
  version: string
}

export const healthService = {
  /** Whether the API can reach its database, within DB_TIMEOUT_MS. */
  async check(): Promise<HealthReport> {
    const db = await answersWithin(healthRepository.ping(), DB_TIMEOUT_MS)

    if (!db) log.error({ timeoutMs: DB_TIMEOUT_MS }, 'health:db_down')

    return {
      status: db ? 'ok' : 'down',
      db: db ? 'ok' : 'down',
      version: APP_VERSION,
    }
  },
}

/**
 * True when the query finishes in time, false when it fails or is still
 * running. A query still running is left to finish on its own; the check has
 * already answered.
 */
async function answersWithin(query: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms)
  })

  try {
    return await Promise.race([
      query.then(
        () => true,
        (err) => {
          log.error({ err }, 'health:db_error')
          return false
        }
      ),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}
