'use client'

import { IconExternalLink } from '@tabler/icons-react'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import type { AdminBooking } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import {
  AcceptByBadge,
  BillDueBadge,
  NoShowBadge,
  NotAcceptedBadge,
  RefundedBadge,
  RefundOwedBadge,
  TestBadge,
  WaitingBadge,
} from '@/components/booking-badges'
import { CopyButton } from '@/components/copy-button'
import { PhoneLink } from '@/components/phone-link'
import { SidePanel, SidePanelFacts, SidePanelSection } from '@/components/table'
import { bookingNextStep } from '@/lib/booking-next-step'
import {
  bookedLine,
  bookingTypeLabel,
  cancellationLabel,
  formatRupees,
  formatWhen,
  paymentStatusLabel,
  pickupStepLine,
} from '@/lib/bookings'
import { URGENCY_TEXT } from '@/lib/format'
import { bookingHref } from './booking-columns'

/**
 * A booking opened beside the list (mockup 03): what to do next and by
 * when, its badges, and the details the old card spread over eight labelled
 * fields — the Razorpay payment id among them, to copy — with the full page
 * one tap away. Actions that change a booking stay on its page.
 */
export function BookingSidePanel({
  booking: b,
  listQuery,
  now,
  onClose,
}: {
  booking: AdminBooking | null
  listQuery: string
  now: number
  onClose: () => void
}) {
  if (!b) return null

  const badge = bookingStatusBadge(b.status)
  const step = bookingNextStep(b, now)
  const cancelled = cancellationLabel(b)
  const services = b.items.map((item) => item.name).join(', ')
  const facts: Array<[string, React.ReactNode]> = [
    [b.items.length > 1 ? 'Services' : 'Service', services || '—'],
    [
      'Car',
      b.vehicle
        ? `${b.vehicle.make} ${b.vehicle.model}${b.vehicle.plate ? ` · ${b.vehicle.plate}` : ''}`
        : '—',
    ],
    [
      bookingTypeLabel(b.bookingType),
      <>
        {b.bookingType === 'doorstep' || b.bookingType === 'pickup'
          ? (b.address ?? 'Address missing')
          : 'Customer comes in'}
        {b.pickup && pickupStepLine(b.pickup) && (
          <span className="block text-text-muted">
            {pickupStepLine(b.pickup)}
          </span>
        )}
      </>,
    ],
    [
      'Amount',
      <span key="amount" className="font-numeric">
        {formatRupees(b.amount)}
      </span>,
    ],
    ['Payment', paymentStatusLabel(b.payment?.status)],
  ]
  if (b.payment?.gatewayTxnId) {
    facts.push([
      'Payment id',
      <span key="txn" className="flex min-w-0 items-center">
        <span className="truncate font-numeric text-text-secondary">
          {b.payment.gatewayTxnId}
        </span>
        <CopyButton
          value={b.payment.gatewayTxnId}
          label={`Copy Razorpay payment id ${b.payment.gatewayTxnId}`}
          className="-my-2 shrink-0"
        />
      </span>,
    ])
  }

  return (
    <SidePanel
      open
      label="Booking details"
      onClose={onClose}
      title={
        <>
          <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
          <h2 className="mt-1.5 truncate text-[16px] font-semibold tracking-[-0.01em] text-text-primary">
            <span className="font-numeric">#{b.reference}</span>
            {b.customer && ` · ${b.customer.name}`}
          </h2>
          <p className="truncate text-[12px] text-text-secondary">
            {[
              b.garage?.name,
              bookingTypeLabel(b.bookingType),
              formatWhen(b.scheduledAt),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="truncate text-[12px] text-text-muted">
            {bookedLine(b.createdAt)}
          </p>
        </>
      }
      actions={
        <ScButtonLink
          href={bookingHref(b, listQuery)}
          variant="secondary"
          className="flex min-h-11 items-center gap-1.5 px-4 text-[13px]"
        >
          Open full page <IconExternalLink size={15} aria-hidden="true" />
        </ScButtonLink>
      }
    >
      {step && (
        <div
          className={cn(
            'mb-1 rounded-xl border px-3 py-2.5',
            step.urgency === 'late'
              ? 'border-tone-late-text/40 bg-tone-late-tint'
              : step.urgency === 'attention'
                ? 'border-warning/40 bg-warning-muted'
                : 'border-border bg-brand-black'
          )}
        >
          <p
            className={cn(
              'text-[13.5px] font-semibold',
              URGENCY_TEXT[step.urgency]
            )}
          >
            {step.text}
          </p>
          {step.detail && (
            <p className="text-[12px] text-text-secondary">{step.detail}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 py-2">
        {b.markedTest && <TestBadge />}
        {b.waitingMins !== null && <WaitingBadge mins={b.waitingMins} />}
        {b.status === 'pending' && b.respondBy && (
          <AcceptByBadge respondBy={b.respondBy} />
        )}
        {b.notAcceptedInTime && <NotAcceptedBadge />}
        {b.noShow && <NoShowBadge party={b.noShow} />}
        {b.billDue && <BillDueBadge amount={b.billDue} />}
        {b.refundOwed ? (
          <RefundOwedBadge amount={b.refundOwed} />
        ) : (
          b.refunded && <RefundedBadge />
        )}
      </div>

      <SidePanelSection title="Booking">
        <SidePanelFacts rows={facts} />
      </SidePanelSection>

      <SidePanelSection title="People">
        <SidePanelFacts
          rows={[
            [
              'Customer',
              b.customer ? (
                <>
                  <span className="block">{b.customer.name}</span>
                  <PhoneLink phone={b.customer.phone} name={b.customer.name} />
                </>
              ) : (
                '—'
              ),
            ],
            [
              'Garage',
              b.garage ? (
                <>
                  <span className="block">{b.garage.name}</span>
                  <PhoneLink phone={b.garage.phone} name={b.garage.name} />
                </>
              ) : (
                '—'
              ),
            ],
          ]}
        />
      </SidePanelSection>

      {cancelled && (
        <SidePanelSection title="Cancelled">
          <p className="text-[13px] font-medium text-text-primary">
            {cancelled}
          </p>
          {b.cancellationReason && !b.notAcceptedInTime && (
            <p className="mt-0.5 text-[12.5px] text-text-secondary">
              {b.cancellationReason}
            </p>
          )}
        </SidePanelSection>
      )}

      {b.notesCount > 0 && (
        <SidePanelSection title="Team notes">
          <p className="text-[13px] text-text-secondary">
            <span className="font-numeric">{b.notesCount}</span>{' '}
            {b.notesCount === 1 ? 'note' : 'notes'} on the full page.
          </p>
        </SidePanelSection>
      )}
    </SidePanel>
  )
}
