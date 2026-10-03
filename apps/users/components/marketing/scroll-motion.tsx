'use client'

import { useEffect } from 'react'

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

const BLOCK_FROM: Keyframe = {
  opacity: 0,
  transform: 'translate3d(0, 56px, 0) scale(0.97)',
}
const WORD_FROM: Keyframe = {
  opacity: 0,
  transform: 'translate3d(0, 0.7em, 0)',
}
const TO: Keyframe = { opacity: 1, transform: 'none' }

/**
 * The homepage's scroll reveals and card spotlight. Renders nothing.
 *
 * Reveals are time-based, not scroll-linked: an element waiting below the
 * fold plays a short rise-in once it enters view, at the same pace however
 * fast the visitor scrolls. They run on the Web Animations API rather than
 * class toggles, so nothing React rendered is mutated and hydration never
 * sees a changed attribute.
 *
 * Content is only ever hidden by this component, after hydration, and only
 * while it is off screen — so the server-rendered page reads in full without
 * JS, and nothing already on screen blinks out. Under reduced motion it does
 * nothing at all.
 *
 * `.mk-reveal` marks a block; `.mk-word` a word of a headline. `--i` (set by
 * stagger() in sections.tsx) offsets each in its row so a row arrives as a
 * wave.
 */
export function ScrollMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (
      typeof IntersectionObserver === 'undefined' ||
      typeof Element.prototype.animate !== 'function'
    ) {
      return
    }

    const waiting = new Map<Element, Animation>()

    document.querySelectorAll<HTMLElement>('.mk-reveal').forEach((el) => {
      // Anything showing at all — even a sliver at the bottom — stays put.
      const box = el.getBoundingClientRect()
      if (box.top < window.innerHeight && box.bottom > 0) return

      const word = el.classList.contains('mk-word')
      const index = Number(getComputedStyle(el).getPropertyValue('--i')) || 0
      const animation = el.animate([word ? WORD_FROM : BLOCK_FROM, TO], {
        duration: word ? 750 : 950,
        easing: EASE,
        delay: index * (word ? 55 : 110),
        // Holds the first frame while paused and through the delay, then
        // lets go: once played out, the element's own styles apply again.
        fill: 'backwards',
      })
      animation.pause()
      waiting.set(el, animation)
    })

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          waiting.get(entry.target)?.play()
          waiting.delete(entry.target)
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 }
    )
    waiting.forEach((_, el) => observer.observe(el))

    // Printing renders the whole page at once: settle everything first.
    const onBeforePrint = () => {
      waiting.forEach((animation) => animation.finish())
      waiting.clear()
    }
    window.addEventListener('beforeprint', onBeforePrint)

    // A soft light under the pointer on cards (`.mk-spot`, app/globals.css).
    const onPointerMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.('.mk-spot')
      if (!(card instanceof HTMLElement)) return
      const box = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${event.clientX - box.left}px`)
      card.style.setProperty('--my', `${event.clientY - box.top}px`)
    }
    document.addEventListener('pointermove', onPointerMove, { passive: true })

    return () => {
      observer.disconnect()
      waiting.forEach((animation) => animation.cancel())
      document.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('beforeprint', onBeforePrint)
    }
  }, [])

  return null
}
