import { cn } from '@repo/core/utils'

/**
 * The opening-hours ring (§3): a small ring whose green arc is the share of
 * today's hours still ahead (hoursLeftShare in @repo/core/opening-hours).
 * It sits beside the word "Open", which says the same thing in words, so the
 * ring itself is hidden from screen readers. The arc draws in once when
 * `play` is set; under reduced motion it is simply there (finish.css).
 */
export function HoursRing({
  share,
  play = false,
  className,
}: {
  /** 0–1, or null for a closed garage: the ring is then an empty grey circle. */
  share: number | null
  play?: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn('size-3.5 shrink-0 -rotate-90', className)}
    >
      <circle cx="8" cy="8" r="5.6" fill="none" strokeWidth="2.2" stroke="rgb(255 255 255 / 0.2)" />
      {share !== null && (
        <circle
          cx="8"
          cy="8"
          r="5.6"
          fill="none"
          strokeWidth="2.2"
          stroke="#22C55E"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - share}
          className={cn('drop-shadow-[0_0_3px_rgb(34_197_94/0.8)]', play && 'hours-ring-in')}
        />
      )}
    </svg>
  )
}
