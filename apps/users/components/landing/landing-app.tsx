'use client'

import { useState } from 'react'
import { AreaChips } from '@/components/area/area-chips'
import { ContinueBookingCard } from '@/components/checkout/continue-booking'
import { GarageList } from '@/components/garages/garage-list'
import type { VendorListResult } from '@repo/core/api/vendors'
import type { BookingType } from '@repo/core/types'

/**
 * The live half of the landing page (customer reach, 0062): a booking left
 * half way, "Where's your car?", then the garage list with its first page
 * already in the HTML. Reads no URL query (so nothing here waits for the
 * browser): the page stays static and paints its garages at once.
 */
export function LandingApp({ initialPage }: { initialPage: VendorListResult | null }) {
  const [mode, setMode] = useState<BookingType>('dropin')
  return (
    <>
      <ContinueBookingCard />
      <AreaChips mode={mode} />
      <GarageList
        mode={mode}
        onModeChange={setMode}
        showSearch={false}
        animateCards={false}
        initialPage={initialPage ?? undefined}
      />
    </>
  )
}
