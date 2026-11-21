'use client'

import Link from 'next/link'
import { toast } from 'react-toastify'
import { IconCircleCheck, IconClockHour4, IconInfoCircle } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { useCancelRequest } from '@repo/core/api/hooks/use-booking-requests'
import type { CustomerRequest } from '@repo/core/api/booking-requests'
import { countdownLabel, istClock, istStartLabel, REQUEST_RULES, triedLine } from '@repo/core/booking-requests'
import { cn } from '@repo/core/utils'
import { useT } from '@repo/core/i18n'
import { pickupLineLabel, requestFeeAcceptedNote, requestFeeWaitingLine } from '@repo/core/pickup-fee'

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
  const t = useT()
  const cancel = useCancelRequest()
  const services = request.items.map((item) => item.name).join(' + ')
  const pickup = request.bookingType === 'pickup'

  const cancelIt = async (words: string) => {
    try {
      await cancel.mutateAsync(request.id)
      toast.success(words)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Couldn't cancel it. Try again."))
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
              <p className="text-t5 font-medium uppercase tracking-[0.12em] text-warning">{t('Request sent')}</p>
              <h2 id={headingId} className="mt-1 text-t2 font-medium text-text-primary">
                {t('Waiting for {name}', { name: request.garage.name })}
              </h2>
              <p className="text-t4 text-text-secondary">
                {services} · {request.window.label}
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span className="block font-numeric text-[22px] text-text-primary" aria-label={t('Time left for the garage')}>
                {countdownLabel(Date.parse(request.respondBy) - now)}
              </span>
              <span className="block text-t5 text-text-muted">{t('They reply by {istClock}', { istClock: istClock(request.respondBy) })}</span>
            </p>
          </div>
          <ol className="flex flex-col gap-2 border-l border-border pl-4 text-t4">
            <li className="text-text-primary">{t('Sent · {istClock}', { istClock: istClock(request.createdAt) })}</li>
            <li className="text-text-primary">
              {t('{name} is deciding', { name: request.garage.name })}
              <span className="block text-t5 text-text-muted">
                {t("Detlio also calls them if there's no reply in {alertAfterMinutes} min.", { alertAfterMinutes: REQUEST_RULES.alertAfterMinutes })}
              </span>
            </li>
            {/* Ask for pickup (0079): Detlio's suggestion and the most the garage may ask. */}
            {pickup && request.suggestedFee != null && request.maxFee != null && (
              <li className="text-text-primary" data-request-fee="">
                {requestFeeWaitingLine(request.suggestedFee, request.maxFee)}
              </li>
            )}
            <li className="text-text-secondary">
              {request.tried.length < request.maxGarages
                ? t('If not: we ask the next nearest garage, with the same details.')
                : triedLine(request.tried.length, request.maxGarages)}
            </li>
          </ol>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-t4 text-text-secondary">{t('Cancel any time')}</span>
            <ScButton
              variant="text"
              fullWidth={false}
              disabled={cancel.isPending}
              onClick={() => void cancelIt(t('Request cancelled'))}
            >
              {t('Cancel request')}
            </ScButton>
          </div>
        </>
      )}

      {request.state === 'accepted' && request.acceptedStartAt && request.confirmBy && (
        <>
          <p className="text-t5 font-medium uppercase tracking-[0.12em] text-success">{t('Accepted')}</p>
          <h2 id={headingId} className="text-t2 font-medium text-text-primary">
            {pickup
              ? t('{name} will collect your car {when}', { name: request.garage.name, when: istStartLabel(request.acceptedStartAt) })
              : t('{name} will come {when}', { name: request.garage.name, when: istStartLabel(request.acceptedStartAt) })}
          </h2>
          <dl className="flex flex-col gap-1.5 text-[14px]">
            {request.items.map((item) => (
              <div key={item.serviceId} className="flex justify-between gap-3">
                <dt className="text-text-secondary">{item.name}</dt>
                <dd className="font-numeric text-text-primary">{money(Number(item.amount))}</dd>
              </div>
            ))}
            {pickup ? (
              // The pickup fee the garage said yes at (0079), in place of
              // the travel fee: locked from here.
              <div data-request-fee="">
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">{pickupLineLabel(request.roadKm)}</dt>
                  <dd className="font-numeric text-text-primary">{request.travelFee ? money(request.travelFee) : t('Free')}</dd>
                </div>
                {request.suggestedFee != null && request.maxFee != null && request.suggestedFee > 0 && (
                  <p className="text-t5 text-text-muted">{requestFeeAcceptedNote(request.suggestedFee, request.maxFee)}</p>
                )}
              </div>
            ) : (
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">{t('Travel fee')}</dt>
                <dd className="font-numeric text-text-primary">{request.travelFee ? money(request.travelFee) : t('None')}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-line pt-2">
              <dt className="text-text-primary">{t('To pay')}</dt>
              <dd className="font-numeric text-t2 text-text-primary">{money(requestTotal(request))}</dd>
            </div>
          </dl>
          <p className="flex items-center gap-1.5 text-t4 text-success">
            <IconClockHour4 size={15} aria-hidden />
            {t('Held for you until {istClock} ({countdownLabel} left)', { istClock: istClock(request.confirmBy), countdownLabel: countdownLabel(Date.parse(request.confirmBy) - now) })}
          </p>
          <Link
            href={confirmHref(request)}
            className="press flex min-h-12 items-center justify-center rounded-full bg-brand-red-fill text-t3 font-medium text-brand-white hover:bg-brand-red-fill-hover"
          >
            {t('Confirm & pay {money}', { money: money(requestTotal(request)) })}
          </Link>
          <ScButton variant="text" disabled={cancel.isPending} onClick={() => void cancelIt(t('Request closed'))}>
            {t('No thanks')}
          </ScButton>
        </>
      )}

      {(request.state === 'no_garage' || request.state === 'lapsed') && (
        <>
          <p className="text-t5 font-medium uppercase tracking-[0.12em] text-text-muted">{t('Update')}</p>
          <h2 id={headingId} className="text-t2 font-medium text-text-primary">
            {request.state === 'lapsed'
              ? t("{name}'s yes has expired", { name: request.garage.name })
              : request.tried.length > 1
                ? t('No nearby garage could take it this time')
                : t("{name} can't make it this time", { name: request.garage.name })}
          </h2>
          <p className="flex items-start gap-2 text-t4 text-text-secondary">
            <IconInfoCircle size={16} className="mt-px shrink-0" aria-hidden />
            {request.state === 'lapsed'
              ? t('It was not confirmed in time. Send a new request whenever you like.')
              : t('{triedLine} Visit a garage instead, or get a free wash when we reach your area.', { triedLine: triedLine(request.tried.length, request.maxGarages) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/garages"
              className="press flex min-h-11 items-center rounded-full border border-stroke px-4 text-[14px] text-text-primary"
            >
              {t('See garages to visit')}
            </Link>
            <Link
              href={`/garages?mode=${request.bookingType}`}
              className="press flex min-h-11 items-center rounded-full border border-stroke px-4 text-[14px] text-text-primary"
            >
              {t('Ask another garage')}
            </Link>
          </div>
        </>
      )}

      {request.state === 'booked' && (
        <>
          <h2 id={headingId} className="flex items-center gap-2 text-t2 font-medium text-text-primary">
            <IconCircleCheck size={18} className="text-success" aria-hidden /> {t('Booked with {name}', { name: request.garage.name })}
          </h2>
          {request.bookingId && (
            <Link href={`/bookings/${request.bookingId}`} className="text-[14px] text-text-primary underline">
              {t('See your booking')}
            </Link>
          )}
        </>
      )}

      {request.state === 'cancelled' && (
        <h2 id={headingId} className="text-t3 text-text-secondary">
          {/* The garage took back its yes before they paid (0066). */}
          {request.withdrawnByGarage
            ? t('{name} can no longer come. Nothing was paid; send a new request any time.', { name: request.garage.name })
            : t('Request to {name} cancelled', { name: request.garage.name })}
        </h2>
      )}
    </section>
  )
}
