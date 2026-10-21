import type { Context } from 'hono'
import { logger } from '../../lib/logger.js'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { analyticsService } from './analytics.service.js'
import { parseEventBatch } from './analytics.validation.js'

const log = logger.child({ module: 'analytics' })

type EventsContext = Context<{ Variables: Partial<AuthVariables> }>

/**
 * POST /events: a batch of usage events from the customer app. 400 for a
 * body that is not a valid batch (an unknown event or key, a free-text
 * value, too many events); 204 otherwise, whatever happened to it after,
 * so the app has nothing to retry and nothing to show. The app never reads
 * the answer anyway.
 */
export async function recordEvents(c: EventsContext) {
  const parsed = parseEventBatch(await c.req.text())
  if (!parsed.ok) {
    return c.json({ success: false, message: 'Not a valid batch of events', code: 'INVALID_EVENTS' }, 400)
  }

  // Only a customer session names its user; a vendor's or anything else
  // records the visit alone.
  const auth = c.get('auth')
  const userId = auth?.aud === 'customer' && auth.isCustomer ? auth.sub : null

  try {
    await analyticsService.ingest(parsed.batch, {
      userId,
      userAgent: c.req.header('user-agent'),
      privacySignal: c.req.header('dnt') === '1' || c.req.header('sec-gpc') === '1',
    })
  } catch (err) {
    // Lost events are a gap in a chart, never an error anyone sees.
    log.warn({ err }, 'analytics:ingest_failed')
  }
  return c.body(null, 204)
}
