'use client'

import { IconBuildingStore, IconCarGarage, IconHome } from '@tabler/icons-react'
import { GraphiteSwitch } from '@repo/ui/finish/graphite-switch'
import { track } from '@repo/core/analytics'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import type { BookingType } from '@repo/core/types'
import { msg, useT } from '@repo/core/i18n'

const ICONS: Record<BookingType, typeof IconHome> = {
  dropin: IconBuildingStore,
  doorstep: IconHome,
  pickup: IconCarGarage,
}

/** Each mode's quiet second line (§3): what it means in four words. */
export const MODE_QUIET: Record<BookingType, string> = {
  dropin: msg('Drive it in'),
  doorstep: msg('We come to you'),
  pickup: msg('We collect it'),
}

/**
 * The At garage / Doorstep / Pickup & drop switch on a garage's page and the
 * booking page (customer UI round, §5, §6): the graphite switch of the
 * garages list, with the same names (BOOKING_TYPE_LABELS), the quiet lines
 * and only the modes given, in that order.
 *
 * A radiogroup, as before, named "Service mode"; each radio is named by its
 * mode alone ("Doorstep"). On the garage page a tap to another mode records
 * mode_switch (usage events), as it always has; checkout's never did.
 */
export function ModeSwitch({
  modes,
  value,
  onChange,
  track: tracked = true,
  className,
}: {
  modes: readonly BookingType[]
  value: BookingType
  onChange: (mode: BookingType) => void
  /** Off at checkout, whose switch never recorded mode_switch. */
  track?: boolean
  className?: string
}) {
  const t = useT()
  return (
    <GraphiteSwitch
      aria-label={t('Service mode')}
      className={className}
      value={value}
      onChange={(mode) => {
        // Statistics → Behaviour's "switched tab": a tap to another one.
        if (tracked && mode !== value) track('mode_switch', { mode })
        onChange(mode)
      }}
      options={modes.map((mode) => {
        const Icon = ICONS[mode]
        return {
          value: mode,
          label: t(BOOKING_TYPE_LABELS[mode]),
          quiet: t(MODE_QUIET[mode]),
          icon: <Icon aria-hidden />,
        }
      })}
    />
  )
}
