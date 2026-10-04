import { scrubBreadcrumb, scrubEvent } from '@repo/core/scrub'

/**
 * The Sentry settings the three web apps share, as a plain object. Each app
 * hands it to its own @sentry/nextjs — this package does not depend on the
 * SDK, so nothing here loads it.
 *
 * Null when the app has no DSN, which is every environment but Production
 * until someone sets NEXT_PUBLIC_SENTRY_DSN there: the apps check for null
 * and then never import the SDK at all.
 *
 * What is sent is cut down on purpose: no user details, cookies, headers,
 * query strings, request bodies or local variables (SDK v11's
 * `dataCollection`, which replaced `sendDefaultPii: false` and defaults to
 * collecting all of them), no performance traces, and every message, URL and
 * breadcrumb passed through scrub.ts.
 */
export interface MonitoringInput {
  app: 'users' | 'vendors' | 'admin'
  dsn: string | undefined
  /** VERCEL_ENV at build time: production, preview, or development. */
  environment: string | undefined
  version: string | undefined
}

export function sentryOptions(input: MonitoringInput) {
  if (!input.dsn) return null

  return {
    dsn: input.dsn,
    environment: input.environment || 'development',
    release: input.version ? `${input.app}@${input.version}` : undefined,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  }
}
