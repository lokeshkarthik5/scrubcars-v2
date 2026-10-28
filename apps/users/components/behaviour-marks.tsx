'use client'

import { useEffect } from 'react'
import { track } from '@repo/core/analytics'
import type { BookingMode } from '@repo/core/analytics-events'
import {
  cardInView,
  claimGarageSeen,
  GARAGE_CARD_ATTRIBUTE,
  GARAGE_SEEN_RATIO,
  garageAlreadySeen,
} from '@/lib/garage-seen'

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * "Landed": the marketing homepage was opened (landing_view), the first
 * step of admin's Statistics → Behaviour. Renders nothing.
 */
export function LandingView() {
  useEffect(() => {
    track('landing_view')
  }, [])
  return null
}

/**
 * "Saw a garage": watches the garage cards on the page (anything with
 * data-garage-card, including cards added later as a list loads) and
 * records garage_card_seen the first time one is at least half on screen,
 * once per visit (lib/garage-seen.ts). Renders nothing; stops watching once
 * it has reported, or when the visit already had.
 */
export function GarageSeenWatcher({ mode }: { mode?: BookingMode }) {
  useEffect(() => {
    const storage = sessionStore()
    if (garageAlreadySeen(storage)) return
    if (
      typeof IntersectionObserver !== 'function' ||
      typeof MutationObserver !== 'function'
    )
      return

    const observed = new WeakSet<Element>()
    let done = false
    const stop = () => {
      done = true
      seen.disconnect()
      added.disconnect()
    }
    const seen = new IntersectionObserver(
      (entries) => {
        if (done || !entries.some(cardInView)) return
        stop()
        if (claimGarageSeen(storage))
          track('garage_card_seen', mode ? { mode } : {})
      },
      { threshold: GARAGE_SEEN_RATIO }
    )
    const watchCards = () => {
      if (done) return
      for (const card of document.querySelectorAll(
        `[${GARAGE_CARD_ATTRIBUTE}]`
      )) {
        if (observed.has(card)) continue
        observed.add(card)
        seen.observe(card)
      }
    }
    const added = new MutationObserver(watchCards)
    watchCards()
    added.observe(document.body, { childList: true, subtree: true })
    return stop
  }, [mode])
  return null
}
