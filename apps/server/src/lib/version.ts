import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * This API's version, from server/package.json.
 *
 * The API and the web app version independently, so this reads its own
 * manifest and never reaches outside the server directory — which keeps a
 * deploy rooted at server/ self-contained. `src/lib/…` and the compiled
 * `dist/lib/…` sit the same depth below it, so one path covers both.
 *
 * Read once at module load, not per request. Falls back to APP_VERSION and
 * then to 'unknown': an unknown version is a worse log line, not a failed boot.
 */
function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))

  try {
    const { version } = JSON.parse(
      readFileSync(join(here, '../../package.json'), 'utf8')
    )
    if (typeof version === 'string') return version
  } catch {
    // Fall through to the environment.
  }

  return process.env.APP_VERSION ?? 'unknown'
}

export const APP_VERSION = readVersion()
