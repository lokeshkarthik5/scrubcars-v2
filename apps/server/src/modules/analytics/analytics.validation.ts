import { z } from 'zod'
import {
  AMOUNT_BUCKETS,
  APP_VERSION_PATTERN,
  BOOKING_MODES,
  BROWSE_CATEGORIES,
  CAMPAIGN_PATTERN,
  CHANNELS,
  CLIENT_EVENTS,
  DEVICE_CLASSES,
  EVENT_PROPS,
  EVENT_STEPS,
  MAX_EVENTS_PER_BATCH,
  MAX_PATH_LENGTH,
  REFERRER_PATTERN,
  SLUG_PATTERN,
  SOURCE_PATTERN,
} from '../../lib/analytics.js'

/**
 * Every prop the app may send, each with a fixed shape: ids, enums, small
 * whole numbers and a slug. No free text fits any of them. Strict, so an
 * unknown key is refused rather than dropped; which keys each event may use
 * is checked below.
 */
const propsSchema = z
  .object({
    vendorId: z.string().uuid(),
    mode: z.enum(BOOKING_MODES),
    category: z.enum(BROWSE_CATEGORIES),
    serviceCount: z.number().int().min(1).max(20),
    amountBucket: z.enum(AMOUNT_BUCKETS),
    source: z.string().regex(SOURCE_PATTERN),
    step: z.enum(EVENT_STEPS),
    // The length of what was typed into search, never the words.
    queryLength: z.number().int().min(0).max(200),
    // 0061, app_open: where the visit came from. utm_ tags as slugs, the
    // referring site's domain alone, and the channel they add up to.
    medium: z.string().regex(SOURCE_PATTERN),
    campaign: z.string().regex(CAMPAIGN_PATTERN),
    referrer: z.string().regex(REFERRER_PATTERN),
    channel: z.enum(CHANNELS),
    // The landing page's area chips and banners, by slug.
    area: z.string().regex(SLUG_PATTERN),
    banner: z.string().regex(SLUG_PATTERN),
  })
  .partial()
  .strict()

const eventSchema = z
  .object({
    // Only the app's own events: booking_paid and booking_cancelled are the
    // API's, and a request naming them is refused.
    name: z.enum(CLIENT_EVENTS),
    // Cleaned again on the server (lib/analytics.ts cleanPath).
    path: z.string().max(MAX_PATH_LENGTH).optional(),
    props: propsSchema.optional(),
  })
  .strict()
  .superRefine((event, ctx) => {
    const allowed = new Set<string>(EVENT_PROPS[event.name])
    for (const key of Object.keys(event.props ?? {})) {
      if (!allowed.has(key)) {
        ctx.addIssue({ code: 'custom', message: `${event.name} does not take ${key}`, path: ['props', key] })
      }
    }
  })

/**
 * A batch from the customer app. The visit id is the random id the app keeps
 * in sessionStorage; the user is never sent (the API reads the session
 * cookie). Strict all the way down.
 */
export const eventBatchSchema = z
  .object({
    visitId: z.string().uuid(),
    device: z.enum(DEVICE_CLASSES),
    appVersion: z.string().regex(APP_VERSION_PATTERN),
    events: z.array(eventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
  })
  .strict()

export type EventBatch = z.infer<typeof eventBatchSchema>
export type ClientEvent = EventBatch['events'][number]

/**
 * The body, as text: the app sends it with navigator.sendBeacon as
 * text/plain (a type the browser sends cross-origin without a preflight),
 * so it is parsed here rather than by the JSON validator.
 */
export function parseEventBatch(
  text: string
): { ok: true; batch: EventBatch } | { ok: false } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false }
  }
  const parsed = eventBatchSchema.safeParse(json)
  return parsed.success ? { ok: true, batch: parsed.data } : { ok: false }
}
