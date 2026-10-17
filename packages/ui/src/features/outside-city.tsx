import { IconMapPin } from '@tabler/icons-react'
import {
  outsideCityTag,
  type OutsideServiceCity,
} from '@repo/core/service-city'
import { cn } from '@repo/core/utils'
import { Figures } from '@repo/ui/sc/figures'

/**
 * The "Outside Chennai" sign on a garage that is in another town.
 *
 * Calm on purpose: a graphite chip in the card's own quiet type, with only the
 * pin in amber to catch the eye. It is a fact about where the garage is, not a
 * fault, so no red (that is the one main action on a screen) and no warning
 * triangle. The words come from @repo/core/service-city, shared with the
 * garage page and checkout.
 */
export function OutsideCityChip({
  outside,
  className,
}: {
  outside: OutsideServiceCity
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-text-secondary',
        className
      )}
    >
      <IconMapPin
        size={12}
        aria-hidden="true"
        className="shrink-0 text-warning"
      />
      <span className="truncate">{outsideCityTag(outside)}</span>
    </span>
  )
}

/**
 * The same sign as one plain sentence, for the garage page and checkout:
 * "This garage is in Sivakasi, about 485 km from Chennai." The figures are in
 * the numeric face, the words in Inter. `id` lets a control point
 * aria-describedby at it, as checkout's Pay does.
 */
export function OutsideCityLine({
  text,
  id,
  className,
}: {
  text: string
  id?: string
  className?: string
}) {
  return (
    <p
      id={id}
      className={cn(
        'flex items-start gap-1.5 text-[12px] text-text-secondary',
        className
      )}
    >
      <IconMapPin
        size={14}
        aria-hidden="true"
        className="mt-px shrink-0 text-warning"
      />
      <span>
        <Figures text={text} />
      </span>
    </p>
  )
}
