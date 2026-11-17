'use client'

import { useId, useRef } from 'react'
import { washGaugeAngle, washGaugeShare } from '@repo/core/moments'
import { cn } from '@repo/core/utils'
import { usePrefersReducedMotion, useSeenOnce } from './motion'

/**
 * The wash gauge (moment 7, the customer app's Last wash tile; also Garage
 * Book's one-customer screen, moment 8): days since the last wash on a
 * 96×54 arc, green → amber → red to the reading, with a glowing red-tipped
 * needle and a silver hub. As it comes into view the needle sweeps all the
 * way once and settles, like a car's dials when the engine starts; overdue
 * pins it at the end stop in amber. Drawn, not read: the words beside it
 * say the same. CSS in packages/ui/styles/finish.css (.mo-gauge).
 */
export function WashGauge({
  daysSinceWash,
  intervalDays,
  over,
  reversed = false,
  className,
}: {
  daysSinceWash: number | null
  intervalDays: number
  /** Past the interval: the arc turns amber. */
  over: boolean
  /**
   * Higher is better (Shine Score, 0078: a score out of 100 read as
   * `daysSinceWash` of `intervalDays` 100): the arc runs red → amber → green.
   */
  reversed?: boolean
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useSeenOnce(ref)
  const reduce = usePrefersReducedMotion()
  const id = `wash-gauge-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const angle = washGaugeAngle(daysSinceWash, intervalDays)
  const share = washGaugeShare(daysSinceWash, intervalDays)
  return (
    <span
      ref={ref}
      aria-hidden
      data-play={seen && !reduce ? '' : undefined}
      className={cn('mo-gauge relative block h-[54px] w-[96px]', className)}
      style={{ '--angle': `${angle}deg` } as React.CSSProperties}
    >
      <svg viewBox="0 0 96 54" className="absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id={id} x1="0" x2="1">
            <stop offset="0" stopColor={reversed ? '#ff2d4a' : '#22C55E'} />
            <stop offset={reversed ? '0.4' : '0.6'} stopColor="#F5B83D" />
            <stop offset="1" stopColor={reversed ? '#22C55E' : '#ff2d4a'} />
          </linearGradient>
        </defs>
        <path
          d="M8 50 A40 40 0 0 1 88 50"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke="rgb(255 255 255 / 0.08)"
        />
        <path
          d="M8 50 A40 40 0 0 1 88 50"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - share}
          stroke={over ? 'var(--color-warning)' : `url(#${id})`}
          className="mo-gauge__fill"
        />
      </svg>
      <span className="mo-gauge__needle absolute bottom-1 left-1/2 -ml-[1.25px] block h-[38px] w-[2.5px] rounded-[2px] bg-gradient-to-t from-white to-[#ff4d66] shadow-[0_0_8px_rgb(255_45_74/0.8)]" />
      <span className="absolute bottom-0 left-1/2 -ml-[6px] block size-3 rounded-full bg-[radial-gradient(circle_at_40%_30%,#fff,#8d919c)]" />
    </span>
  )
}
