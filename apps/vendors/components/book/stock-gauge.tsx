'use client'

import { useId, useRef } from 'react'
import { cn } from '@repo/core/utils'
import { usePrefersReducedMotion, useSeenOnce } from '@repo/ui/finish/motion'

/**
 * The stock gauge (moment 7, stage23.py `stock_gauge`): a half dial with the
 * needle at what is left. Brushed silver while there is plenty; running low
 * it turns a calm amber, never a glow. As it comes into view the needle
 * swings up from empty once and settles; under reduced motion it is simply
 * there. Drawn, not read: the words under it say the same, so it is hidden
 * from screen readers.
 */
export function StockGauge({ share, low, width = 140, className }: { share: number; low: boolean; width?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const seen = useSeenOnce(ref)
  const reduce = usePrefersReducedMotion()
  const id = `stock-gauge-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const left = Math.max(0, Math.min(1, share))
  const angle = -90 + 180 * left
  return (
    <svg
      ref={ref}
      aria-hidden
      width={width}
      height={Math.round(width * 0.6)}
      viewBox="0 0 140 84"
      data-play={seen && !reduce ? '' : undefined}
      className={cn('gb-gauge overflow-visible', className)}
      style={{ '--gb-angle': `${angle}deg` } as React.CSSProperties}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0" stopColor="#9c9ca6" />
          <stop offset="1" stopColor="#f2f2f5" />
        </linearGradient>
      </defs>
      <path d="M14 70 A56 56 0 0 1 126 70" fill="none" stroke="rgb(255 255 255 / .1)" strokeWidth="8" strokeLinecap="round" />
      {left > 0 && (
        <path
          d="M14 70 A56 56 0 0 1 126 70"
          fill="none"
          stroke={low ? '#F5A524' : `url(#${id})`}
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${Math.max(1, Math.round(left * 100))} 100`}
          opacity={low ? 0.9 : 1}
        />
      )}
      <g className="gb-gauge__needle">
        <line x1="70" y1="70" x2="70" y2="24" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <circle cx="70" cy="70" r="6" fill="#1b1b20" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}
