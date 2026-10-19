'use client'

import { ScBadge } from '@repo/ui/sc/badge'
import type { BookingParty } from '@repo/core/api/admin'
import { useNow } from '@repo/core/hooks/use-now'
import { UrgencyChip } from '@/components/urgency-chip'
import { formatRupees, formatWaiting, WAITING_ALERT_MINS } from '@/lib/bookings'
import { deadlineText } from '@/lib/format'

/**
 * How long a pending booking has waited for its garage. Amber from 30
 * minutes — the point where ops should call the garage; before that it is
 * information, not a problem.
 */
export function WaitingBadge({ mins }: { mins: number }) {
  return (
    <ScBadge variant={mins >= WAITING_ALERT_MINS ? 'danger' : 'pending'}>
      Waiting&nbsp;<span className="font-numeric">{formatWaiting(mins)}</span>
    </ScBadge>
  )
}

/**
 * A pending booking's deadline for the garage to accept (0042), on the
 * panel's one clock scale (quick win 1): coral inside 15 minutes or past it,
 * amber when it is today, grey otherwise. The cron cancels it at this time
 * when AUTO_CANCEL_UNANSWERED is on.
 */
export function AcceptByBadge({ respondBy }: { respondBy: string }) {
  const now = useNow(30_000)
  return (
    <UrgencyChip label={deadlineText(respondBy, now, { verb: 'Accept' })} />
  )
}

/** Cancelled by the cron because the garage did not accept in time (0042). */
export function NotAcceptedBadge() {
  return <ScBadge variant="danger">Not accepted in time</ScBadge>
}

export function NoShowBadge({ party }: { party: BookingParty }) {
  return (
    <ScBadge variant="danger">
      {party === 'customer' ? 'Customer no-show' : 'Garage no-show'}
    </ScBadge>
  )
}

/**
 * A final bill the customer has not paid yet. Neutral rather than amber: the
 * customer pays it in the app, so nothing is wrong until ops is asked about it.
 */
export function BillDueBadge({ amount }: { amount: string }) {
  return (
    <ScBadge variant="pending">
      Bill due&nbsp;<span className="font-numeric">{formatRupees(amount)}</span>
    </ScBadge>
  )
}

/**
 * Money still to give back on a booking. Amber: it is a refund someone has
 * to do in Razorpay and then mark done on the Refunds page.
 */
export function RefundOwedBadge({ amount }: { amount: string }) {
  return (
    <ScBadge variant="danger">
      Refund owed&nbsp;
      <span className="font-numeric">{formatRupees(amount)}</span>
    </ScBadge>
  )
}

/** All the money owed back on a booking has gone back. */
export function RefundedBadge() {
  return <ScBadge variant="muted">Refunded</ScBadge>
}

/**
 * Marked "Test" by the team: left out of the pilot numbers. Neutral: a fact
 * about the booking, not a problem.
 */
export function TestBadge() {
  return <ScBadge variant="pending">Test</ScBadge>
}

/**
 * The payment went through Razorpay's test mode (or E2E's stand-in): no real
 * money moved. Only shown when the mode was recorded; older payments have
 * none.
 */
export function TestModePaymentBadge() {
  return <ScBadge variant="muted">Test-mode payment</ScBadge>
}
