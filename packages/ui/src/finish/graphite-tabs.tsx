'use client'

import * as React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { cn } from '@repo/core/utils'
import { usePrefersReducedMotion } from './motion'
import { RedLight } from './red-light'

/**
 * GraphiteSwitch's look on real tabs (the garage's Services and Settings):
 * the same recessed track, raised graphite key with its liquid slide, and red
 * light under the open tab, drawn one-line at the switch's pinned height.
 *
 * Kept on Radix's tabs rather than turned into a radiogroup, because these do
 * own panels: role="tab"/aria-selected, roving focus and the tab↔panel link
 * stay exactly as they were. `value` is the open tab, so the key knows where
 * to sit; use it inside a controlled <Tabs>. The flat TabsList in sc/tabs is
 * untouched (the customer app and admin still use it).
 */
export function GraphiteTabsList({
  value,
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { value: string }) {
  const reduce = usePrefersReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const keyRef = useRef<HTMLSpanElement>(null)
  const placed = useRef<{ left: number; width: number } | null>(null)
  const shown = useRef(value)
  const [lit, setLit] = useState(true)

  const place = useCallback(
    (animate: boolean) => {
      const track = trackRef.current
      const key = keyRef.current
      const tab = track?.querySelector<HTMLElement>(`[role="tab"][data-value="${CSS.escape(value)}"]`)
      if (!track || !key || !tab) return
      const to = { left: tab.offsetLeft, width: tab.offsetWidth }
      const from = placed.current
      if (animate && from && !reduce && (from.left !== to.left || from.width !== to.width)) {
        const left = Math.min(from.left, to.left)
        const right = Math.max(from.left + from.width, to.left + to.width)
        key.animate(
          [
            { transform: `translateX(${from.left}px)`, width: `${from.width}px` },
            { transform: `translateX(${left}px) scaleY(0.92)`, width: `${right - left}px`, offset: 0.42 },
            { transform: `translateX(${to.left}px)`, width: `${to.width}px` },
          ],
          { duration: 460, easing: 'cubic-bezier(.3,.85,.25,1)' }
        )
      }
      key.style.transform = `translateX(${to.left}px)`
      key.style.width = `${to.width}px`
      placed.current = to
    },
    [value, reduce]
  )

  // Before paint, so the key is never drawn in the wrong place for a frame.
  useLayoutEffect(() => {
    const moved = shown.current !== value
    shown.current = value
    if (moved && !reduce) {
      setLit(false)
      const timer = window.setTimeout(() => setLit(true), 300)
      place(true)
      return () => window.clearTimeout(timer)
    }
    place(false)
  }, [value, reduce, place])

  useEffect(() => {
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => place(false))
    observer.observe(track)
    return () => observer.disconnect()
  }, [place])

  const count = React.Children.count(children)

  return (
    <TabsPrimitive.List
      ref={trackRef}
      data-slot="tabs-list"
      className={cn(
        'fx-recessed relative grid rounded-[18px] p-1',
        // Five tabs on a 360px phone: the labels drop to 13px, as the flat
        // strip had them, so none crowds the key.
        count > 3 && '[&_[role=tab]]:text-[13px]',
        // Tamil's words are wider: a size down again with four or more tabs.
        count > 3 && '[&_[role=tab]:lang(ta)]:text-[12px]',
        className
      )}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      {...props}
    >
      <span
        ref={keyRef}
        aria-hidden="true"
        className="fx-graphite pointer-events-none absolute inset-y-1 left-0 overflow-hidden rounded-[14px]"
      >
        <RedLight state={lit ? 'on' : 'off'} className="absolute bottom-[3px] left-1/2 -ml-2.5" />
      </span>
      {children}
    </TabsPrimitive.List>
  )
}

export function GraphiteTabsTrigger({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-value={value}
      value={value}
      className={cn(
        'relative z-[1] flex min-h-11 min-w-0 items-center justify-center whitespace-nowrap rounded-[14px] px-1 pb-1 text-[14px] font-medium text-[#8E8E98] transition-colors duration-200',
        'hover:text-text-secondary data-[state=active]:font-semibold data-[state=active]:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70',
        'disabled:pointer-events-none disabled:opacity-40',
        className
      )}
      {...props}
    >
      {/* One line inside its own tab: a label too long for it (Tamil at
          390px) ends in an ellipsis rather than running into the next.
          Clipped sideways only, so tall Tamil marks are never cut. */}
      <span className="min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap">
        {children}
      </span>
    </TabsPrimitive.Trigger>
  )
}
