'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * The finish's motion helpers (customer UI round, Nov 2026, §1): one-shot
 * effects only, and none at all under prefers-reduced-motion, where the
 * content simply appears. CSS effects (finish.css fx-*) switch themselves
 * off; this is for the ones driven from script (count-ups, the odometer,
 * the map's tilt and route).
 */

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/** Whether the customer asked for less motion. True on the server, so nothing moves before it is known. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false),
    () => true
  )
}

/**
 * Plays a one-shot CSS effect again on an element that already has it:
 * removes the attribute (or class), forces a style read, and sets it back.
 */
export function replay(element: Element | null, attribute = 'data-go') {
  if (!element) return
  element.removeAttribute(attribute)
  void (element as HTMLElement).offsetWidth
  element.setAttribute(attribute, '')
}

/**
 * True from the moment the element first comes into view, never false again:
 * what starts a card's one-shot effects (the count-up, the road). Already
 * true under reduced motion and where IntersectionObserver is missing, so
 * the figures are simply there.
 */
export function useSeenOnce<T extends Element>(
  ref: React.RefObject<T | null>,
  options: { threshold?: number; rootMargin?: string } = {}
): boolean {
  const [seen, setSeen] = useState(false)
  const { threshold = 0.35, rootMargin } = options
  useEffect(() => {
    const element = ref.current
    if (seen || !element) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, seen, threshold, rootMargin])
  return seen
}
