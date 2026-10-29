'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  allowsAnalytics,
  effectiveConsent,
  getConsentSnapshot,
  getServerConsentSnapshot,
  subscribeConsent,
} from '@/lib/consent'
import {
  clarityProjectId,
  installClarity,
  loadClarityScript,
  pauseClarity,
  withdrawClarity,
} from '@/lib/clarity'
import { pixelExcluded } from '@/lib/meta-pixel'
import { whenIdle } from '@/lib/when-idle'

/**
 * Microsoft Clarity (lib/clarity.ts): heatmaps and recordings, loaded only
 * when the build has NEXT_PUBLIC_CLARITY_ID and the customer said Allow to
 * analytics and marketing cookies. Until then, with Do-Not-Track or Global
 * Privacy Control on, or on a team device, Microsoft's code is never put on
 * the page. Allowing mid-visit starts it there and then; choosing Only
 * essential mid-visit stops it (Clarity's own consent call).
 *
 * Kept off the pages the Pixel stays off (lib/meta-pixel.ts
 * `pixelExcluded`), whose address holds a code or a booking's id. Clarity
 * follows App Router navigations itself. Mounted inside the layout's
 * Suspense boundary, for useSearchParams.
 */
export function Clarity() {
  const projectId = clarityProjectId()
  const pathname = usePathname()
  const params = useSearchParams()
  const hidden = pixelExcluded(pathname, params.get('next'))
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getServerConsentSnapshot
  )
  const allowed =
    consent.ready &&
    allowsAnalytics(
      effectiveConsent(
        consent.stored,
        consent.privacySignal,
        consent.teamDevice
      )
    )
  const active = projectId !== null && allowed && !hidden
  const started = useRef(false)

  useEffect(() => {
    if (!active || !projectId) return
    installClarity()
    started.current = true
    return whenIdle(() => loadClarityScript(projectId))
  }, [active, projectId])

  // Clarity follows in-app navigations on its own, so once it is running it
  // is paused on a page it stays off and resumed on leaving it.
  useEffect(() => {
    if (!started.current || !allowed) return
    pauseClarity(hidden)
  }, [hidden, allowed])

  // The answer changed to Only essential after Clarity started.
  useEffect(() => {
    if (consent.ready && !allowed && started.current) {
      withdrawClarity()
      started.current = false
    }
  }, [allowed, consent.ready])

  return null
}
