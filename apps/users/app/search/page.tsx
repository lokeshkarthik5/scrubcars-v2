'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { IconAdjustments, IconSearch } from '@tabler/icons-react'
import { CustomerShell } from '@/components/customer-shell'
import { FilterChip } from '@repo/ui/sc/chip'
import {
  SortSheet,
  canSortByRating,
  sortLabel,
  type SortKey,
} from '@repo/ui/sc/sort-sheet'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { VendorCard } from '@repo/ui/features/vendor-card'
import { SaveGarageButton } from '@/components/favourites/save-garage-button'
import { Reveal } from '@repo/ui/sc/reveal'
import { useVendorSearch } from '@repo/core/api/hooks/use-vendors'
import { browseCategory } from '@repo/core/analytics-events'
import { track } from '@repo/core/analytics'
import { InfiniteSentinel } from '@repo/ui/sc/infinite-sentinel'
import { useDebounced } from '@repo/core/hooks/use-debounced'
import { coarse, useLocationStore } from '@repo/core/stores/location-store'
import { cn } from '@repo/core/utils'

// Quick-access shortcuts for the most-used sorts. The Filter button opens the
// sheet with the full set, and both drive the same `sort` state so the chip
// highlight always reflects what the list is actually ordered by.
const SORT_CHIPS: { label: string; value: SortKey }[] = [
  { label: 'Nearest', value: 'distance' },
  { label: 'Rating', value: 'rating' },
  { label: 'Price', value: 'price_asc' },
]

function SearchContent() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('relevance')
  const [sortOpen, setSortOpen] = useState(false)
  const location = useLocationStore((s) => s.location)
  // Without this, every keystroke is a fresh paged query.
  const debouncedQuery = useDebounced(query, 300)
  const category = searchParams.get('category') ?? undefined
  const origin = location ? coarse(location) : undefined

  // Each settled search: its category and how long the text was. Never the
  // text itself.
  const searchedLength = debouncedQuery.trim().length
  useEffect(() => {
    if (searchedLength > 0) {
      track('search', { category: browseCategory(category), queryLength: Math.min(200, searchedLength) })
    }
  }, [debouncedQuery, searchedLength, category])

  // Filtering, sorting and paging all happen in SQL — the client holds one page
  // and cannot order a list it has only partly seen.
  const {
    vendors,
    hasMore,
    isLoading,
    isRefreshing,
    isFetchingMore,
    isError,
    retry,
    loadMore,
  } = useVendorSearch(
    {
      q: debouncedQuery || undefined,
      category,
      lat: origin?.lat,
      lng: origin?.lng,
      // Falling back off 'distance' matters: without an origin the server
      // rejects it, and a rejected browse is worse than an unsorted one.
      sort: origin ? sort : sort === 'distance' ? 'relevance' : sort,
    },
    // Each keystroke and sort change keeps the last results up until the new
    // ones arrive, so typing does not blink the list out between letters.
    { keepPrevious: true }
  )

  // No "Rating" chip until a listed garage has a review to rank by.
  const ratingAvailable = canSortByRating(vendors, sort, hasMore)
  // A refresh still in flight over an empty list has no answer yet: "0 found"
  // and "No garages match" would describe the previous query, not this one.
  const awaitingFirstAnswer = isLoading || (isRefreshing && vendors.length === 0)
  const sortChips = SORT_CHIPS.filter(
    (chip) => chip.value !== 'rating' || ratingAvailable
  )

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5">
        <IconSearch size={18} aria-hidden="true" className="shrink-0 text-text-muted" />
        {/* A garage is found by its name, its area or any service it sells,
            so the box says both. The label is its own attribute: a
            placeholder disappears the moment someone types. */}
        <input
          type="search"
          placeholder="Search garages or services"
          aria-label="Search garages or services"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-[13px] text-text-primary outline-none"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {sortChips.map((chip) => (
          <FilterChip
            key={chip.value}
            label={chip.label}
            active={sort === chip.value}
            // Tapping the active chip clears back to the default order.
            onClick={() => setSort(sort === chip.value ? 'relevance' : chip.value)}
          />
        ))}
        <button
          type="button"
          onClick={() => setSortOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
        >
          <IconAdjustments size={14} />
          Filter
        </button>
      </div>

      {/* The count and the list are one answer, so they dim together while a
          new one loads. The delay means a quick answer never dims at all. */}
      <div
        aria-busy={isRefreshing || undefined}
        className={cn(
          'flex flex-col gap-4 transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none',
          isRefreshing && 'opacity-60 delay-150'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Held back until the first page is in: "0 garages found" above
              "Searching…" was the page contradicting itself. Likewise above
              a failed load, where nothing was found or not found. */}
          {!awaitingFirstAnswer && !isError && (
            <p className="text-[11px] text-text-secondary">
              {/* "20+" rather than "20": the count is what has been paged in so
                  far, not the size of the result set, and stating it flatly
                  would be a number the next scroll contradicts. */}
              {vendors.length}
              {hasMore ? '+' : ''} garage{vendors.length === 1 && !hasMore ? '' : 's'} found
            </p>
          )}
          {sort !== 'relevance' && (
            <p className="ml-auto text-[11px] text-text-secondary">
              Sorted by {sortLabel(sort)}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {awaitingFirstAnswer ? (
            <p className="py-6 text-center text-[13px] text-text-secondary">
              Searching…
            </p>
          ) : isError ? (
            <ErrorState
              message="Couldn't load garages. Check your connection."
              onRetry={retry}
            />
          ) : vendors.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-secondary">
              No garages or services match your search.
            </p>
          ) : (
            <>
              {vendors.map((vendor, i) => (
                <Reveal key={vendor.id} index={i}>
                  <VendorCard vendor={vendor} action={<SaveGarageButton vendor={vendor} />} />
                </Reveal>
              ))}
              <InfiniteSentinel
                onVisible={loadMore}
                enabled={hasMore}
                loading={isFetchingMore}
              />
            </>
          )}
        </div>
      </div>

      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setSort}
        onClose={() => setSortOpen(false)}
        locationUnavailable={!location}
        ratingAvailable={ratingAvailable}
      />
    </CustomerShell>
  )
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  )
}
