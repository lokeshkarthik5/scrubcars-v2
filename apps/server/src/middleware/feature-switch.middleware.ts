import { createMiddleware } from 'hono/factory'
import { AppError } from '../lib/errors.js'

/**
 * Makes a group of routes not exist while a feature switch is off: every
 * request is the same 404 as an unknown path, whoever sends it, before any
 * auth runs. Used for tools that are dangerous to leave on (the test-data
 * reset), so that switching one off removes it entirely rather than leaving
 * a door that only checks who is knocking.
 *
 * Takes a reader rather than a value so a test can flip it.
 */
export function notFoundUnless(enabled: () => boolean) {
  return createMiddleware(async (_c, next) => {
    if (!enabled()) {
      throw new AppError(404, 'Not found', 'NOT_FOUND')
    }
    await next()
  })
}
