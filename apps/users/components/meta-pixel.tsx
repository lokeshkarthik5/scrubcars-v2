'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  effectiveConsent,
  getConsentSnapshot,
  getServerConsentSnapshot,
  subscribeConsent,
} from '@/lib/consent'
import {
  installPixel,
  loadPixelScript,
  pixelExcluded,
  sendToMeta,
} from '@/lib/meta-pixel'

/** Runs `run` once the page has loaded and the browser is idle; returns a cancel. */
function whenIdle(run: () => void): () => void {
  let cancelled = false
  let idle: number | undefined
  let timer: number | undefined
  const go = () => {
    if (cancelled) return
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(() => {
        if (!cancelled) run()
      })
    } else {
      timer = window.setTimeout(() => {
        if (!cancelled) run()
      }, 1)
    }
  }
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
  return () => {
    cancelled = true
    window.removeEventListener('load', go)
    if (idle !== undefined) window.cancelIdleCallback?.(idle)
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

/**
 * Meta Pixel, only for a customer who allowed marketing cookies (the consent
 * banner, lib/consent.ts): until then, and for a browser with Do-Not-Track or
 * Global Privacy Control on, Meta's code is never put on the page. Allowing
 * mid-visit starts it there and then.
 *
 * Kept off every page whose address holds a code (lib/meta-pixel.ts
 * `pixelExcluded`): the gift page and sign-in on the way to it, a printed
 * coupon's page likewise, and a shared Service History certificate.
 * Mounted inside a Suspense boundary (the layout's) for useSearchParams.
 *
 * `fbq` goes on the page at once (Meta's snippet, so early calls queue), and
 * fbevents.js loads after the page has loaded and the browser is idle, so it
 * never competes with the page's own JavaScript for the first paint and the
 * first tap. A page view is sent for the first page and again whenever the
 * path changes (App Router navigations do not reload the document); none on
 * a page it is kept off. No noscript beacon: without JavaScript there is
 * no way to have said yes.
 */
export function MetaPixel() {
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
    effectiveConsent(consent.stored, consent.privacySignal) === 'marketing'
  // The path the last page view was sent for; reset on a page the Pixel
  // stays off, so coming back to a page counts it again.
  const viewed = useRef<string | null>(null)

  useEffect(() => {
    if (hidden || !allowed) {
      viewed.current = null
      return
    }
    installPixel()
    if (viewed.current !== pathname) {
      viewed.current = pathname
      sendToMeta('track', 'PageView')
    }
  }, [pathname, hidden, allowed])

  useEffect(() => {
    if (hidden || !allowed) return
    return whenIdle(() => loadPixelScript())
  }, [hidden, allowed])

  return null
}
