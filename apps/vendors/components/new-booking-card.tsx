'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  IconCar,
  IconCheck,
  IconHome,
  IconMapPin,
  IconPhoneOff,
  IconRefresh,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { formatINR, formatWhen } from '@repo/core/format'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import type { Booking } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { AnswerDeadline } from '@/components/answer-deadline'
import { RejectBookingSheet } from '@/components/reject-booking'
import { SuggestTimes } from '@/components/suggest-times'
import {
  customerNumberLine,
  distanceKm,
  jobPrice,
  proposalOpen,
  responseRunOut,
  servicesLine,
  slotPassed,
} from '@/lib/jobs'

/**
 * A new booking, answered in one look and one tap (garage mockup 01). The
 * same card on Home and on Bookings › New, so the deadline is never missing
 * from where the phone sits open:
 *
 *   how long is left to answer, big, with a draining bar
 *   when (big) · what · car and plate · customer
 *   where · price
 *   one big Accept; Other time and Can't do under it, out of the thumb's way
 *   one quiet line on when the customer's number shows
 *
 * The rest of the job (the address with Maps, support) is on its own page,
 * a tap on the details away.
 */
export function NewBookingCard({
  booking: b,
  now,
  onChanged,
  onPage = false,
}: {
  booking: Booking
  now: number
  /** Re-read the job list after a change. */
  onChanged: () => void
  /** On the job's own page, which already says who, when and the number. */
  onPage?: boolean
}) {
  const updateStatus = useBookingsStore((s) => s.updateStatus)
  const [rejecting, setRejecting] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const who = b.customerName || 'the customer'
  const passed = slotPassed(b, now)
  const lost = responseRunOut(b, now)
  const waitingOnCustomer = proposalOpen(b)
  const numberLine = customerNumberLine(b, now)
  const km = distanceKm(b)
  const price = jobPrice(b)

  const accept = async () => {
    setAccepting(true)
    try {
      await updateStatus(b.id, 'confirmed')
      toast.success('Booking accepted')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not accept this booking'
      )
      onChanged()
    } finally {
      setAccepting(false)
    }
  }

  return (
    <article
      id={`job-${b.id}`}
      aria-label={`New booking from ${who}`}
      className="scroll-mt-4 rounded-[20px] border border-border bg-surface"
    >
      {b.responseDeadline && !waitingOnCustomer && (!passed || lost) && (
        <AnswerDeadline deadline={b.responseDeadline} />
      )}

      <div className="flex flex-col gap-4 p-5">
        {/* The details open the job's own page. */}
        {!onPage && (
          <Link
            href={`/bookings/${b.id}`}
            aria-label={`Details of the booking for ${who}`}
            className="press -m-2 flex flex-col gap-1 rounded-[14px] p-2"
          >
            <p className="font-numeric text-[24px] font-bold leading-tight tracking-tight text-text-primary">
              {formatWhen(b.scheduledAtIso, now)}
            </p>
            <p className="text-[17px] font-medium text-text-primary">
              {servicesLine(b)}
            </p>
            {b.vehicle && (
              <p className="text-[16px] text-text-secondary">
                {b.vehicle.make} {b.vehicle.model} ·{' '}
                <span className="font-numeric tracking-wide text-text-primary">
                  {b.vehicle.plate}
                </span>
              </p>
            )}
            <p className="flex min-w-0 items-center gap-2 text-[16px] text-text-secondary">
              <span className="truncate">{who}</span>
              {b.customerBadge && (
                <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide text-text-secondary">
                  {b.customerBadge}
                </span>
              )}
            </p>
          </Link>
        )}

        {b.guaranteeRedo && (
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[13px] font-medium text-text-primary">
            <IconRefresh size={14} aria-hidden="true" />
            Free redo · nothing to collect
          </p>
        )}

        <div
          className={cn(
            'flex items-end justify-between gap-3',
            !onPage && 'border-t border-border pt-4'
          )}
        >
          <p className="flex min-w-0 items-start gap-1.5 text-[15px] text-text-secondary">
            {b.bookingType === 'doorstep' ? (
              <IconHome
                size={18}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
            ) : b.bookingType === 'pickup' ? (
              <IconCar
                size={18}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
            ) : (
              <IconMapPin
                size={18}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
            )}
            <span className="min-w-0">
              {BOOKING_TYPE_LABELS[b.bookingType]}
              {b.jobLocation && ` · ${b.jobLocation.address}`}
              {km !== null && (
                <span className="font-numeric">{` · ${km} km`}</span>
              )}
            </span>
          </p>
          <p className="shrink-0 font-numeric text-[24px] font-bold leading-none tracking-tight text-text-primary">
            {formatINR(price)}
          </p>
        </div>

        {b.rescheduledFromId && !passed && (
          <p className="text-[15px] text-text-secondary">
            The customer moved this booking to a new time. Accept it if you can
            do it.
          </p>
        )}

        {waitingOnCustomer ? (
          // Times suggested instead of an answer (0041): what was offered,
          // until when, and Withdraw. Accept and Can't do wait.
          <SuggestTimes booking={b} onChanged={onChanged} />
        ) : lost ? null : passed ? (
          // Accepting is refused once the time has passed: declining frees
          // the refund, or other times can still be offered.
          <div className="flex flex-col gap-3">
            <p className="text-[15px] text-text-secondary">
              This slot&apos;s time has passed without being accepted. Reject it
              so the customer can be refunded.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {b.canSuggestTimes && (
                <SuggestTimes booking={b} onChanged={onChanged} />
              )}
              <ScButton
                variant="outline"
                size="md"
                className={cn(!b.canSuggestTimes && 'col-span-2')}
                aria-label={`Can't do: reject booking for ${who}`}
                onClick={() => setRejecting(true)}
              >
                Can&apos;t do
              </ScButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ScButton
              variant="main"
              size="lg"
              disabled={accepting}
              aria-label={`Accept booking for ${who}`}
              onClick={accept}
            >
              <IconCheck size={22} stroke={2.4} aria-hidden="true" />
              Accept
            </ScButton>
            <div className="grid grid-cols-2 gap-2">
              {b.canSuggestTimes && (
                <SuggestTimes booking={b} onChanged={onChanged} />
              )}
              <ScButton
                variant="outline"
                size="md"
                className={cn(!b.canSuggestTimes && 'col-span-2')}
                aria-label={`Can't do: reject booking for ${who}`}
                onClick={() => setRejecting(true)}
              >
                Can&apos;t do
              </ScButton>
            </div>
          </div>
        )}

        {numberLine && !onPage && (
          <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-text-secondary">
            <IconPhoneOff size={15} aria-hidden="true" className="shrink-0" />
            {numberLine}
          </p>
        )}
      </div>

      <RejectBookingSheet
        booking={b}
        open={rejecting}
        onClose={() => setRejecting(false)}
        onDone={onChanged}
      />
    </article>
  )
}
