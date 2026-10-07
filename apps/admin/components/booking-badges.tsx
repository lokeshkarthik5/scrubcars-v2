import { ScBadge } from '@repo/ui/sc/badge'
import type { BookingParty } from '@repo/core/api/admin'
import { formatWaiting, WAITING_ALERT_MINS } from '@/lib/bookings'

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

export function NoShowBadge({ party }: { party: BookingParty }) {
  return (
    <ScBadge variant="danger">
      {party === 'customer' ? 'Customer no-show' : 'Garage no-show'}
    </ScBadge>
  )
}
