'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { pullProgress } from '@repo/core/moments'
import { cn } from '@repo/core/utils'
import { RoadCar } from './road'
import { useT } from '@repo/core/i18n'

/** How long the car takes to drive off: the list waits at least this long. */
const DRIVE_OFF_MS = 800

/**
 * Pull to refresh (moment 6), for a list at the top of its screen: as the
 * list is pulled down the little car rolls in from the side, "Release to
 * refresh" once it is far enough; let go and the car drives off while the
 * list asks again (`onRefresh`), then the list settles back.
 *
 * Touch only, and only from the very top of the page. The browser's own
 * pull-to-refresh (which reloads the whole page) is held off while this
 * screen is up. Under reduced motion the car stays still; the gesture still
 * works. The list keeps refreshing by itself as it always did; this only
 * adds a way to ask now.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => Promise<unknown> | void
  children: ReactNode
  className?: string
}) {
  const t = useT()
  const [travel, setTravel] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const start = useRef<{ y: number; x: number } | null>(null)
  const pulling = travel > 0

  // Chrome's own pull-to-refresh reloads the page from the top; this one
  // replaces it while the list is on screen.
  useEffect(() => {
    const root = document.documentElement
    const before = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = 'contain'
    return () => {
      root.style.overscrollBehaviorY = before
    }
  }, [])

  const { offset, share, ready } = pullProgress(travel)

  const onTouchStart = (event: React.TouchEvent) => {
    if (refreshing || window.scrollY > 0 || event.touches.length !== 1) return
    start.current = { y: event.touches[0].clientY, x: event.touches[0].clientX }
  }
  const onTouchMove = (event: React.TouchEvent) => {
    const from = start.current
    if (!from) return
    const dy = event.touches[0].clientY - from.y
    const dx = event.touches[0].clientX - from.x
    // A sideways swipe (a card's photos) or a scroll up is not a pull.
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
      if (travel) setTravel(0)
      return
    }
    setTravel(dy)
  }
  const onTouchEnd = () => {
    start.current = null
    const wasReady = ready
    setTravel(0)
    if (!wasReady || refreshing) return
    setRefreshing(true)
    const drive = new Promise((resolve) => window.setTimeout(resolve, DRIVE_OFF_MS))
    void Promise.allSettled([Promise.resolve(onRefresh()), drive]).then(() => setRefreshing(false))
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      data-pulling={pulling ? '' : undefined}
      data-refreshing={refreshing ? '' : undefined}
      aria-busy={refreshing || undefined}
      className={cn('mo-pull relative', className)}
      style={{ '--share': share } as React.CSSProperties}
    >
      {(pulling || refreshing) && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1.5 h-[52px] overflow-hidden">
          <span className="mo-pull__car absolute left-0 top-1.5 block size-6 text-white">
            <RoadCar className="!static !size-6" />
          </span>
          <span
            className={cn(
              'absolute inset-x-0 top-[34px] text-center text-t5 font-medium text-[#8E8E98] transition-opacity',
              ready && !refreshing ? 'opacity-100' : 'opacity-0'
            )}
          >
            {t('Release to refresh')}
          </span>
        </div>
      )}
      {/* Said once, when it starts. */}
      <span role="status" className="sr-only">
        {refreshing ? t('Refreshing') : ''}
      </span>
      <div
        className="mo-pull__list"
        style={pulling ? { transform: `translateY(${offset}px)` } : undefined}
      >
        {children}
      </div>
    </div>
  )
}
