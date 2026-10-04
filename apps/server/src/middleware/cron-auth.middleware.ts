import { createHash, timingSafeEqual } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { AppError } from '../lib/errors.js'
import { env } from '../lib/env.js'

const digest = (value: string) => createHash('sha256').update(value).digest()

/**
 * Lets through only the scheduler holding CRON_SECRET.
 *
 * Without a secret configured the routes do not exist (404), so a preview or
 * a developer machine exposes nothing. The comparison hashes both sides first:
 * equal-length digests make it constant-time whatever was sent. The secret
 * only ever travels in the Authorization header — never the query string,
 * which request logs record.
 */
export const requireCronSecret = createMiddleware(async (c, next) => {
  if (!env.cronSecret) {
    throw new AppError(404, 'Not found', 'NOT_FOUND')
  }

  const header = c.req.header('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  if (!given || !timingSafeEqual(digest(given), digest(env.cronSecret))) {
    throw new AppError(401, 'Unauthorized', 'CRON_UNAUTHORIZED')
  }

  await next()
})
