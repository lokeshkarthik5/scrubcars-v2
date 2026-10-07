import { waitUntil } from '@vercel/functions'
import type * as SentryNode from '@sentry/node'
import { env } from './env.js'
import { logger } from './logger.js'
import { scrubBreadcrumb, scrubEvent } from './scrub.js'
import { APP_VERSION } from './version.js'

const log = logger.child({ module: 'monitoring' })

/**
 * Crash reporting to Sentry, for the errors nobody saw coming: a 500, a
 * background job that threw. An AppError is the API answering as designed and
 * is never reported.
 *
 * Off unless SENTRY_DSN is set, and then nothing about it loads: the SDK is
 * imported on demand, so development, E2E, previews and any deploy without a
 * DSN pay no cold-start cost and send nothing anywhere.
 *
 * What is sent is cut down on purpose: no user details, cookies, headers,
 * query strings, request bodies, query data or local variables (SDK v11's
 * `dataCollection`, which replaced `sendDefaultPii: false` and defaults to
 * collecting all of them), no performance traces, and every message, URL and
 * breadcrumb passed through scrub.ts so a phone number or a login code never
 * reaches a third party.
 */
let sentry: Promise<typeof SentryNode | null> | null = null

export function initMonitoring(): void {
  if (!env.sentryDsn || sentry) return

  const dsn = env.sentryDsn
  sentry = import('@sentry/node')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: env.vercelEnv ?? env.nodeEnv,
        release: `server@${APP_VERSION}`,
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          databaseQueryData: false,
          stackFrameVariables: false,
        },
        tracesSampleRate: 0,
        beforeSend: (event) => scrubEvent(event),
        beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
      })
      log.info({ environment: env.vercelEnv ?? env.nodeEnv }, 'monitoring:on')
      return Sentry
    })
    .catch((err) => {
      // A reporter that cannot start must not take the API with it.
      log.error({ err }, 'monitoring:init_failed')
      return null
    })
}

/**
 * Sends one unexpected error, with a little context (method, path, task) to
 * find it by. Returns at once and never throws.
 *
 * Flushed before the function may be frozen: on Vercel an event left in the
 * SDK's queue when the response goes out is an event that never arrives.
 */
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  if (!sentry) return

  const sending = sentry
    .then(async (Sentry) => {
      if (!Sentry) return
      Sentry.captureException(err, { extra: context })
      await Sentry.flush(2000)
    })
    .catch(() => {
      // Nothing to do: the error itself is already in the logs.
    })

  try {
    waitUntil(sending)
  } catch {
    // Off Vercel there is no request context to extend; the promise runs on.
  }
}
