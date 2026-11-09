'use client'

import { useEffect } from 'react'
import { usePrefersReducedMotion } from '@repo/ui/finish/motion'

/**
 * Job done, money in (moment 3): a tick draws in a red-lit ring, the amount
 * floats up, and the card fades away; the "Taken today" tile rolls to the
 * new total by itself (an Odometer). Plays once; under reduced motion only
 * the words show, briefly, and nothing moves.
 */
export function DoneMoment({ name, line, amount, onEnd }: { name: string; line: string; amount: string | null; onEnd: () => void }) {
  const reduce = usePrefersReducedMotion()
  useEffect(() => {
    if (!reduce) return
    const timer = setTimeout(onEnd, 1400)
    return () => clearTimeout(timer)
  }, [reduce, onEnd])
  return (
    <div role="status" className="gb-done fixed inset-0 z-50 grid place-items-center">
      <div
        className="gb-done__card fx-glass flex w-[240px] flex-col items-center gap-3 rounded-surface px-5 py-6 text-center"
        onAnimationEnd={(event) => {
          if (event.animationName === 'gb-fade') onEnd()
        }}
      >
        <div className="relative">
          {amount && (
            <span className="gb-done__amount absolute -top-8 left-1/2 -translate-x-1/2 font-numeric text-[18px] font-semibold text-text-primary">
              +{amount}
            </span>
          )}
          <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden>
            <circle className="gb-done__ring" cx="38" cy="38" r="32" fill="none" stroke="#ff2d4a" strokeWidth="2.5" pathLength={1} strokeDasharray="1" />
            <path className="gb-done__tick" d="M26 39l8 8l16 -18" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" />
          </svg>
        </div>
        <div>
          <p className="text-t3 font-semibold text-text-primary">Done · {name}</p>
          <p className="mt-0.5 text-t4 text-[#A8A8B2]">{line}</p>
        </div>
      </div>
    </div>
  )
}
