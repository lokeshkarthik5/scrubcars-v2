'use client'

import { IconBuildingStore, IconCarGarage, IconHome } from '@tabler/icons-react'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import type { BookingType } from '@repo/core/types'

const ICONS: Record<BookingType, typeof IconHome> = {
  dropin: IconBuildingStore,
  doorstep: IconHome,
  pickup: IconCarGarage,
}

/**
 * The At garage / Doorstep / Pickup & drop switch on the garage list and a
 * garage's page: one look, one set of names (BOOKING_TYPE_LABELS), in the
 * order given.
 *
 * With three choices on a 360px phone each gets about 106px, which "Pickup &
 * drop" fills on its own, so the icons step aside below 400px wide rather
 * than wrap the label onto two lines. Two choices keep their icons always.
 */
export function ModeSwitch({
  modes,
  value,
  onChange,
  className,
}: {
  modes: readonly BookingType[]
  value: BookingType
  onChange: (mode: BookingType) => void
  className?: string
}) {
  const tight = modes.length > 2
  return (
    <ScSegmented
      aria-label="Service mode"
      className={className}
      value={value}
      onChange={onChange}
      options={modes.map((mode) => {
        const Icon = ICONS[mode]
        return {
          value: mode,
          label: <span className="whitespace-nowrap">{BOOKING_TYPE_LABELS[mode]}</span>,
          icon: (
            <Icon
              size={15}
              aria-hidden
              className={tight ? 'hidden shrink-0 min-[400px]:block' : 'shrink-0'}
            />
          ),
        }
      })}
    />
  )
}
