'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@repo/core/utils'

interface RevealProps {
  children: React.ReactNode
  /**
   * Position in a list. Cascades the start of each item by 60ms so a list
   * arrives as a wave rather than all at once. Capped at 6 steps — past that
   * the tail would visibly lag behind the scroll.
   */
  index?: number
  /** Rendered element. Use 'li' inside a list so the markup stays valid. */
  as?: 'div' | 'li' | 'section'
  className?: string
}

const STAGGER_MS = 60
const MAX_STAGGER_STEPS = 6

/**
 * Reveals its children as they scroll into view.
 *
 * The hidden state lives in CSS (`.reveal`) and is only lifted once the
 * observer fires, which raises the obvious question of what happens if the
 * observer never runs. Two answers: without IntersectionObserver support the
 * effect reveals immediately on mount, and under prefers-reduced-motion the
 * stylesheet forces `.reveal` visible regardless of this component. So the
 * content cannot get stranded behind an animation that never plays.
 *
 * Each element is unobserved once revealed — the animation is an arrival, not
 * a scroll-linked effect, so re-triggering it on the way back up would turn
 * ordinary scrolling into a flicker.
 */
export function Reveal({
  children,
  index = 0,
  as: Tag = 'div',
  className,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || revealed) return

    // No observer support: reveal on the next frame. Deferred rather than set
    // straight away so this stays out of the render/effect cascade — and so
    // the server-rendered markup still matches on hydration.
    if (typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setRevealed(true))
      return () => cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      // A small negative bottom margin holds the animation until the item is
      // properly on screen, rather than firing on the sliver at the fold.
      { rootMargin: '0px 0px -40px 0px', threshold: 0.05 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [revealed])

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLLIElement>}
      className={cn('reveal', className)}
      data-revealed={revealed ? 'true' : undefined}
      style={{
        '--reveal-delay': `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS}ms`,
      } as React.CSSProperties}
    >
      {children}
    </Tag>
  )
}
