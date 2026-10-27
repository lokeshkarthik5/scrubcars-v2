import { isIP } from 'node:net'
import { runInBackground } from './background.js'
import { env } from './env.js'
import { logger } from './logger.js'

const log = logger.child({ module: 'meta-capi' })

/**
 * Meta Conversions API: one Purchase event per paid booking, sent from the
 * server beside the customer app's Pixel, under the same event id
 * (`purchase-<bookingId>`, packages/core `purchaseEventId`) so Meta counts
 * it once. Only for a customer who accepted marketing cookies (the verify
 * call's `marketing` block), only from Production, and only what is listed
 * in buildPurchaseEvent: never a name, phone, email, address or any hashed
 * identifier. See AGENTS.md, "Meta Conversions API".
 */

/** The Graph API version every call uses. Pinned here and nowhere else. */
export const META_GRAPH_VERSION = 'v24.0'

/** The customer app's Pixel (apps/users), the default for META_PIXEL_ID. */
export const DEFAULT_META_PIXEL_ID = '891710590692874'

/** How long one send may take before it is given up. */
export const META_CAPI_TIMEOUT_MS = 5_000

/** The longest _fbp / _fbc value accepted. */
export const META_COOKIE_MAX_LENGTH = 200

/** The longest event source URL accepted. */
export const EVENT_SOURCE_URL_MAX_LENGTH = 300

/** Hosts a Purchase can be reported from: the customer app. */
const EVENT_SOURCE_HOSTS = new Set(['detlio.com', 'www.detlio.com'])

/**
 * A paid booking older than this when verify confirms it again is not a new
 * purchase: it is not reported (Meta refuses events over 7 days old anyway).
 */
export const MAX_PURCHASE_AGE_MS = 24 * 60 * 60 * 1000

/** The longest user agent passed on; real ones are far shorter. */
const MAX_USER_AGENT_LENGTH = 512

/**
 * Meta's _fbp / _fbc cookies, loosely: `fb.1.` then printable characters
 * with no spaces (`fb.1.<ms>.<random>`, `fb.1.<ms>.<fbclid>`).
 */
const META_COOKIE_PATTERN = /^fb\.1\.[\x21-\x7e]+$/

/** A _fbp / _fbc value as sent to Meta, or undefined when it doesn't look like one. */
export function cleanMetaCookie(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.length > META_COOKIE_MAX_LENGTH) return undefined
  return META_COOKIE_PATTERN.test(value) ? value : undefined
}

/**
 * The page a payment was made on, or undefined: an https URL on detlio.com
 * or www.detlio.com, at most 300 characters, with no query string, fragment,
 * port or credentials. Anything else is dropped, never repaired.
 */
export function cleanEventSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.length > EVENT_SOURCE_URL_MAX_LENGTH) return undefined
  if (value.includes('?') || value.includes('#')) return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:') return undefined
  if (!EVENT_SOURCE_HOSTS.has(url.hostname)) return undefined
  if (url.port || url.username || url.password) return undefined
  return `${url.origin}${url.pathname}`
}

/** The client's address as Meta takes it, or undefined (the limiter's 'unknown'). */
export function cleanClientIp(value: string | undefined): string | undefined {
  const ip = value?.trim()
  return ip && isIP(ip) !== 0 ? ip : undefined
}

function cleanUserAgent(value: string | undefined): string | undefined {
  const userAgent = value?.trim()
  if (!userAgent) return undefined
  return userAgent.slice(0, MAX_USER_AGENT_LENGTH)
}

/** Where to send, when sending is on. */
export interface MetaCapiConfig {
  token: string
  pixelId: string
  testEventCode?: string
}

/**
 * Whether Purchase events go to Meta, and with what. Pure, so the rule is
 * tested on its own; reportPurchase feeds it the env. All of these must hold:
 * - META_CAPI_TOKEN set (unset, the default, is off);
 * - a Pixel id that is all digits;
 * - none of the E2E fakes on (E2E_FAKE_PAYMENTS, PUSH_FAKE, STREAM_FAKE,
 *   AI_FAKE, ANALYTICS_ALLOW_HEADLESS);
 * - the Production deployment on Vercel. A preview, a laptop or `vercel env
 *   pull` holding the token stays silent, so no test booking reaches Meta.
 *   There is no override: test with META_CAPI_TEST_CODE on Production.
 */
export function metaCapiConfig(config: {
  token?: string
  pixelId?: string
  testEventCode?: string
  vercelEnv?: string
  testFakes?: boolean
}): MetaCapiConfig | null {
  if (!config.token) return null
  if (!config.pixelId || !/^\d{1,30}$/.test(config.pixelId)) return null
  if (config.testFakes) return null
  if (config.vercelEnv !== 'production') return null
  return {
    token: config.token,
    pixelId: config.pixelId,
    ...(config.testEventCode ? { testEventCode: config.testEventCode } : {}),
  }
}

/** The config from this process's env. */
function configFromEnv(): MetaCapiConfig | null {
  return metaCapiConfig({
    token: env.metaCapiToken,
    pixelId: env.metaPixelId,
    testEventCode: env.metaCapiTestCode,
    vercelEnv: env.vercelEnv,
    testFakes:
      env.e2eFakePayments ||
      env.pushFake ||
      env.streamFake ||
      env.aiFake ||
      env.analyticsAllowHeadless,
  })
}

/** What the booking says about its purchase. */
export interface PurchaseFacts {
  bookingId: string
  /** Rupees that came through Razorpay for this booking, after discounts and credit. */
  valueRupees: number
  /** How many services the booking has. */
  serviceCount: number
  /** When the payment landed. */
  paidAt: Date
}

/** What the request and the consented browser say. */
export interface PurchaseContext {
  clientIp?: string
  userAgent?: string
  fbp?: string
  fbc?: string
  eventSourceUrl?: string
}

/** The event id the Pixel and this share for one booking (packages/core purchaseEventId). */
export function purchaseEventId(bookingId: string): string {
  return `purchase-${bookingId}`
}

/** The request body Meta is sent, without the access token. */
export interface PurchaseEventBody {
  data: [
    {
      event_name: 'Purchase'
      event_time: number
      event_id: string
      action_source: 'website'
      event_source_url?: string
      user_data: {
        client_ip_address?: string
        client_user_agent?: string
        fbp?: string
        fbc?: string
      }
      custom_data: {
        currency: 'INR'
        value: number
        num_items: number
      }
    },
  ]
  test_event_code?: string
}

/**
 * The one Purchase event, and nothing else: no name, phone, email, address
 * or hashed identifier, ever. Fields with no value are left out rather than
 * sent empty. `event_time` is when the payment landed (never in the future).
 */
export function buildPurchaseEvent(
  facts: PurchaseFacts,
  context: PurchaseContext,
  options: { testEventCode?: string; now?: Date } = {}
): PurchaseEventBody {
  const now = options.now ?? new Date()
  const eventTime = Math.floor(
    Math.min(facts.paidAt.getTime(), now.getTime()) / 1000
  )
  const userData: PurchaseEventBody['data'][0]['user_data'] = {}
  const ip = cleanClientIp(context.clientIp)
  const userAgent = cleanUserAgent(context.userAgent)
  const fbp = cleanMetaCookie(context.fbp)
  const fbc = cleanMetaCookie(context.fbc)
  if (ip) userData.client_ip_address = ip
  if (userAgent) userData.client_user_agent = userAgent
  if (fbp) userData.fbp = fbp
  if (fbc) userData.fbc = fbc

  const eventSourceUrl = cleanEventSourceUrl(context.eventSourceUrl)
  const value = Math.round(facts.valueRupees * 100) / 100

  return {
    data: [
      {
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: purchaseEventId(facts.bookingId),
        action_source: 'website',
        ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
        user_data: userData,
        custom_data: {
          currency: 'INR',
          value,
          num_items: facts.serviceCount,
        },
      },
    ],
    ...(options.testEventCode
      ? { test_event_code: options.testEventCode }
      : {}),
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

type MetaResponse = {
  events_received?: number
  fbtrace_id?: string
  error?: {
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

/**
 * Posts one Purchase event. Never throws: a timeout (5 s), a network error
 * or Meta's refusal is logged and answered 'failed'. The log names the
 * booking and Meta's answer (code, trace id), never the IP, user agent,
 * cookies or token. The token goes in the body, never the URL.
 */
export async function sendPurchaseEvent(
  body: PurchaseEventBody,
  config: MetaCapiConfig,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = META_CAPI_TIMEOUT_MS
): Promise<'sent' | 'failed'> {
  const eventId = body.data[0].event_id
  try {
    const response = await fetchImpl(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${config.pixelId}/events`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, access_token: config.token }),
        signal: AbortSignal.timeout(timeoutMs),
      }
    )
    const answer = (await response
      .json()
      .catch(() => null)) as MetaResponse | null

    if (response.ok && (answer?.events_received ?? 0) >= 1) {
      log.info(
        {
          eventId,
          test: Boolean(body.test_event_code),
          fbtraceId: answer?.fbtrace_id,
        },
        'meta_capi:sent'
      )
      return 'sent'
    }

    log.warn(
      {
        eventId,
        status: response.status,
        eventsReceived: answer?.events_received,
        errorType: answer?.error?.type,
        errorCode: answer?.error?.code,
        errorSubcode: answer?.error?.error_subcode,
        fbtraceId: answer?.error?.fbtrace_id ?? answer?.fbtrace_id,
      },
      'meta_capi:refused'
    )
    return 'failed'
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error'
    log.warn(
      {
        eventId,
        reason: name === 'TimeoutError' ? 'timeout' : 'network',
        errorName: name,
      },
      'meta_capi:failed'
    )
    return 'failed'
  }
}

/**
 * Bookings already reported by this instance, so a retried verify sends once.
 * Bounded: the oldest are forgotten first. Across instances and cold starts
 * Meta's own dedupe by event id is the backstop.
 */
const MAX_REMEMBERED = 5_000
const reported = new Set<string>()

function claim(bookingId: string): boolean {
  if (reported.has(bookingId)) return false
  reported.add(bookingId)
  if (reported.size > MAX_REMEMBERED) {
    const oldest = reported.values().next().value
    if (oldest !== undefined) reported.delete(oldest)
  }
  return true
}

/** Tests only: forget every booking reported. */
export function forgetReportedPurchases(): void {
  reported.clear()
}

export const metaCapi = {
  /**
   * Reports a paid booking to Meta after the response, once per booking.
   * Fire and forget: returns at once and never throws. Off — and free of any
   * DB read — unless metaCapiConfig says on. `loadFacts` runs after the
   * response and answers null for anything that must not be reported (not
   * paid, test money, cancelled); a purchase older than a day is skipped. A
   * failed send is forgotten, so a later verify of the same booking may try
   * again.
   */
  reportPurchase(
    bookingId: string,
    context: PurchaseContext,
    loadFacts: () => Promise<PurchaseFacts | null>,
    deps: {
      config?: MetaCapiConfig | null
      fetch?: FetchLike
      now?: () => Date
    } = {}
  ): void {
    const config = deps.config === undefined ? configFromEnv() : deps.config
    if (!config) {
      log.debug({ bookingId }, 'meta_capi:off')
      return
    }
    if (!cleanUserAgent(context.userAgent)) {
      // Meta requires the browser's user agent on a website event.
      log.info({ bookingId, reason: 'no_user_agent' }, 'meta_capi:skipped')
      return
    }
    if (!claim(bookingId)) {
      log.debug({ bookingId }, 'meta_capi:already_reported')
      return
    }

    runInBackground('meta_capi', async () => {
      let outcome: 'sent' | 'failed' | 'skipped' = 'failed'
      try {
        const facts = await loadFacts()
        const now = deps.now?.() ?? new Date()
        if (!facts) {
          outcome = 'skipped'
          log.info({ bookingId, reason: 'not_reportable' }, 'meta_capi:skipped')
          return
        }
        if (now.getTime() - facts.paidAt.getTime() > MAX_PURCHASE_AGE_MS) {
          outcome = 'skipped'
          log.info({ bookingId, reason: 'stale' }, 'meta_capi:skipped')
          return
        }
        const body = buildPurchaseEvent(facts, context, {
          testEventCode: config.testEventCode,
          now,
        })
        outcome = await sendPurchaseEvent(body, config, deps.fetch)
      } catch (err) {
        const name = err instanceof Error ? err.name : 'Error'
        log.warn({ bookingId, errorName: name }, 'meta_capi:failed')
      } finally {
        if (outcome === 'failed') reported.delete(bookingId)
      }
    })
  },
}
