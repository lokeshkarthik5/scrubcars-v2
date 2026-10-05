'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { IconCalendar, IconDownload, IconNotes } from '@tabler/icons-react'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { ScSelect } from '@repo/ui/sc/select'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminBooking } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  flattenAdminBookingPages,
  useAdminBookings,
} from '@repo/core/api/hooks/use-admin-bookings'
import { useAdminVendors } from '@repo/core/api/hooks/use-admin-vendors'
import { useDebounced } from '@repo/core/hooks/use-debounced'
import { APP_TIMEZONE } from '@repo/core/utils'
import {
  BillDueBadge,
  NoShowBadge,
  RefundedBadge,
  RefundOwedBadge,
  WaitingBadge,
} from '@/components/booking-badges'
import { CopyButton } from '@/components/copy-button'
import { Meta } from '@/components/meta'
import { PhoneLink } from '@/components/phone-link'
import {
  bookingsCsv,
  cancellationLabel,
  formatClock,
  formatRupees,
  formatWhen,
  listQueryForDetail,
  paymentStatusLabel,
} from '@/lib/bookings'

const STATUSES = [
  'all',
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

function BookingRow({
  booking: b,
  listQuery,
}: {
  booking: AdminBooking
  /** The list's filters, carried to the booking so its back arrow returns here. */
  listQuery: string
}) {
  const badge = bookingStatusBadge(b.status)
  const cancelled = cancellationLabel(b)
  const services = b.items.map((item) => item.name).join(', ')

  return (
    // The reference is a stretched link: the whole card opens the booking,
    // while the call links and the copy button sit above it (z-10) and keep
    // their own taps.
    <ScCard className="relative flex flex-col gap-3 transition-colors hover:border-text-muted">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Link
            href={`/bookings/${b.id}${listQuery ? `?back=${encodeURIComponent(listQuery)}` : ''}`}
            aria-label={`Open booking #${b.reference}${b.customer ? ` for ${b.customer.name}` : ''}`}
            className="font-numeric text-[14px] font-semibold text-text-primary after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-text-secondary"
          >
            #{b.reference}
          </Link>
          <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
          {b.waitingMins !== null && <WaitingBadge mins={b.waitingMins} />}
          {b.noShow && <NoShowBadge party={b.noShow} />}
          {b.billDue && <BillDueBadge amount={b.billDue} />}
          {b.refundOwed ? (
            <RefundOwedBadge amount={b.refundOwed} />
          ) : (
            b.refunded && <RefundedBadge />
          )}
          {b.notesCount > 0 && (
            <ScBadge variant="muted">
              <IconNotes size={11} aria-hidden className="mr-1" />
              <span className="font-numeric">{b.notesCount}</span>
              <span className="sr-only">
                {' '}
                {b.notesCount === 1 ? 'note' : 'notes'}
              </span>
            </ScBadge>
          )}
        </div>
        <p className="font-numeric text-[13px] text-text-primary">
          {formatWhen(b.scheduledAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        <Meta label="Garage">
          <p className="truncate text-text-primary">{b.garage?.name ?? '—'}</p>
          {b.garage && (
            <PhoneLink phone={b.garage.phone} name={b.garage.name} />
          )}
        </Meta>
        <Meta label="Customer">
          <p className="truncate text-text-primary">
            {b.customer?.name ?? '—'}
          </p>
          {b.customer && (
            <PhoneLink phone={b.customer.phone} name={b.customer.name} />
          )}
        </Meta>
        <Meta label={b.bookingType === 'doorstep' ? 'Doorstep' : 'At garage'}>
          <p className="line-clamp-2">
            {b.bookingType === 'doorstep'
              ? (b.address ?? 'Address missing')
              : 'Customer comes in'}
          </p>
        </Meta>
        <Meta label="Car">
          <p className="truncate">
            {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : '—'}
          </p>
          {b.vehicle?.plate && (
            <p className="font-numeric text-text-muted">{b.vehicle.plate}</p>
          )}
        </Meta>
        <Meta label={b.items.length > 1 ? 'Services' : 'Service'}>
          <p className="line-clamp-2">{services || '—'}</p>
        </Meta>
        <Meta label="Amount">
          <p className="font-numeric font-medium text-text-primary">
            {formatRupees(b.amount)}
          </p>
        </Meta>
        <Meta label="Payment">
          <p>{paymentStatusLabel(b.payment?.status)}</p>
          {b.payment?.gatewayTxnId && (
            <div className="flex min-w-0 items-center">
              <span className="truncate font-numeric text-text-muted">
                {b.payment.gatewayTxnId}
              </span>
              <CopyButton
                value={b.payment.gatewayTxnId}
                label={`Copy Razorpay payment id ${b.payment.gatewayTxnId}`}
                className="-my-2 shrink-0"
              />
            </div>
          )}
        </Meta>
      </div>

      {cancelled && (
        <div className="border-t border-border pt-2 text-[12px]">
          <p className="font-medium text-text-primary">{cancelled}</p>
          {b.cancellationReason && (
            <p className="mt-0.5 text-text-secondary">{b.cancellationReason}</p>
          )}
        </div>
      )}
    </ScCard>
  )
}

/**
 * The most pages Export CSV loads before giving up on the rest: 50 pages of
 * 100. A month of pilot bookings is a fraction of that; past it, the export
 * says so and asks for a narrower range.
 */
const EXPORT_MAX_PAGES = 50

/** Today in Chennai as YYYY-MM-DD, for the export's filename. */
function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}

/**
 * Saves text as a file. The link is attached to the page while it is
 * clicked and the URL revoked only later: Safari on iOS reads the blob after
 * the click returns, and fails the download if it is already gone.
 */
function downloadCsv(text: string, filename: string) {
  // The byte-order mark makes Excel read the file as UTF-8, so ₹ and Tamil
  // names survive the round trip.
  const blob = new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function BookingsList() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Filters live in the URL, so going back from a booking returns to the same
  // search, and a filtered list can be shared with a colleague.
  const statusParam = params.get('status')
  const status: StatusFilter = isStatusFilter(statusParam) ? statusParam : 'all'
  const vendorId = params.get('garage') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''

  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounced(search.trim(), 350)

  const setParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [params, pathname, router]
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
      status: status === 'all' ? undefined : status,
      vendorId: vendorId || undefined,
      from: rangeReversed ? undefined : from || undefined,
      to: rangeReversed ? undefined : to || undefined,
    }),
    [q, status, vendorId, from, to, rangeReversed]
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
  const bookings = useMemo(() => flattenAdminBookingPages(data?.pages), [data])
  const listQuery = listQueryForDetail(params)

  const { data: vendors = [] } = useAdminVendors()
  const garages = useMemo(
    () =>
      [...vendors].sort((a, b) => a.businessName.localeCompare(b.businessName)),
    [vendors]
  )

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const isFiltered = Boolean(q || status !== 'all' || vendorId || from || to)

  const clearFilters = () => {
    setSearch('')
    router.replace(pathname, { scroll: false })
  }

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

      const rows = flattenAdminBookingPages(pages)
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
        <ScInput
          id="booking-search"
          type="search"
          aria-label="Search bookings"
          placeholder="Reference, receipt no., phone, customer or garage"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-11"
        />

        <div
          role="group"
          aria-label="Status"
          className="flex flex-wrap gap-1.5"
        >
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={s === 'all' ? 'All' : bookingStatusBadge(s).label}
              active={status === s}
              onClick={() => setParams({ status: s === 'all' ? '' : s })}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <ScSelect
              id="booking-garage"
              label="Garage"
              value={vendorId}
              onChange={(e) => setParams({ garage: e.target.value })}
              className="min-h-11"
            >
              <option value="">All garages</option>
              {garages.map((garage) => (
                <option key={garage.id} value={garage.id}>
                  {garage.businessName}
                </option>
              ))}
            </ScSelect>
          </div>
          <ScInput
            id="booking-from"
            type="date"
            label="From"
            value={from}
            max={to || undefined}
            onChange={(e) => setParams({ from: e.target.value })}
            className="min-h-11"
          />
          <ScInput
            id="booking-to"
            type="date"
            label="To"
            value={to}
            min={from || undefined}
            onChange={(e) => setParams({ to: e.target.value })}
            className="min-h-11"
          />
        </div>

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

        {!isPending && !(error && bookings.length === 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-secondary">
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
            {isFiltered && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-11 px-1 font-medium text-text-primary underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {isPending ? (
        <SkeletonList count={3} itemClassName="h-44" />
      ) : error && bookings.length === 0 ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load bookings')}
          onRetry={() => void refetch()}
        />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={<IconCalendar size={32} stroke={1.5} />}
          title="No bookings found"
          subtitle={
            isFiltered
              ? 'Nothing matches these filters. Try a reference, a receipt number, a phone number or a name.'
              : 'Bookings will appear here once customers start booking.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {bookings.map((b, i) => (
            <Reveal key={b.id} index={i}>
              <BookingRow booking={b} listQuery={listQuery} />
            </Reveal>
          ))}

          {hasNextPage && (
            <ScButton
              variant="secondary"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
              className="min-h-11"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </ScButton>
          )}
        </div>
      )}
    </>
  )
}

export default function AdminBookingsPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to
  // prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={2} itemClassName="h-44" />}>
      <BookingsList />
    </Suspense>
  )
}
