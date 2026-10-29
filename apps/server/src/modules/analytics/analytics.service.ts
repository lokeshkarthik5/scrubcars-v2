import { waitUntil } from '@vercel/functions'
import {
  bookingEventProps,
  cleanPath,
  isLikelyBot,
  PURGE_BATCH,
  retentionCutoff,
  type CANCELLED_BY,
  type ServerEventName,
} from '../../lib/analytics.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { createKeyedLimit } from '../../lib/throttle.js'
import { analyticsRepository, type NewAnalyticsEvent } from './analytics.repository.js'
import type { EventBatch } from './analytics.validation.js'

const log = logger.child({ module: 'analytics' })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Batches per visit per minute, beside the per-IP limit on the route. The
 * app sends one every few seconds at most, and only when something
 * happened; a visit id sending more is not the app. In memory, per server
 * instance, like the other limits.
 */
const perVisit = createKeyedLimit(20, 60 * 1000)

/** How far back signing in reaches into the visit's events: a day. */
export const VISIT_JOIN_WINDOW_MS = 24 * 60 * 60 * 1000

/** Who sent a batch, as the controller read it from the request. */
export interface IngestContext {
  /** The session's subject, when the request carried a valid customer session. */
  userId: string | null
  userAgent: string | undefined
  /**
   * The request said Do Not Track or Global Privacy Control (DNT: 1,
   * Sec-GPC: 1). The app sends nothing then; this is the server's own check.
   */
  privacySignal: boolean
}

/**
 * Runs a usage write after the response without ever reaching the caller:
 * an error is a warning in the log, never a crash report or a failed
 * request. Analytics must not make anything else fail, a payment least of
 * all.
 */
function inBackground(label: string, task: () => Promise<unknown>) {
  try {
    const promise = new Promise((resolve) => setImmediate(resolve))
      .then(task)
      .catch((err: unknown) => log.warn({ err, task: label }, 'analytics:write_failed'))
    waitUntil(promise)
  } catch (err) {
    log.warn({ err, task: label }, 'analytics:write_failed')
  }
}

async function recordBookingEvent(
  name: ServerEventName,
  bookingId: string,
  cancelledBy?: (typeof CANCELLED_BY)[number]
) {
  const facts = await analyticsRepository.bookingFacts(bookingId)
  if (!facts) return
  const props = bookingEventProps(name, facts, cancelledBy)
  if (!props) return
  await analyticsRepository.insertEvents([{ name, props }])
}

export const analyticsService = {
  /**
   * A batch from the customer app, already validated. Dropped when the
   * browser asked not to be tracked, from crawlers and scripted browsers,
   * and from a visit sending more than the app ever would. Returns how many events were kept.
   */
  async ingest(batch: EventBatch, context: IngestContext): Promise<number> {
    if (context.privacySignal) return 0
    if (isLikelyBot(context.userAgent, env.analyticsAllowHeadless)) return 0
    if (!perVisit(batch.visitId).ok) return 0

    const userId = context.userId && UUID_RE.test(context.userId) ? context.userId : null
    const rows: NewAnalyticsEvent[] = batch.events.map((event) => ({
      name: event.name,
      visitId: batch.visitId,
      userId,
      props: event.props ?? {},
      path: event.path === undefined ? null : cleanPath(event.path),
      device: batch.device,
      appVersion: batch.appVersion,
    }))
    await analyticsRepository.insertEvents(rows)
    return rows.length
  },

  /**
   * booking_paid, once per booking, from wherever its payment went through
   * (the app's confirm or Razorpay's webhook, whichever won). Recorded after
   * the response and never allowed to fail the payment.
   */
  bookingPaid(bookingId: string): void {
    inBackground('booking_paid', () => recordBookingEvent('booking_paid', bookingId))
  },

  /** booking_cancelled, after the cancel committed. Paid bookings only. */
  bookingCancelled(bookingId: string, by: (typeof CANCELLED_BY)[number]): void {
    inBackground('booking_cancelled', () => recordBookingEvent('booking_cancelled', bookingId, by))
  },

  /**
   * After a customer signs in with a code: the visit's earlier, anonymous
   * events get the account, so the steps before sign-in (landing, the
   * garage, Book Now, the code sent) and after it are one person's visit.
   * Scoped to that visit id alone, to rows with no account yet, and to the
   * last day (a visit is one browser tab). After the response; never fails
   * the sign-in. The visit id is the random one the app keeps in
   * sessionStorage; a wrong or made-up one matches nothing.
   */
  joinVisit(visitId: string | undefined, userId: string): void {
    if (!visitId || !UUID_RE.test(visitId) || !UUID_RE.test(userId)) return
    inBackground('join_visit', async () => {
      const since = new Date(Date.now() - VISIT_JOIN_WINDOW_MS)
      const joined = await analyticsRepository.attachUserToVisit(visitId, userId, since)
      if (joined > 0) log.info({ joined }, 'analytics:visit_joined')
    })
  },

  /**
   * The 180-day clean-up, a batch per call (the pending-digest cron runs it
   * every tick). Returns how many went.
   */
  async purgeExpired(now = new Date()): Promise<number> {
    const deleted = await analyticsRepository.deleteOlderThan(retentionCutoff(now), PURGE_BATCH)
    if (deleted > 0) log.info({ deleted }, 'analytics:purged')
    return deleted
  },
}
