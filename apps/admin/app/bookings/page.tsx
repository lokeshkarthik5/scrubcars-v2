'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import {
  IconAdjustmentsHorizontal,
  IconCalendar,
  IconDownload,
  IconX,
} from '@tabler/icons-react'
import { bookingStatusBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminBooking } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  flattenAdminBookingPages,
  useAdminBookings,
  useAdminBookingViewCounts,
} from '@repo/core/api/hooks/use-admin-bookings'
import { useAdminVendors } from '@repo/core/api/hooks/use-admin-vendors'
import { useDebounced } from '@repo/core/hooks/use-debounced'
import { useNow } from '@repo/core/hooks/use-now'
import {
  AdminTable,
  ColumnsButton,
  FilterBar,
  SavedViews,
  useHiddenColumns,
} from '@/components/table'
import { groupRows } from '@/lib/admin-table'
import { bookingNextStep, bookingRowTone } from '@/lib/booking-next-step'
import {
  PAYMENT_FILTERS,
  TODAY_GROUPS,
  TYPE_FILTERS,
  emptyViewText,
  matchesView,
  parsePaymentFilter,
  parseTypeFilter,
  parseView,
  todayGroup,
  viewFilter,
  viewParam,
  viewsUnsupported,
  viewsWithCounts,
} from '@/lib/booking-views'
import {
  bookingsCsv,
  downloadCsv,
  formatClock,
  listQueryForDetail,
  todayIst,
} from '@/lib/bookings'
import { isInBin } from '@/lib/vendor-list'
import { BOOKING_OPTIONAL_COLUMNS, bookingColumns } from './booking-columns'
import { BookingSidePanel } from './booking-side-panel'

/** The old status chips' values: a link that names one still filters by it. */
const STATUSES = [
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
] as const
type StatusFilter = (typeof STATUSES)[number]

function isStatusFilter(value: string | null): value is StatusFilter {
  return (STATUSES as readonly (string | null)[]).includes(value)
}

/**
 * The most pages Export CSV loads before giving up on the rest: 50 pages of
 * 100. A month of pilot bookings is a fraction of that; past it, the export
 * says so and asks for a narrower range.
 */
const EXPORT_MAX_PAGES = 50

const FIELD =
  'min-h-11 rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-text-secondary md:min-h-9'
/** A filter that is on: outlined like a pressed chip. */
const ACTIVE_FIELD = 'border-text-primary text-text-primary'

function BookingsList() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Filters live in the URL, so going back from a booking returns to the same
  // search, and a filtered list can be shared with a colleague.
  const statusParam = params.get('status')
  const status = isStatusFilter(statusParam) ? statusParam : null
  const vendorId = params.get('garage') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  // Bookings the team marked Test: on their own, when the chip is on.
  const testOnly = params.get('test') === 'only'
  // How the car is served, and how it is paid (mockup 03's chips).
  const bookingType = parseTypeFilter(params.get('type'))
  const payment = parsePaymentFilter(params.get('payment'))

  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounced(search.trim(), 350)

  // A search that arrives in the address while the page is open ("Find
  // anything" from here, Back and Forward) fills the box too. Adjusted
  // during render, as React advises for state that follows a prop; the
  // page's own writes of its search come back equal and change nothing.
  const urlQ = params.get('q') ?? ''
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ)
  if (urlQ !== seenUrlQ) {
    setSeenUrlQ(urlQ)
    if (urlQ !== q) setSearch(urlQ)
  }

  // The saved view (0059): Needs action to start with, All while searching.
  const view = parseView(params.get('view'), urlQ)

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      const query = next.toString()
      // Replaced, not pushed: a filter is a view of this page, not
      // somewhere Back should step through. The browser's own history,
      // which useSearchParams follows: router.replace() asks the server for
      // the page again, and once the sidebar's links have been prefetched
      // Next dropped that navigation, so a filter pressed then did nothing.
      window.history.replaceState(
        null,
        '',
        query ? `${pathname}?${query}` : pathname
      )
    },
    [params, pathname]
  )

  // The search box is typed into freely; only the settled text reaches the
  // URL, once typing pauses. Synced on a change of the text alone — keyed on
  // the URL too, a cleared filter would be written straight back by a
  // debounce still holding the old text.
  const syncedQ = useRef(q)
  useEffect(() => {
    if (syncedQ.current === q) return
    syncedQ.current = q
    setParams({ q })
  }, [q, setParams])

  // A reversed range is a typo, not a query. It is left out until fixed,
  // rather than sent for the server to refuse.
  const rangeReversed = Boolean(from && to && from > to)

  const filters = useMemo(
    () => ({
      q: q || undefined,
      status: status ?? undefined,
      vendorId: vendorId || undefined,
      from: rangeReversed ? undefined : from || undefined,
      to: rangeReversed ? undefined : to || undefined,
      test: testOnly ? ('only' as const) : undefined,
      bookingType: bookingType ?? undefined,
      payment: payment ?? undefined,
      view: viewFilter(view),
    }),
    [
      q,
      status,
      vendorId,
      from,
      to,
      rangeReversed,
      testOnly,
      bookingType,
      payment,
      view,
    ]
  )

  const {
    data,
    isPending,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    dataUpdatedAt,
  } = useAdminBookings(filters)
  const loaded = useMemo(() => flattenAdminBookingPages(data?.pages), [data])

  // How many each view holds, under every other filter on the list, so a
  // view's count is the rows it shows. Never holds up the list; an API older
  // than the views (404) shows them without counts, and the view is applied
  // to the loaded rows here, since that API ignores it.
  const counts = useAdminBookingViewCounts({
    q: filters.q,
    status: filters.status,
    vendorId: filters.vendorId,
    from: filters.from,
    to: filters.to,
    test: filters.test,
    bookingType: filters.bookingType,
    payment: filters.payment,
  })
  const unsupported = viewsUnsupported(counts.error)
  const now = useNow(30_000)
  const bookings = useMemo(
    () =>
      unsupported ? loaded.filter((b) => matchesView(b, view, now)) : loaded,
    [unsupported, loaded, view, now]
  )

  // The list's filters for a booking's back arrow, with the view.
  const listQuery = useMemo(() => {
    const query = new URLSearchParams(listQueryForDetail(params))
    const chosen = params.get('view')
    if (chosen) query.set('view', chosen)
    return query.toString()
  }, [params])

  const { data: vendors = [] } = useAdminVendors()
  // Garages in the Bin are left out of the filter, as of every other picker:
  // they are on their way out. One already chosen (a link from before it
  // went there) stays, so the filter never shows a blank.
  const garages = useMemo(
    () =>
      vendors
        .filter((v) => !isInBin(v) || v.id === vendorId)
        .sort((a, b) => a.businessName.localeCompare(b.businessName)),
    [vendors, vendorId]
  )

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const isFiltered = Boolean(
    q || status || vendorId || from || to || testOnly || bookingType || payment
  )
  // The phone's Filter button: how many of the folded filters are on.
  const activeFilters = [
    status,
    testOnly,
    vendorId,
    from,
    to,
    bookingType,
    payment,
  ].filter(Boolean).length

  // Garage and dates sit behind More filters, open while one is set.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreSet = [vendorId, from, to].filter(Boolean).length
  const moreShown = moreOpen || moreSet > 0

  // The columns this browser turned off.
  const [hiddenColumns, toggleColumn] = useHiddenColumns(
    'detlio.admin.bookings.columns',
    BOOKING_OPTIONAL_COLUMNS
  )
  const clearFilters = () => {
    setSearch('')
    window.history.replaceState(null, '', pathname)
  }

  // The booking open in the side panel, while it is still in the list.
  const [openId, setOpenId] = useState<string | null>(null)
  const openBooking = bookings.find((b) => b.id === openId) ?? null
  const closePanel = useCallback(() => setOpenId(null), [])

  const [exporting, setExporting] = useState(false)

  // "The current filtered rows" means every booking that matches, not just
  // the pages loaded so far, so the rest are fetched first. A sheet that is
  // quietly short is worse than no sheet: it gets used for payouts.
  const exportCsv = async () => {
    setExporting(true)
    try {
      let pages = data?.pages
      let more = hasNextPage
      while (more && (pages?.length ?? 0) < EXPORT_MAX_PAGES) {
        const next = await fetchNextPage()
        if (next.isFetchNextPageError) {
          toast.error(
            "Couldn't load every matching booking, so nothing was exported. Try again."
          )
          return
        }
        pages = next.data?.pages
        more = next.hasNextPage
      }

      const rows = flattenAdminBookingPages(pages).filter(
        (b) => !unsupported || matchesView(b, view, Date.now())
      )
      downloadCsv(bookingsCsv(rows), `detlio-bookings-${todayIst()}.csv`)
      if (more) {
        toast.warn(
          `Exported the first ${rows.length} bookings. Narrow the dates to export the rest.`
        )
      }
    } finally {
      setExporting(false)
    }
  }

  // Stale rows beat an error screen: a refresh that fails on a network blip
  // keeps what was there, with a line saying so, until the next one works.
  const refreshFailed = Boolean(error) && bookings.length > 0

  const columns = useMemo(
    () => bookingColumns({ listQuery, now }),
    [listQuery, now]
  )

  // Today, grouped (mockup 03): what needs a call first, then the rest on
  // track, each in time order.
  const groupOf = useCallback(
    (b: AdminBooking) =>
      todayGroup(view, bookingRowTone(bookingNextStep(b, now))),
    [view, now]
  )
  const rows = useMemo(
    () =>
      view === 'today' ? groupRows(bookings, groupOf, TODAY_GROUPS) : bookings,
    [view, bookings, groupOf]
  )

  return (
    <>
      <PageHeader
        title="Bookings"
        actions={
          <ScButton
            variant="secondary"
            fullWidth={false}
            disabled={bookings.length === 0 || exporting}
            onClick={() => void exportCsv()}
            className="flex min-h-11 items-center gap-1.5 px-4 text-[13px]"
          >
            <IconDownload size={16} aria-hidden />{' '}
            {exporting ? 'Preparing…' : 'Export CSV'}
          </ScButton>
        }
      />

      <div className="flex flex-col gap-3">
        <SavedViews
          label="Views"
          views={viewsWithCounts(unsupported ? null : counts.data)}
          value={view}
          onChange={(next) => {
            setOpenId(null)
            setParams({ view: viewParam(next, urlQ) })
          }}
          trailing={
            view === 'needs_action' ? (
              <span className="shrink-0 text-[12px] text-text-muted md:ml-auto">
                Test bookings left out
              </span>
            ) : undefined
          }
        />

        <FilterBar
          search={{
            id: 'booking-search',
            label: 'Search bookings',
            placeholder: 'Reference, receipt no., phone, customer or garage',
            value: search,
            onChange: setSearch,
          }}
          activeCount={activeFilters}
          trailing={
            <>
              {isFiltered && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-11 px-1 font-medium text-text-primary underline-offset-2 hover:underline md:min-h-9"
                >
                  Clear filters
                </button>
              )}
              <ColumnsButton
                columns={BOOKING_OPTIONAL_COLUMNS}
                hidden={hiddenColumns}
                onToggle={toggleColumn}
              />
            </>
          }
        >
          <select
            id="booking-type"
            aria-label="Type"
            value={bookingType ?? ''}
            onChange={(e) => setParams({ type: e.target.value || null })}
            className={cn(FIELD, bookingType && ACTIVE_FIELD)}
          >
            <option value="">Type: any</option>
            {TYPE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            id="booking-payment"
            aria-label="Payment"
            value={payment ?? ''}
            onChange={(e) => setParams({ payment: e.target.value || null })}
            className={cn(FIELD, payment && ACTIVE_FIELD)}
          >
            <option value="">Payment: any</option>
            {PAYMENT_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FilterChip
            label="Test bookings"
            active={testOnly}
            onClick={() => setParams({ test: testOnly ? '' : 'only' })}
            className="min-h-11 rounded-[8px] md:min-h-9"
          />
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreShown}
            aria-controls="booking-more-filters"
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-[8px] border px-3 text-[12px] font-medium transition-colors md:min-h-9',
              moreSet > 0
                ? 'border-text-primary text-text-primary'
                : 'border-border text-text-secondary hover:text-text-primary'
            )}
          >
            <IconAdjustmentsHorizontal size={14} aria-hidden="true" />
            More filters
            {moreSet > 0 && <span className="font-numeric">· {moreSet}</span>}
          </button>
          {moreShown && (
            <div
              id="booking-more-filters"
              role="group"
              aria-label="More filters"
              className="flex flex-wrap items-center gap-2"
            >
              <select
                id="booking-garage"
                aria-label="Garage"
                value={vendorId}
                onChange={(e) => setParams({ garage: e.target.value })}
                className={FIELD}
              >
                <option value="">Garage: any</option>
                {garages.map((garage) => (
                  <option key={garage.id} value={garage.id}>
                    {isInBin(garage)
                      ? `${garage.businessName} (in the Bin)`
                      : garage.businessName}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                From
                <input
                  id="booking-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setParams({ from: e.target.value })}
                  className={FIELD}
                />
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                To
                <input
                  id="booking-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setParams({ to: e.target.value })}
                  className={FIELD}
                />
              </label>
            </div>
          )}
          {/* An old link's status chip, removable. */}
          {status && (
            <button
              type="button"
              onClick={() => setParams({ status: null })}
              aria-label={`Remove the ${bookingStatusBadge(status).label} filter`}
              className="inline-flex min-h-11 items-center gap-1 rounded-[8px] border border-text-primary px-2.5 text-[12px] font-medium text-text-primary md:min-h-9"
            >
              {bookingStatusBadge(status).label}
              <IconX size={13} aria-hidden="true" />
            </button>
          )}
        </FilterBar>

        {rangeReversed && (
          <p className="text-[12px] text-error">
            The start date is after the end date, so the dates aren&apos;t
            applied.
          </p>
        )}

        {refreshFailed && (
          <p role="status" className="text-[12px] text-error">
            Couldn&apos;t refresh. Showing bookings as of{' '}
            <span className="font-numeric">{formatClock(dataUpdatedAt)}</span>.
          </p>
        )}

        {isPending ? (
          <SkeletonList count={3} itemClassName="h-14" />
        ) : error && bookings.length === 0 ? (
          <ErrorState
            message={errorMessage(error, 'Failed to load bookings')}
            onRetry={() => void refetch()}
          />
        ) : bookings.length === 0 && !hasNextPage ? (
          <EmptyState
            icon={<IconCalendar size={32} stroke={1.5} />}
            title={
              view === 'needs_action' && !isFiltered
                ? 'All clear'
                : 'No bookings found'
            }
            subtitle={emptyViewText(view, isFiltered)}
          />
        ) : (
          <div className="flex items-start gap-4">
            <AdminTable<AdminBooking>
              caption="Bookings"
              className="min-w-0 flex-1"
              rows={rows}
              columns={columns}
              hiddenColumns={hiddenColumns}
              groupOf={view === 'today' ? groupOf : undefined}
              rowKey={(b) => b.id}
              rowLabelId={(b) => `booking-${b.id}-ref`}
              toneOf={(b) => bookingRowTone(bookingNextStep(b, now))}
              openKey={openId}
              onOpen={(b) => setOpenId(b ? b.id : null)}
              openLabel={(b) => `Details for #${b.reference}`}
              empty={emptyViewText(view, isFiltered)}
              footer={
                <>
                  <p>
                    <span className="font-numeric">{bookings.length}</span>
                    {hasNextPage ? '+' : ''} shown
                    {dataUpdatedAt > 0 && (
                      <>
                        {' '}
                        · updated{' '}
                        <span className="font-numeric">
                          {formatClock(dataUpdatedAt)}
                        </span>
                        , refreshes every 30 seconds
                      </>
                    )}
                  </p>
                  {hasNextPage && (
                    <ScButton
                      variant="secondary"
                      fullWidth={false}
                      disabled={isFetchingNextPage}
                      onClick={() => void fetchNextPage()}
                      className="min-h-10 px-4 text-[13px]"
                    >
                      {isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </ScButton>
                  )}
                </>
              }
            />
            <BookingSidePanel
              booking={openBooking}
              listQuery={listQuery}
              now={now}
              onClose={closePanel}
            />
          </div>
        )}
      </div>
    </>
  )
}

export default function AdminBookingsPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to
  // prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={2} itemClassName="h-14" />}>
      <BookingsList />
    </Suspense>
  )
}
