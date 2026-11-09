'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { IconChevronDown, IconMapPin } from '@tabler/icons-react'
import { BrandMark } from '@repo/ui/sc/brand-mark'
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
import { useT } from '@repo/core/i18n'

function GarageListContent() {
  const t = useT()
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

  // Under the place, in words: what the pill cannot say in one line.
  const status = locating
    ? t('Finding you…')
    : citywide
      ? permission === 'denied'
        ? t('Location blocked — all of Chennai')
        : t('All of Chennai')
      : location?.source === 'area'
        ? t('Change area')
        : (user?.area ?? t('Showing garages near you'))

  return (
    <CustomerShell showNav className="gap-4 py-4">
      {/* The logo with its red dot lit, and where the list is measured from
          as one raised pill (customer UI round, §3). */}
      <header className="flex items-center justify-between gap-3">
        <span className="brand-glow">
          <BrandMark height={28} priority />
        </span>
        <div className="flex min-w-0 flex-col items-end gap-1">
          {/* The same area sheet as the landing page's "More" (0062): an area
              in one tap, "Near me" behind our explainer, never a cold prompt. */}
          <button
            type="button"
            onClick={() => setAreaOpen(true)}
            disabled={locating}
            aria-label={t('Choose location')}
            aria-describedby="garage-list-place"
            // max-w-full: a button sizes to its label, so without it a long
            // area name pushed the page wider than a 360px phone.
            className="fx-raised fx-press flex h-10 min-w-0 max-w-full items-center gap-1.5 rounded-[12px] pl-2.5 pr-3"
          >
            <IconMapPin size={15} aria-hidden className="shrink-0 text-text-primary" />
            <span className="truncate text-t3 font-semibold text-text-primary">
              {locating ? t('Finding you…') : location && !citywide ? location.label : t('Chennai')}
            </span>
            <IconChevronDown size={13} aria-hidden className="shrink-0 text-[#9A9AA3]" />
          </button>
          {/* Said in the open only when it changes what the list can do; the
              rest is the pill's description for a screen reader. */}
          <p
            id="garage-list-place"
            className={permission === 'denied' && citywide ? 'truncate text-t5 text-text-secondary' : 'sr-only'}
          >
            {status}
          </p>
        </div>
      </header>

      <Toast
        message={
          user?.name
            ? t('Welcome, {name}! Find your first car wash.', { name: user.name })
            : t('Welcome! Find your first car wash.')
        }
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
