'use client'

import { useEffect } from 'react'

/**
 * The Showroom cards' photo drift: each card's photos sit a few pixels off
 * centre in the direction of the scroll (`--drift`, ±16px at the screen's
 * edges), so they move a little slower than the list. One scroll listener
 * for every card on the page, one frame per scroll, cards off screen
 * skipped. Off under reduced motion (the caller passes `enabled`).
 */
const cards = new Set<HTMLElement>()
let frame = 0

function update() {
  frame = 0
  const height = window.innerHeight
  for (const card of cards) {
    const r = card.getBoundingClientRect()
    if (r.bottom < 0 || r.top > height) continue
    const t = (r.top + r.height / 2 - height / 2) / height
    card.style.setProperty('--drift', `${(t * -16).toFixed(1)}px`)
  }
}

function onScroll() {
  if (!frame) frame = requestAnimationFrame(update)
}

export function useDrift(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const card = ref.current
    if (!enabled || !card) return
    if (cards.size === 0) window.addEventListener('scroll', onScroll, { passive: true })
    cards.add(card)
    onScroll()
    return () => {
      cards.delete(card)
      card.style.removeProperty('--drift')
      if (cards.size === 0) window.removeEventListener('scroll', onScroll)
    }
  }, [ref, enabled])
}
