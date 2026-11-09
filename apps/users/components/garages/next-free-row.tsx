'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconClock } from '@tabler/icons-react'
import { useNextFree } from '@repo/core/api/hooks/use-next-free'
import { bookingTypeParam } from '@repo/core/booking-types'
import { nextFreeDayLabel, nextFreeTimeLabels, upcomingNextFree } from '@repo/core/next-free'
import type { BookingType, Vendor } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { RedLight } from '@repo/ui/finish/red-light'

/**
 * A card's "Next free" row (§3, §9): "NEXT FREE · TODAY" and the next three
 * times as buttons. Asked for only once the card is on screen, together
 * with every other card that came into view at the same moment (one request
 * for the screen, useNextFree). A time opens checkout on this garage with
 * it picked (`slot`), which checkout keeps if it is still free and
 * otherwise says so, as for any time that was just taken.
 *
 * Nothing at all while it loads, fails, or the garage has no time this week:
 * a row of "no times" would read as "fully booked", which it may not be.
 */
export function NextFreeRow({
  vendor,
  mode,
  visible,
}: {
  vendor: Vendor
  mode: BookingType
  visible: boolean
}) {
  const next = useNextFree(vendor.id, mode, visible)
  const [picked, setPicked] = useState<string | null>(null)
  const free = upcomingNextFree(next.data)
  if (!free) return null

  const day = nextFreeDayLabel(free)
  const labels = nextFreeTimeLabels(free)
  const modeParam = bookingTypeParam(mode)

  return (
    <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-0.5">
      <p className="flex items-center gap-1.5">
        <IconClock size={14} aria-hidden className="text-success drop-shadow-[0_0_4px_rgb(34_197_94/0.5)]" />
        <span className="text-over font-semibold uppercase text-[#9A9AA3]">Next free</span>
        <span aria-hidden="true" className="text-over text-[#8E8E98]">·</span>
        <span className="text-over font-semibold uppercase text-[#E8E8EC]">{day}</span>
      </p>
      <div className="flex gap-2">
        {free.times.map((time, i) => {
          const query = new URLSearchParams()
          if (modeParam) query.set('mode', modeParam)
          query.set('slot', time)
          return (
            <Link
              key={time}
              data-slot=""
              href={`/book/${vendor.id}?${query.toString()}`}
              onClick={() => setPicked(time)}
              aria-label={`Book ${vendor.name}, ${day} at ${labels[i]}`}
              style={{ '--fx-i': i } as React.CSSProperties}
              className={cn(
                'showroom__slot fx-press relative flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-[12px] px-1.5 font-numeric text-t4 font-semibold',
                picked === time ? 'fx-graphite text-white' : 'fx-raised text-[#E8E8EC]'
              )}
            >
              {labels[i]}
              <RedLight state={picked === time ? 'on' : 'off'} className="absolute bottom-1 left-1/2 -ml-2.5" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
