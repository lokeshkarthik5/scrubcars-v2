import { waitUntil } from '@vercel/functions'
import { logger } from './logger.js'

const log = logger.child({ module: 'background' })

/**
 * Runs work after the response, without the caller waiting on it and without
 * it ever failing the caller.
 *
 * On Vercel a function can be frozen as soon as its response is sent, so a
 * promise merely left running may never finish; `waitUntil` keeps the function
 * alive until it settles. Off Vercel (local dev, tests) there is no such
 * context, `waitUntil` does nothing, and the promise runs in the long-lived
 * process as usual.
 */
export function runInBackground(label: string, task: () => Promise<unknown>): void {
  try {
    // Through a resolved promise, so a task that throws before its first
    // await is caught here too rather than escaping into the request.
    const promise = Promise.resolve()
      .then(task)
      .catch((err) => log.error({ err, task: label }, 'background:failed'))
    waitUntil(promise)
  } catch (err) {
    log.error({ err, task: label }, 'background:failed')
  }
}
