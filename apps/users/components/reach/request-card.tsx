'use client'

import Link from 'next/link'
import { toast } from 'react-toastify'
import { IconCircleCheck, IconClockHour4, IconInfoCircle } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { useCancelRequest } from '@repo/core/api/hooks/use-booking-requests'
import type { CustomerRequest } from '@repo/core/api/booking-requests'
import { countdownLabel, istClock, istStartLabel, REQUEST_RULES, triedLine } from '@repo/core/booking-requests'
import { cn } from '@repo/core/utils'

const money = (rupees: number) => `₹${rupees.toLocaleString('en-IN')}`

/** What the customer pays to confirm a yes: the services and the travel fee. */
export function requestTotal(request: CustomerRequest): number {
  return Math.round((Number(request.subtotal) + (request.travelFee ?? 0)) * 100) / 100
}

/** Checkout, pre-filled with everything the garage accepted. */
export function confirmHref(request: CustomerRequest): string {
  const services = request.items.map((item) => item.serviceId).join(',')
  return `/book/${request.garage.id}?service=${services}&mode=${request.bookingType}&request=${request.id}`
}

/**
 * One request, as the customer follows it (mockup doorstep-request.png,
 * frames 3, 5 and 6): waiting with its clock; accepted with Confirm & pay;
 * or ended, with what to do next. Never a dead end.
 */
export function RequestCard({ request, now }: { request: CustomerRequest; now: number }) {
  const cancel = useCancelRequest()
  const services = request.items.map((item) => item.name).join(' + ')
  const pickup = request.bookingType === 'pickup'

  const cancelIt = async (words: string) => {
    try {
      await cancel.mutateAsync(request.id)
      toast.success(words)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't cancel it. Try again.")
    }
  }

  const headingId = `request-${request.rootId}`
  return (
    <section
      aria-labelledby={headingId}
      data-request={request.state}
      className={cn(
        'flex flex-col gap-3 rounded-[18px] border p-4',
        request.state === 'accepted' ? 'border-[#1F5A3A] bg-[#0E2418]' : 'border-border bg-surface'
      )}
    >
      {request.state === 'waiting' && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-warning">Request sent</p>
              <h2 id={headingId} className="mt-1 text-[17px] font-medium text-text-primary">
                Waiting for {request.garage.name}
              </h2>
              <p className="text-[13px] text-text-secondary">
                {services} · {request.window.label}
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span className="block font-numeric text-[22px] text-text-primary" aria-label="Time left for the garage">
                {countdownLabel(Date.parse(request.respondBy) - now)}
              </span>
              <span className="block text-[12px] text-text-muted">They reply by {istClock(request.respondBy)}</span>
            </p>
          </div>
          <ol className="flex flex-col gap-2 border-l border-border pl-4 text-[13px]">
            <li className="text-text-primary">Sent · {istClock(request.createdAt)}</li>
            <li className="text-text-primary">
              {request.garage.name} is deciding
              <span className="block text-[12px] text-text-muted">
                Detlio also calls them if there&apos;s no reply in {REQUEST_RULES.alertAfterMinutes} min.
              </span>
            </li>
            <li className="text-text-secondary">
              {request.tried.length < request.maxGarages
                ? 'If not: we ask the next nearest garage, with the same details.'
                : triedLine(request.tried.length, request.maxGarages)}
            </li>
          </ol>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-[13px] text-text-secondary">Cancel any time</span>
            <ScButton
              variant="text"
              fullWidth={false}
              disabled={cancel.isPending}
              onClick={() => void cancelIt('Request cancelled')}
            >
              Cancel request
            </ScButton>
          </div>
        </>
      )}

      {request.state === 'accepted' && request.acceptedStartAt && request.confirmBy && (
        <>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-success">Accepted</p>
          <h2 id={headingId} className="text-[17px] font-medium text-text-primary">
            {request.garage.name} will {pickup ? 'collect your car' : 'come'} {istStartLabel(request.acceptedStartAt)}
          </h2>
          <dl className="flex flex-col gap-1.5 text-[14px]">
            {request.items.map((item) => (
              <div key={item.serviceId} className="flex justify-between gap-3">
                <dt className="text-text-secondary">{item.name}</dt>
                <dd className="font-numeric text-text-primary">{money(Number(item.amount))}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Travel fee</dt>
              <dd className="font-numeric text-text-primary">{request.travelFee ? money(request.travelFee) : 'None'}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-line pt-2">
              <dt className="text-text-primary">To pay</dt>
              <dd className="font-numeric text-[17px] text-text-primary">{money(requestTotal(request))}</dd>
            </div>
          </dl>
          <p className="flex items-center gap-1.5 text-[13px] text-success">
            <IconClockHour4 size={15} aria-hidden />
            Held for you until {istClock(request.confirmBy)} ({countdownLabel(Date.parse(request.confirmBy) - now)} left)
          </p>
          <Link
            href={confirmHref(request)}
            className="press flex min-h-12 items-center justify-center rounded-full bg-brand-red-fill text-[15px] font-medium text-brand-white hover:bg-brand-red-fill-hover"
          >
            Confirm &amp; pay {money(requestTotal(request))}
          </Link>
          <ScButton variant="text" disabled={cancel.isPending} onClick={() => void cancelIt('Request closed')}>
            No thanks
          </ScButton>
        </>
      )}

      {(request.state === 'no_garage' || request.state === 'lapsed') && (
        <>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">Update</p>
          <h2 id={headingId} className="text-[17px] font-medium text-text-primary">
            {request.state === 'lapsed'
              ? `${request.garage.name}'s yes has expired`
              : request.tried.length > 1
                ? 'No nearby garage could take it this time'
                : `${request.garage.name} can't make it this time`}
          </h2>
          <p className="flex items-start gap-2 text-[13px] text-text-secondary">
            <IconInfoCircle size={16} className="mt-px shrink-0" aria-hidden />
            {request.state === 'lapsed'
              ? 'It was not confirmed in time. Send a new request whenever you like.'
              : `${triedLine(request.tried.length, request.maxGarages)} Visit a garage instead, or get a free wash when we reach your area.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/garages"
              className="press flex min-h-11 items-center rounded-full border border-stroke px-4 text-[14px] text-text-primary"
            >
              See garages to visit
            </Link>
            <Link
              href={`/garages?mode=${request.bookingType}`}
              className="press flex min-h-11 items-center rounded-full border border-stroke px-4 text-[14px] text-text-primary"
            >
              Ask another garage
            </Link>
          </div>
        </>
      )}

      {request.state === 'booked' && (
        <>
          <h2 id={headingId} className="flex items-center gap-2 text-[17px] font-medium text-text-primary">
            <IconCircleCheck size={18} className="text-success" aria-hidden /> Booked with {request.garage.name}
          </h2>
          {request.bookingId && (
            <Link href={`/bookings/${request.bookingId}`} className="text-[14px] text-text-primary underline">
              See your booking
            </Link>
          )}
        </>
      )}

      {request.state === 'cancelled' && (
        <h2 id={headingId} className="text-[15px] text-text-secondary">
          Request to {request.garage.name} cancelled
        </h2>
      )}
    </section>
  )
}
