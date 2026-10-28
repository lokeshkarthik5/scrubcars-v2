'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { IconMapPin } from '@tabler/icons-react'
import { CustomerShell } from '@/components/customer-shell'
import { AreaPicker } from '@/components/area/area-picker'
import { ContinueBookingCard } from '@/components/checkout/continue-booking'
import { Toast } from '@repo/ui/sc/toast'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { isCitywide, useLocationStore } from '@repo/core/stores/location-store'
import { parseBookingType } from '@repo/core/booking-types'
import type { BookingType } from '@repo/core/types'
import { GarageList } from './garage-list'

function GarageListContent() {
  const searchParams = useSearchParams()
  const authUser = useAuthStore((s) => s.user)
  const profile = useUserStore((s) => s.profile)
  const fetchProfile = useUserStore((s) => s.fetchProfile)

  // Opens on the mode a link asked for (Home's Book a wash for a car last
  // done at the door, or picked up), and At garage otherwise.
  const [serviceMode, setServiceMode] = useState<BookingType>(
    () => parseBookingType(searchParams.get('mode')) ?? 'dropin'
  )
  // Derived from the URL rather than synced into state by an effect: the
  // toast is a function of "arrived with ?welcome=1 and hasn't dismissed it",
  // and there is no render in between where the two could disagree. Safe to
  // read during render because this component sits inside the <Suspense>
  // boundary below, so it is never part of the prerendered HTML.
  const [toastDismissed, setToastDismissed] = useState(false)
  const showToast = !toastDismissed && searchParams.get('welcome') === '1'

  const location = useLocationStore((s) => s.location)
  const permission = useLocationStore((s) => s.permission)
  const locating = useLocationStore((s) => s.locating)
  const [areaOpen, setAreaOpen] = useState(false)
  const askArea = useCallback(() => setAreaOpen(true), [])

  const user = profile ?? authUser
  const citywide = isCitywide(location)

  useEffect(() => {
    if (authUser) void fetchProfile().catch(() => undefined)
  }, [authUser, fetchProfile])

  return (
    <CustomerShell
      showNav
      showBrand
      className="gap-4 py-4"
      brandRight={
        // The same area sheet as the landing page's "More" (0062): an area
        // in one tap, "Near me" behind our explainer, never a cold prompt.
        <button
          type="button"
          onClick={() => setAreaOpen(true)}
          disabled={locating}
          aria-label="Choose location"
          // max-w-full: a button sizes to its longest line, so without it the
          // one-line status pushed the page wider than a 360px phone instead
          // of being cut short.
          className="min-w-0 max-w-full text-right"
        >
          <div className="flex items-center justify-end gap-1.5">
            <IconMapPin size={15} className="shrink-0 text-text-primary" />
            <span className="text-[14px] font-semibold text-text-primary">
              {location && !citywide ? location.label : 'Chennai'}
            </span>
          </div>
          <p className="truncate text-[12px] text-text-secondary">
            {locating
              ? 'Finding you…'
              : citywide
                ? permission === 'denied'
                  ? 'Location blocked — all of Chennai'
                  : 'All of Chennai'
                : location?.source === 'area'
                  ? 'Change area'
                  : (user?.area ?? 'Showing garages near you')}
          </p>
        </button>
      }
    >
      <Toast
        message={`Welcome, ${user?.name ?? 'there'}! Find your first car wash.`}
        visible={showToast}
        onDismiss={() => setToastDismissed(true)}
      />

      {/* A booking started without signing in and left half way (0062). */}
      <ContinueBookingCard />

      <GarageList
        mode={serviceMode}
        onModeChange={setServiceMode}
        onAskArea={askArea}
      />

      <AreaPicker
        open={areaOpen}
        onClose={() => setAreaOpen(false)}
        mode={serviceMode}
      />
    </CustomerShell>
  )
}

/**
 * The customer's garage list, served at /garages, and at /home too while
 * the new Home is off. Both routes render this one component so they cannot
 * drift apart; with NEXT_PUBLIC_HOME_HUB on (lib/home-hub.ts), /home is the
 * hub and /garages is the list's only home. The landing page renders the
 * same list (GarageList) under its own header.
 */
export function GarageListScreen() {
  return (
    <Suspense>
      <GarageListContent />
    </Suspense>
  )
}
