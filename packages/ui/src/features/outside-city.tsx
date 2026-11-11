'use client'

import { IconMapPin } from '@tabler/icons-react'
import { outsideCityLine, outsideCityTag, type PlacedGarage } from '@repo/core/customer-city'
import { useCustomerPlace } from '@repo/core/hooks/use-customer-place'
import { cn } from '@repo/core/utils'
import { Figures } from '@repo/ui/sc/figures'

/**
 * The sign on a garage that is in another town than the customer's city:
 * "Vellore · 125 km" (customer cities, 0070, mockup A).
 *
 * Calm on purpose: a graphite chip in the card's own quiet type, with only the
 * pin in amber to catch the eye. It is a fact about where the garage is, not a
 * fault, so no red (that is the one main action on a screen) and no warning
 * triangle. The words come from @repo/core/customer-city, shared with the
 * garage page and checkout.
 */
export function OutsideCityChip({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-text-secondary',
        className
      )}
    >
      <IconMapPin size={12} aria-hidden="true" className="shrink-0 text-warning" />
      <span className="truncate">
        <Figures text={text} />
      </span>
    </span>
  )
}

/**
 * The chip for one garage, relative to the customer's own city and place:
 * nothing at all for a garage in their city, the chip otherwise.
 */
export function GarageTownChip({ garage, className }: { garage: PlacedGarage; className?: string }) {
  const { place } = useCustomerPlace()
  const text = outsideCityTag(garage, place)
  return text ? <OutsideCityChip text={text} className={className} /> : null
}

/**
 * The garage page's and checkout's sentence for a garage in another town
 * ("This garage is in Vellore, about 125 km from you."), or null in the
 * customer's city.
 */
export function useGarageTownLine(garage: PlacedGarage | null | undefined): string | null {
  const { place } = useCustomerPlace()
  return garage ? outsideCityLine(garage, place) : null
}

/**
 * The same sign as one plain sentence, for the garage page and checkout:
 * "This garage is in Vellore, about 125 km from you." The figures are in the
 * numeric face, the words in Inter. `id` lets a control point
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
    <p id={id} className={cn('flex items-start gap-1.5 text-[12px] text-text-secondary', className)}>
      <IconMapPin size={14} aria-hidden="true" className="mt-px shrink-0 text-warning" />
      <span>
        <Figures text={text} />
      </span>
    </p>
  )
}
