import { sentryOptions } from '@repo/core/monitoring'

/**
 * This app's crash reporting: Sentry, when NEXT_PUBLIC_SENTRY_DSN was set for
 * the build, and nothing at all otherwise — the SDK is imported on demand, so
 * a build without a DSN never loads a byte of it. Shared settings (what is
 * collected, how phone numbers and codes are scrubbed) live in
 * @repo/core/monitoring.
 */
export const monitoringOptions = sentryOptions({
  app: 'users',
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  version: process.env.NEXT_PUBLIC_APP_VERSION,
})

/** Starts Sentry in whichever runtime calls it: browser, Node or edge. */
export async function startMonitoring(): Promise<void> {
  if (!monitoringOptions) return
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init(monitoringOptions)
  } catch {
    // A reporter that cannot start must not take the page with it.
  }
}

/** Sends one error a crash screen caught. Never throws. */
export function reportError(error: unknown): void {
  if (!monitoringOptions) return
  import('@sentry/nextjs')
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => undefined)
}
