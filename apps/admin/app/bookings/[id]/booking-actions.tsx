'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type {
  AdminBookingDetail,
  BookingParty,
  CancelledOnBehalfOf,
} from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useCancelAdminBooking,
  useMarkAdminBookingNoShow,
  useOverrideAdminPickupStep,
} from '@repo/core/api/hooks/use-admin-bookings'
import { cn } from '@repo/core/utils'
import { formatRupees, ON_BEHALF_OF_OPTIONS } from '@/lib/bookings'

/**
 * Pick one, with nothing picked to begin with.
 *
 * Native radios rather than ScSegmented: these choices decide who is blamed
 * and who gets money back, so there is deliberately no default — and a
 * segmented control always has one selected.
 */
function RadioOptions<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string
  name: string
  options: Array<{ value: T; label: string }>
  value: T | null
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[11px] font-medium text-text-secondary">
        {legend}
      </legend>
      {options.map((option) => {
        const checked = value === option.value
        return (
          <label
            key={option.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border px-3 text-[13px] transition-colors',
              checked
                ? 'border-brand-white bg-surface-elevated text-text-primary'
                : 'border-border bg-surface text-text-secondary'
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="size-4 accent-brand-white"
            />
            {option.label}
          </label>
        )
      })}
    </fieldset>
  )
}

function DialogError({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-[12px] text-error">
      {message}
    </p>
  )
}

export function CancelBookingDialog({
  booking,
  open,
  onClose,
  onDone,
}: {
  booking: AdminBookingDetail
  open: boolean
  onClose: () => void
  /** Called once the action has gone through, just before the dialog closes. */
  onDone?: () => void
}) {
  const cancel = useCancelAdminBooking()
  const [onBehalfOf, setOnBehalfOf] = useState<CancelledOnBehalfOf | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const paid = booking.payment?.status === 'paid'
  const canSubmit =
    onBehalfOf !== null && reason.trim().length > 0 && !cancel.isPending

  const close = () => {
    setOnBehalfOf(null)
    setReason('')
    setError('')
    onClose()
  }

  const submit = () => {
    if (!onBehalfOf) return
    setError('')
    cancel.mutate(
      { id: booking.id, input: { onBehalfOf, reason: reason.trim() } },
      {
        onSuccess: () => {
          toast.success(`Booking #${booking.reference} cancelled`)
          onDone?.()
          close()
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't cancel this booking")),
      }
    )
  }

  return (
    <ScModal
      open={open}
      onClose={close}
      dismissible={!cancel.isPending}
      aria-label={`Cancel booking #${booking.reference}`}
      className="flex max-w-[420px] flex-col gap-4"
    >
      <h2 className="text-[15px] font-semibold text-text-primary">
        Cancel booking{' '}
        <span className="font-numeric">#{booking.reference}</span>
      </h2>

      <RadioOptions
        legend="Whose decision is this?"
        name="on-behalf-of"
        options={ON_BEHALF_OF_OPTIONS}
        value={onBehalfOf}
        onChange={setOnBehalfOf}
      />

      <div className="flex flex-col gap-1">
        <ScTextarea
          id="cancel-reason"
          label="Reason"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="text-[11px] text-text-muted">
          The customer and the garage both see this reason.
        </p>
      </div>

      {/* Pickup & drop: cancelling does not bring the car back. */}
      {booking.pickup?.pickedUpAt && !booking.pickup.deliveredAt && (
        <p role="alert" className="text-[12px] text-error">
          The garage has the customer&apos;s car. Make sure it is returned before or after
          cancelling: the garage is responsible for it until then.
        </p>
      )}

      <p className="text-[12px] text-text-secondary">
        {paid ? (
          <>
            <span className="font-numeric text-text-primary">
              {formatRupees(booking.amount)}
            </span>{' '}
            was paid online. Refund it in Razorpay after cancelling, then mark
            it refunded on this booking or the Refunds page. The team also
            gets a Telegram reminder.
          </>
        ) : (
          "Nothing was paid online, so there's nothing to refund."
        )}
      </p>

      <DialogError message={error} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton
          variant="secondary"
          onClick={close}
          disabled={cancel.isPending}
          className="min-h-11"
        >
          Keep booking
        </ScButton>
        {/* The one red button: this is the action that cannot be undone. */}
        <ScButton onClick={submit} disabled={!canSubmit} className="min-h-11">
          {cancel.isPending ? 'Cancelling…' : 'Cancel booking'}
        </ScButton>
      </div>
    </ScModal>
  )
}

const NO_SHOW_OPTIONS: Array<{ value: BookingParty; label: string }> = [
  { value: 'customer', label: "The customer didn't turn up" },
  { value: 'garage', label: "The garage didn't turn up" },
]

export function NoShowDialog({
  booking,
  open,
  onClose,
  onDone,
}: {
  booking: AdminBookingDetail
  open: boolean
  onClose: () => void
  /** Called once the action has gone through, just before the dialog closes. */
  onDone?: () => void
}) {
  const markNoShow = useMarkAdminBookingNoShow()
  const [party, setParty] = useState<BookingParty | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const paid = booking.payment?.status === 'paid'

  const close = () => {
    setParty(null)
    setNote('')
    setError('')
    onClose()
  }

  const submit = () => {
    if (!party) return
    setError('')
    markNoShow.mutate(
      { id: booking.id, input: { party, note: note.trim() || undefined } },
      {
        onSuccess: () => {
          toast.success(`Booking #${booking.reference} marked as a no-show`)
          onDone?.()
          close()
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't mark this no-show")),
      }
    )
  }

  return (
    <ScModal
      open={open}
      onClose={close}
      dismissible={!markNoShow.isPending}
      aria-label={`Mark booking #${booking.reference} as a no-show`}
      className="flex max-w-[420px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          Mark a no-show
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          This cancels booking{' '}
          <span className="font-numeric">#{booking.reference}</span>.
        </p>
      </div>

      <RadioOptions
        legend="Who didn't turn up?"
        name="no-show-party"
        options={NO_SHOW_OPTIONS}
        value={party}
        onChange={setParty}
      />

      {/* The money consequence, said before the click rather than after. */}
      {party && (
        <p className="rounded-[10px] border border-border px-3 py-2 text-[12px] text-text-primary">
          {party === 'garage' && paid ? (
            <>
              Refund{' '}
              <span className="font-numeric">
                {formatRupees(booking.amount)}
              </span>{' '}
              to the customer in full in Razorpay, then mark it refunded here.
              The garage earns nothing for it. The team also gets a Telegram
              reminder.
            </>
          ) : party === 'garage' ? (
            "Nothing was paid online, so there's nothing to refund. The garage earns nothing for it."
          ) : (
            // The published policy: the garage held the slot, so it is paid
            // its share (lib/earnings.ts) and the promo use stays spent.
            "The payment is kept. No refund: the customer didn't turn up for an accepted booking. The garage is paid its share, as if the job happened."
          )}
        </p>
      )}

      <ScTextarea
        id="no-show-note"
        label="Note for the team (optional)"
        rows={2}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <DialogError message={error} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton
          variant="secondary"
          onClick={close}
          disabled={markNoShow.isPending}
          className="min-h-11"
        >
          Go back
        </ScButton>
        <ScButton
          onClick={submit}
          disabled={!party || markNoShow.isPending}
          className="min-h-11"
        >
          {markNoShow.isPending ? 'Saving…' : 'Mark no-show'}
        </ScButton>
      </div>
    </ScModal>
  )
}

/**
 * Pickup & drop: Detlio confirms Picked up or Delivered for a customer who
 * cannot give the code (lost phone, code locked after wrong tries), once ops
 * has spoken to them. The step must be the one the job waits for; the
 * reason goes in the notes with the admin's name, and the name is kept on
 * the booking. Delivered completes the job.
 */
export function PickupStepDialog({
  booking,
  step,
  open,
  onClose,
}: {
  booking: AdminBookingDetail
  step: 'picked_up' | 'delivered'
  open: boolean
  onClose: () => void
}) {
  const override = useOverrideAdminPickupStep()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const label = step === 'picked_up' ? 'Picked up' : 'Delivered'

  const close = () => {
    setNote('')
    setError('')
    onClose()
  }

  const submit = () => {
    setError('')
    override.mutate(
      { id: booking.id, input: { step, note: note.trim() } },
      {
        onSuccess: () => {
          toast.success(`${label} confirmed for #${booking.reference}`)
          close()
        },
        onError: (err) => setError(errorMessage(err, `Couldn't confirm ${label}`)),
      }
    )
  }

  return (
    <ScModal
      open={open}
      onClose={close}
      dismissible={!override.isPending}
      aria-label={`Confirm ${label} for booking #${booking.reference}`}
      className="flex max-w-[420px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Confirm {label.toLowerCase()}</h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          {step === 'picked_up'
            ? 'For when the customer handed the car over but could not give the pickup code. From now the car is the garage’s responsibility.'
            : 'For when the car is back with the customer but they could not give the delivery code. This completes the booking.'}{' '}
          Only after speaking to the customer.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <ScTextarea
          id="pickup-step-note"
          label="Why the code could not be used"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="text-[11px] text-text-muted">Goes in the notes with your name.</p>
      </div>

      <DialogError message={error} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton variant="secondary" onClick={close} disabled={override.isPending} className="min-h-11">
          Not now
        </ScButton>
        <ScButton
          onClick={submit}
          disabled={note.trim().length === 0 || override.isPending}
          className="min-h-11"
        >
          {override.isPending ? 'Confirming…' : `Confirm ${label.toLowerCase()}`}
        </ScButton>
      </div>
    </ScModal>
  )
}
