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
        <p className="truncate text-[13px] font-semibold text-text-primary">
          {booking.customerName}
        </p>
        <p className="text-[12px] text-text-secondary">{booking.serviceSummary}</p>
        <p className="mt-0.5 font-numeric text-[12px] font-medium text-text-primary">
          {booking.scheduledAt}
        </p>
      </div>
      <ScBadge variant={badge.variant} className="shrink-0">
        {badge.label}
      </ScBadge>
    </div>
  )
}
