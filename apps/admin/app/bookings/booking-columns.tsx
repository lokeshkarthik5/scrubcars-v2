'use client'

import Link from 'next/link'
import { IconNotes } from '@tabler/icons-react'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import type { AdminBooking } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import { TestBadge } from '@/components/booking-badges'
import type { AdminTableColumn, OptionalColumn } from '@/components/table'
import { bookingNextStep } from '@/lib/booking-next-step'
import { bookingTypeLabel, formatRupees, formatWhen } from '@/lib/bookings'
import { URGENCY_TEXT } from '@/lib/format'

/** Where a booking opens, with the list's filters for its back arrow. */
export function bookingHref(
  b: Pick<AdminBooking, 'id'>,
  listQuery: string
): string {
  return `/bookings/${b.id}${listQuery ? `?back=${encodeURIComponent(listQuery)}` : ''}`
}

/**
 * The Bookings table's columns the Columns button can turn off: Garage and
 * Status, shown to start with, and Type, off. The ones a phone row is made
 * of (customer, slot, amount, next step) always show.
 */
export const BOOKING_OPTIONAL_COLUMNS: OptionalColumn[] = [
  { id: 'garage', header: 'Garage' },
  { id: 'type', header: 'Type', defaultHidden: true },
  { id: 'status', header: 'Status' },
]

/**
 * The Bookings table's columns (mockup 03): Ref · When · Customer · Garage ·
 * (Type) · Amount · Status · Next step. On a phone a row is the customer and the
 * slot, with the amount and the next step on the right; a tap opens the
 * side panel, which links to the full page.
 */
export function bookingColumns({
  listQuery,
  now,
}: {
  listQuery: string
  now: number
}): AdminTableColumn<AdminBooking>[] {
  return [
    {
      id: 'ref',
      header: 'Ref',
      width: '120px',
      cell: (b) => (
        <span className="flex items-center gap-1.5">
          {/* Named for the row, and what it opens; it still goes to the
              booking's own page. */}
          <Link
            id={`booking-${b.id}-ref`}
            href={bookingHref(b, listQuery)}
            aria-label={`Open booking #${b.reference}${b.customer ? ` for ${b.customer.name}` : ''}`}
            className="font-numeric text-[13px] font-semibold text-text-primary underline-offset-2 hover:underline"
          >
            #{b.reference}
          </Link>
          {b.markedTest && <TestBadge />}
        </span>
      ),
    },
    {
      id: 'when',
      header: 'When',
      phone: 'subtitle',
      cell: (b) => (
        <span className="whitespace-nowrap font-numeric max-md:text-[12px] max-md:text-text-secondary">
          {formatWhen(b.scheduledAt)}
        </span>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      phone: 'title',
      cell: (b) => (
        <span className="block max-w-[200px] truncate font-medium max-md:max-w-none">
          {b.customer?.name ?? '—'}
        </span>
      ),
    },
    {
      id: 'garage',
      header: 'Garage',
      cell: (b) => (
        <span className="block max-w-[200px] truncate text-text-secondary">
          {b.garage?.name ?? '—'}
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: (b) => (
        <span className="whitespace-nowrap text-text-secondary">
          {bookingTypeLabel(b.bookingType)}
        </span>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      align: 'end',
      phone: 'aside',
      cell: (b) => (
        <span className="whitespace-nowrap font-numeric font-medium">
          {formatRupees(b.amount)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (b) => {
        const badge = bookingStatusBadge(b.status)
        return (
          <span className="flex items-center gap-1">
            <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
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
          </span>
        )
      },
    },
    {
      id: 'next',
      header: 'Next step',
      phone: 'asideSub',
      cell: (b) => {
        const step = bookingNextStep(b, now)
        if (!step) {
          // On a phone, where Status is hidden, the status stands in.
          return (
            <>
              <span className="text-text-muted max-md:hidden">—</span>
              <span className="text-[12px] text-text-secondary md:hidden">
                {bookingStatusBadge(b.status).label}
              </span>
            </>
          )
        }
        return (
          <span className="flex flex-col text-[12.5px] max-md:text-[12px]">
            <span className={cn('font-medium', URGENCY_TEXT[step.urgency])}>
              {step.text}
            </span>
            {step.detail && (
              <span className="text-[12px] text-text-muted max-md:hidden">
                {step.detail}
              </span>
            )}
          </span>
        )
      },
    },
  ]
}
