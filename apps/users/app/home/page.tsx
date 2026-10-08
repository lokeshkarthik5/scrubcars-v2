'use client'

import { Fragment, Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconArrowsSort,
  IconBuildingStore,
  IconChevronDown,
  IconHome,
  IconMap,
  IconMapPin,
  IconSearch,
} from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScSegmented } from '@repo/ui/sc/segmented'
import {
  SortSheet,
  canSortByRating,
  sortLabel,
  type SortKey,
} from '@repo/ui/sc/sort-sheet'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { Toast } from '@repo/ui/sc/toast'
import { VendorCard } from '@repo/ui/features/vendor-card'
import { Reveal } from '@repo/ui/sc/reveal'
import { useVendorSearch } from '@repo/core/api/hooks/use-vendors'
import { InfiniteSentinel } from '@repo/ui/sc/infinite-sentinel'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useUserStore } from '@repo/core/stores/user-store'
import {
  coarse,
  shouldOfferLocationPrompt,
  useLocationStore,
} from '@repo/core/stores/location-store'
import { LocationPromptSheet } from '@repo/ui/features/location-prompt-sheet'
import { CATEGORY_FILTERS } from '@repo/core/categories'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { cn } from '@repo/core/utils'

type ServiceMode = 'dropin' | 'doorstep'

const CATEGORIES = CATEGORY_FILTERS

type CategoryKey = (typeof CATEGORIES)[number]['key']

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authUser = useAuthStore((s) => s.user)
  const profile = useUserStore((s) => s.profile)
  const fetchProfile = useUserStore((s) => s.fetchProfile)

  const [serviceMode, setServiceMode] = useState<ServiceMode>('dropin')
  const [category, setCategory] = useState<CategoryKey>('all')
  // `null` means "the customer has not chosen", which is what lets the default
  // follow whether we know where they are. Derived rather than set from an
  // effect, so a location fix cannot race a tap on the sort sheet.
  const [chosenSort, setChosenSort] = useState<SortKey | null>(null)
  const [sortOpen, setSortOpen] = useState(false)
  // Derived from the URL rather than synced into state by an effect: the
  // toast is a function of "arrived with ?welcome=1 and hasn't dismissed it",
  // and there is no render in between where the two could disagree. Safe to
  // read during render because this component sits inside the <Suspense>
  // boundary below, so it is never part of the prerendered HTML.
  const [toastDismissed, setToastDismissed] = useState(false)
  const showToast =
    !toastDismissed && searchParams.get('welcome') === '1'

  const location = useLocationStore((s) => s.location)
  const permission = useLocationStore((s) => s.permission)
  const locating = useLocationStore((s) => s.locating)
  const promptDismissedAt = useLocationStore((s) => s.promptDismissedAt)
  const requestGpsLocation = useLocationStore((s) => s.requestGpsLocation)
  const refreshPermission = useLocationStore((s) => s.refreshPermission)
  const [locationSheetOpen, setLocationSheetOpen] = useState(false)

  const user = profile ?? authUser

  // Coordinates are rounded to ~110 m before they leave the device — finer
  // than any sort needs, and enough to keep the server's geocode cache warm.
  const origin = location ? coarse(location) : undefined

  // Distance is the most useful default once we know where the customer is,
  // and impossible before then.
  const sort: SortKey = chosenSort ?? (origin ? 'distance' : 'relevance')

  // Sorting, filtering and paging are all the server's job: the client holds
  // one page at a time and cannot order a list it has not fully seen.
  const {
    vendors,
    appliedRadiusKm,
    hasMore,
    isLoading,
    isRefreshing,
    isFetchingMore,
    isError,
    retry,
    loadMore,
  } = useVendorSearch(
    {
      bookingType: serviceMode,
      category: category === 'all' ? undefined : category,
      lat: origin?.lat,
      lng: origin?.lng,
      sort: origin ? sort : sort === 'distance' ? 'relevance' : sort,
    },
    // A mode, chip or sort change keeps the current garages on screen until
    // the new ones land, instead of collapsing the page to one line of text.
    { keepPrevious: true }
  )

  // Where the located half ends. Only meaningful while an origin is known —
  // without one nothing has a distance, so there is no boundary to mark.
  const firstUnlocatedIndex =
    origin && vendors.some((v) => v.distanceKm !== null)
      ? vendors.findIndex((v) => v.distanceKm === null)
      : -1

  // Knowing the permission state lets the header say whether tapping it will
  // pop a browser prompt or silently do nothing because it was already refused.
  useEffect(() => {
    void refreshPermission()
  }, [refreshPermission])

  useEffect(() => {
    if (authUser) void fetchProfile().catch(() => undefined)
  }, [authUser, fetchProfile])

  // Offered only after results are on screen: the sheet argues "sort these by
  // distance", which needs a list to point at. Prompting before anything has
  // loaded is the cold ask this exists to avoid.
  useEffect(() => {
    if (isLoading || vendors.length === 0) return
    if (!shouldOfferLocationPrompt({ location, permission, promptDismissedAt })) {
      return
    }
    const timer = setTimeout(() => setLocationSheetOpen(true), 1200)
    return () => clearTimeout(timer)
  }, [isLoading, vendors.length, location, permission, promptDismissedAt])


  return (
    <AppShell
      showNav
      showBrand
      className="gap-4 py-4"
      brandRight={
        // Prompted on intent, never on first paint: a cold permission request
        // gets refused a lot, and a refusal is sticky — the browser will not
        // ask again without the user digging through site settings.
        <button
          type="button"
          // Opens our explainer first. Going straight to the browser prompt
          // spends the one ask we get, and a denial cannot be reopened from
          // here — see LocationPromptSheet.
          onClick={() =>
            location ? void requestGpsLocation() : setLocationSheetOpen(true)
          }
          disabled={locating}
          className="min-w-0 text-right"
        >
          <div className="flex items-center justify-end gap-1.5">
            <IconMapPin size={15} className="shrink-0 text-text-primary" />
            <span className="text-[14px] font-semibold text-text-primary">
              {location ? location.label : 'Set location'}
            </span>
          </div>
          <p className="truncate text-[12px] text-text-secondary">
            {locating
              ? 'Finding you…'
              : location
                ? (user?.area ?? 'Showing garages near you')
                : permission === 'denied'
                  ? 'Location blocked — enable in browser settings'
                  : 'Tap to sort garages by distance'}
          </p>
        </button>
      }
    >
      <Toast
        message={`Welcome, ${user?.name ?? 'there'}! Find your first car wash.`}
        visible={showToast}
        onDismiss={() => setToastDismissed(true)}
      />

      <ScSegmented
        aria-label="Service mode"
        value={serviceMode}
        onChange={setServiceMode}
        options={[
          {
            value: 'dropin',
            label: BOOKING_TYPE_LABELS.dropin,
            icon: <IconBuildingStore size={15} />,
          },
          {
            value: 'doorstep',
            label: BOOKING_TYPE_LABELS.doorstep,
            icon: <IconHome size={15} />,
          },
        ]}
      />

      <button
        type="button"
        onClick={() => router.push('/search')}
        className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface px-3.5 py-3 text-left"
      >
        <IconSearch size={17} className="text-text-secondary" />
        <span className="text-[13px] text-text-muted">Search garages or services</span>
      </button>

      {/* The chosen category is a white chip, not a red one: red on this
          screen is kept for things to press, and a solid red "All" was the
          loudest thing above the fold before a single garage had loaded. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={category === c.key}
            onClick={() => setCategory(c.key)}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors',
              category === c.key
                ? 'bg-brand-white text-brand-black'
                : 'bg-surface text-text-primary'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-text-primary">Nearby Garages</h2>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={{
                pathname: '/map',
                query: {
                  bookingType: serviceMode,
                  ...(category === 'all' ? {} : { category }),
                },
              }}
              className="flex items-center gap-1.5 rounded-[9px] bg-surface px-2.5 py-1.5 text-[12px] text-text-secondary"
            >
              <IconMap size={14} />
              Map
            </Link>
            <button
              type="button"
              onClick={() => setSortOpen(true)}
              className="flex items-center gap-1.5 rounded-[9px] bg-surface px-2.5 py-1.5 text-[12px] text-text-secondary"
            >
              <IconArrowsSort size={14} />
              {sortLabel(sort)}
              <IconChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* Said out loud, because a widened search that looks like a normal one
            makes a far garage read as nearby. */}
        {appliedRadiusKm !== null && appliedRadiusKm > 10 && vendors.length > 0 && (
          <p className="text-[11px] text-text-muted">
            Nothing within 10 km — showing garages within {appliedRadiusKm} km.
          </p>
        )}

        {/* Dimmed rather than replaced while a new filter loads. The delay
            means a quick answer never dims at all; the return is immediate. */}
        <div
          aria-busy={isRefreshing || undefined}
          className={cn(
            'flex flex-col gap-3 transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none',
            isRefreshing && 'opacity-60 delay-150'
          )}
        >
          {/* An empty list mid-refresh has no answer yet — "No garages found"
              would be the previous filter's result. */}
          {isLoading || (isRefreshing && vendors.length === 0) ? (
            <p className="py-8 text-center text-[13px] text-text-secondary">
              Finding garages…
            </p>
          ) : isError ? (
            // Not "No garages found": that is a fact about the area, and
            // saying it when the request failed sends people away for good.
            <ErrorState
              message="Couldn't load garages. Check your connection."
              onRetry={retry}
            />
          ) : vendors.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-secondary">
              {serviceMode === 'doorstep' && location
                ? 'No garages travel to your area yet.'
                : 'No garages found nearby.'}
            </p>
          ) : (
            <>
              {vendors.map((vendor, i) => (
                <Fragment key={vendor.id}>
                  {/* The list is really two lists: garages we can measure a
                      distance to, then those still waiting on a pin. Saying so
                      at the boundary beats letting distance-less cards trail
                      off the end of a "Nearest First" list unexplained. */}
                  {i === firstUnlocatedIndex && (
                    <p className="pt-1 text-[11px] text-text-muted">
                      Other garages — location not set yet
                    </p>
                  )}
                  <Reveal index={i}>
                    {/* The mode travels with the tap, so the garage page and
                        checkout open on the choice made here. */}
                    <VendorCard vendor={vendor} mode={serviceMode} />
                  </Reveal>
                </Fragment>
              ))}
              <InfiniteSentinel
                onVisible={loadMore}
                enabled={hasMore}
                loading={isFetchingMore}
              />
            </>
          )}
        </div>
      </section>

      <LocationPromptSheet
        open={locationSheetOpen}
        onClose={() => setLocationSheetOpen(false)}
      />

      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setChosenSort}
        onClose={() => setSortOpen(false)}
        locationUnavailable={!location}
        // No "Top Rated" until a listed garage has a review to rank by.
        ratingAvailable={canSortByRating(vendors, sort, hasMore)}
      />
    </AppShell>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  )
}
