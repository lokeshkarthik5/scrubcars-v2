import type { Instrumentation } from 'next'
import { monitoringOptions, startMonitoring } from './lib/monitoring'

// Server-side crash reporting, for errors thrown while rendering on the
// server. Both hooks do nothing unless this build has a Sentry DSN (see
// lib/monitoring).
export async function register() {
  await startMonitoring()
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  if (!monitoringOptions) return
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.captureRequestError(error, request, context)
  } catch {
    // Reporting is best effort; the error itself is already in the logs.
  }
}
