import type { CSSProperties } from 'react'
import { cn } from '@repo/core/utils'
import {
  closedNote,
  closedTitle,
  type CalendarKind,
  type ClosedDay,
} from '@/lib/calendar'

/**
 * Small pieces the Bookings calendar's Month and Day views share: the
 * hatching of a closed day, the dot colours, and the closed day's card.
 */

/** Diagonal hatching: a day customers can't book (mockup's closed cells). */
export const HATCH: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 2px, transparent 2px 6px)',
}

/** The card's wider hatching, under the closed day's words. */
const HATCH_CARD: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 6px, transparent 6px 14px)',
}

/**
 * One colour per state, as the legend says: red to answer, blue accepted
 * (under way too), green done. Written out in full so Tailwind finds them.
 */
export const DOT_CLASS: Record<CalendarKind, string> = {
  answer: 'bg-tone-new-dot',
  accepted: 'bg-tone-progress-text',
  working: 'bg-tone-progress-text',
  done: 'bg-tone-done-dot',
}

export function Dot({
  kind,
  className,
}: {
  kind: CalendarKind
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        DOT_CLASS[kind],
        className
      )}
    />
  )
}

/**
 * A closed day under the grid, or above the Day view's timeline: why, and
 * where to change it. Bookings already on a day off stay (time off doesn't
 * cancel them), so they are listed after it.
 */
export function ClosedCard({ closed }: { closed: ClosedDay }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[20px] border border-border bg-surface p-4"
      style={HATCH_CARD}
    >
      <p className="text-[16px] font-semibold text-text-primary">
        {closedTitle(closed)}
      </p>
      <p className="text-[14px] text-text-secondary">{closedNote(closed)}</p>
    </div>
  )
}
