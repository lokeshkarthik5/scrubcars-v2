'use client'

import { useEffect } from 'react'
import { initAnalytics } from '@repo/core/analytics'
import { API_BASE_URL } from '@repo/core/api/client'
import { APP_VERSION } from '@repo/core/version'

/**
 * Detlio's own usage events (packages/core/src/analytics.ts), started once
 * for the whole app. First-party: events go to our API and nowhere else, a
 * visit is a random id in sessionStorage, and a browser that says Do Not
 * Track or Global Privacy Control sends nothing. Off unless the build says
 * NEXT_PUBLIC_ANALYTICS=on (next.config.ts turns it on for Production).
 *
 * Renders nothing. Pages record their own steps with `track`.
 */
export function Analytics() {
  useEffect(() => {
    initAnalytics({
      endpoint: `${API_BASE_URL}/events`,
      enabled: process.env.NEXT_PUBLIC_ANALYTICS === 'on',
      appVersion: APP_VERSION,
    })
  }, [])
  return null
}
