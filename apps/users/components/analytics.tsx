'use client'

import { useEffect } from 'react'
import { initAnalytics, onTrack } from '@repo/core/analytics'
import { API_BASE_URL } from '@repo/core/api/client'
import { APP_VERSION } from '@repo/core/version'
import { mirrorToClarity } from '@/lib/clarity'
import { mirrorToMeta } from '@/lib/meta-pixel'

/**
 * Detlio's own usage events (packages/core/src/analytics.ts), started once
 * for the whole app. First-party: events go to our API and nowhere else, a
 * visit is a random id in sessionStorage, and a browser that says Do Not
 * Track or Global Privacy Control sends nothing. Off unless the build says
 * NEXT_PUBLIC_ANALYTICS=on (next.config.ts turns it on for Production).
 *
 * Renders nothing. Pages record their own steps with `track`.
 *
 * The same events are also offered to the Meta Pixel (lib/meta-pixel.ts
 * `mirrorToMeta`), the one place they are mapped to Meta's: it sends
 * nothing unless the customer allowed marketing cookies, and then only the
 * mapped events, with fixed props and nothing personal. And to Clarity
 * (lib/clarity.ts `mirrorToClarity`), as a "step" tag for filtering
 * recordings, only after Allow and only the event's name.
 */
export function Analytics() {
  useEffect(() => {
    initAnalytics({
      endpoint: `${API_BASE_URL}/events`,
      enabled: process.env.NEXT_PUBLIC_ANALYTICS === 'on',
      appVersion: APP_VERSION,
    })
  }, [])
  useEffect(() => onTrack(mirrorToMeta), [])
  useEffect(() => onTrack(mirrorToClarity), [])
  return null
}
