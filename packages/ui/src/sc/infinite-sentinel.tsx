'use client'

import { useEffect, useRef } from 'react'

interface InfiniteSentinelProps {
  onVisible: () => void
  /** False when the list is exhausted, so the observer stops doing work. */
  enabled: boolean
  loading?: boolean
}

/**
 * Fires `onVisible` when scrolled into view, to pull the next page.
 *
 * Deliberately an IntersectionObserver rather than a scroll listener: it does
 * not run on the main thread on every frame, and `rootMargin` lets the next
 * page start loading before the user reaches the bottom, so pagination is
 * invisible rather than a stutter.
 */
export function InfiniteSentinel({
  onVisible,
  enabled,
  loading = false,
}: InfiniteSentinelProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Held in a ref so a new closure each render does not tear down the observer.
  // Synced in an effect rather than during render, since a render that React
  // discards must not leave the ref pointing at a closure that never committed.
  const callbackRef = useRef(onVisible)

  useEffect(() => {
    callbackRef.current = onVisible
  }, [onVisible])

  useEffect(() => {
    const node = ref.current
    if (!node || !enabled) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) callbackRef.current()
      },
      // Start fetching roughly one screen early.
      { rootMargin: '400px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  if (!enabled && !loading) return null

  return (
    <div ref={ref} className="py-4 text-center text-[12px] text-text-muted">
      {loading ? 'Loading more…' : ''}
    </div>
  )
}
