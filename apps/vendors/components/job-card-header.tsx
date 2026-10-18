import { IconRefresh } from '@tabler/icons-react'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import type { Booking } from '@repo/core/types'

/**
 * The top of a job card, the same on Home and on Bookings: who, what, and
 * when, with the status on the right. The time is set on its own line in the
 * numeric face, the way the customer's bookings list sets it, so a garage
 * scanning a list reads the times down one edge.
 */
export function JobCardHeader({ booking }: { booking: Booking }) {
  const badge = bookingStatusBadge(booking.status)

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {/* The full name on hover or long-press when it is cut short. */}
        <p title={booking.customerName} className="truncate text-[13px] font-semibold text-text-primary">
          {booking.customerName}
        </p>
        <p className="text-[12px] text-text-secondary">{booking.serviceSummary}</p>
        <p className="mt-0.5 font-numeric text-[12px] font-medium text-text-primary">
          {booking.scheduledAt}
        </p>
        {/* Detlio Guarantee (0051): a free redo of an earlier job of yours.
            Nothing to collect, and no payout on it. */}
        {booking.guaranteeRedo && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-primary">
            <IconRefresh size={12} aria-hidden="true" />
            Free redo · ₹0, nothing to collect
          </p>
        )}
      </div>
      <ScBadge variant={badge.variant} className="shrink-0">
        {badge.label}
      </ScBadge>
    </div>
  )
}
