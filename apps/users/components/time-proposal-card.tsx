'use client'

import { useState } from 'react'
import { IconCalendarQuestion, IconLoader2 } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { ApiError } from '@repo/core/api/client'
import {
  chooseProposedTime,
  declineProposedTimes,
} from '@repo/core/api/bookings'
import { bookingDayLabel } from '@repo/core/home-display'
import { formatClock } from '@repo/core/format'
import type { Booking, TimeProposal } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/** "Sat 17 Oct, 2:00 PM": a suggested time, in IST like the rest of the page. */
export function proposedTimeLabel(iso: string): string {
  return `${bookingDayLabel(iso)}, ${formatClock(iso)}`
}

interface TimeProposalCardProps {
  booking: Booking
  proposal: TimeProposal
  /** Picked a time: the moved booking, already accepted, under its new id. */
  onMoved: (moved: Booking) => void
  /** Said none work: the same booking, now cancelled. */
  onDeclined: (cancelled: Booking) => void
  /** Anything else changed meanwhile (withdrawn, ran out): reload the page's copy. */
  onStale: () => void
}

/**
 * "<Garage> can't do 10:00 — pick another time" (0041): the times the
 * garage offered instead of declining, one tap each. Picking one moves the
 * booking there, accepted at once (the garage offered it). "None of these
 * work" cancels it as the garage's decline, with a full refund. Unanswered
 * by the time shown, the same happens on its own.
 *
 * The page's one main action while it shows: the times are the choice, so
 * none of them is red; Reschedule and Cancel below step back.
 */
export function TimeProposalCard({
  booking,
  proposal,
  onMoved,
  onDeclined,
  onStale,
}: TimeProposalCardProps) {
  const [busy, setBusy] = useState<string | 'decline' | null>(null)
  const [confirmDecline, setConfirmDecline] = useState(false)
  // Times taken by someone else since the page loaded: gone from the list.
  const [gone, setGone] = useState<string[]>([])
  const options = proposal.options.filter((option) => !gone.includes(option))

  const choose = async (slot: string) => {
    if (busy) return
    setBusy(slot)
    try {
      const moved = await chooseProposedTime(booking.id, slot)
      toast.success(
        `Booked for ${proposedTimeLabel(slot)}. ${booking.vendorName} has accepted it.`
      )
      onMoved(moved)
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'TIME_PROPOSAL_SLOT_GONE'
      ) {
        setGone((current) => [...current, slot])
        toast.error(error.message)
      } else if (
        error instanceof ApiError &&
        error.code === 'TIME_PROPOSAL_CLOSED'
      ) {
        toast.error(error.message)
        onStale()
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.'
        )
      }
    } finally {
      setBusy(null)
    }
  }

  const decline = async () => {
    if (busy) return
    setBusy('decline')
    try {
      const cancelled = await declineProposedTimes(booking.id)
      toast.success('Booking cancelled. Your payment will be refunded in full.')
      onDeclined(cancelled)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.'
      )
      if (error instanceof ApiError && error.code === 'TIME_PROPOSAL_CLOSED')
        onStale()
    } finally {
      setBusy(null)
      setConfirmDecline(false)
    }
  }

  const paid = booking.paymentStatus === 'paid'

  return (
    // #time-proposal: Home's "Pick a time" lands here (/bookings/:id?then=times).
    <ScCard
      id="time-proposal"
      className="flex scroll-mt-4 flex-col gap-3 px-4 py-4"
    >
      <div className="flex items-start gap-2.5">
        <IconCalendarQuestion
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-0.5 shrink-0 text-text-secondary"
        />
        <div className="min-w-0">
          <h2 className="text-[17px] font-medium text-text-primary">
            {booking.vendorName} can&apos;t do{' '}
            <span className="font-numeric">
              {formatClock(booking.scheduledAtIso)}
            </span>{' '}
            — pick another time
          </h2>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Pick one by{' '}
            <span className="font-numeric">
              {proposedTimeLabel(proposal.expiresAt)}
            </span>
            . It&apos;s accepted as soon as you pick it.
          </p>
        </div>
      </div>

      {proposal.note && (
        <p className="text-[12px] text-text-secondary">
          <span className="font-medium text-text-primary">
            Garage&apos;s note:
          </span>{' '}
          {proposal.note}
        </p>
      )}

      {options.length > 0 ? (
        <ul
          aria-label="Times the garage suggested"
          className="flex flex-col gap-2"
        >
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => choose(option)}
                aria-label={`Book ${proposedTimeLabel(option)}`}
                className={cn(
                  'press flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] border border-line bg-white/[0.03] px-4 text-left text-[15px] font-medium text-text-primary transition-colors disabled:opacity-60',
                  busy === option && 'border-text-primary'
                )}
              >
                <span className="font-numeric">
                  {proposedTimeLabel(option)}
                </span>
                {busy === option ? (
                  <IconLoader2
                    size={16}
                    className="shrink-0 animate-spin"
                    aria-hidden
                  />
                ) : (
                  <span className="text-[13px] text-text-secondary">Pick</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="text-[13px] text-text-secondary">
          The times {booking.vendorName} suggested have all been taken. You can
          cancel for a full refund, or use Help with this booking.
        </p>
      )}

      {confirmDecline ? (
        <div className="rise-in flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-[13px] text-text-secondary">
            Cancel this booking?{' '}
            {paid
              ? 'Your payment will be refunded in full to your original payment method.'
              : 'Nothing was paid, so there is nothing to refund.'}
          </p>
          <div className="flex gap-2">
            <ScButton
              variant="outline"
              disabled={busy !== null}
              onClick={() => setConfirmDecline(false)}
            >
              Keep it
            </ScButton>
            <ScButton
              variant="danger-outline"
              disabled={busy !== null}
              onClick={decline}
            >
              {busy === 'decline' ? 'Cancelling...' : 'Yes, cancel'}
            </ScButton>
          </div>
        </div>
      ) : (
        <ScButton
          variant="text"
          disabled={busy !== null}
          onClick={() => setConfirmDecline(true)}
        >
          None of these work — cancel for a full refund
        </ScButton>
      )}
    </ScCard>
  )
}
