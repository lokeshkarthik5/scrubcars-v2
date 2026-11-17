import { SHINE_OUTLINE_PATHS, type ShineArea } from '@repo/core/shine-score'
import { cn } from '@repo/core/utils'

/**
 * The dashed guide over the photo frame: what to fit inside the line for
 * each step (core's SHINE_OUTLINE_PATHS, shared with the phone app). Drawn,
 * not read (the words under the frame say the same).
 */
export function ShineOutline({ area, className }: { area: ShineArea; className?: string }) {
  return (
    <svg viewBox="0 0 320 200" aria-hidden focusable="false" className={cn('pointer-events-none', className)}>
      <path
        d={SHINE_OUTLINE_PATHS[area]}
        fill="none"
        stroke="rgb(255 255 255 / 0.9)"
        strokeWidth="2.5"
        strokeDasharray="7 7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
