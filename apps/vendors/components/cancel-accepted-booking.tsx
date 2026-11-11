'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ScButton } from '@repo/ui/sc/button'
import { ScTextarea } from '@repo/ui/sc/input'
import { garageCancelBooking } from '@repo/core/api/bookings'
import {
  canGarageCancel,
  GARAGE_CANCEL_LATE_HOURS,
  GARAGE_CANCEL_REASON_MAX,
  GARAGE_CANCEL_REASON_MIN,
  isLateGarageCancel,
} from '@repo/core/garage-cancel'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import type { Booking } from '@repo/core/types'

/**
 * "Cancel booking" on an accepted job that has not started (0066): the
 * garage can no longer do it. A reason is required (Detlio reads it; the
 * customer is told the garage cancelled, never the words). Said before the
 * confirm: the customer is refunded in full, and within 24 hours of the slot
 * it counts as a missed booking for the garage's medal.
 */
export function CancelAcceptedBooking({
  booking,
  now,
  onChanged,
}: {
  booking: Booking
  now: number
  onChanged: () => void
}) {
  const t = useT()
  const writeVendorBooking = useBookingsStore((s) => s.writeVendorBooking)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()

  if (!canGarageCancel(booking)) return null

  const who = booking.customerName || t('The customer')
  const late = isLateGarageCancel(new Date(booking.scheduledAtIso), new Date(now))
  const paid = booking.paymentStatus === 'paid'

  const close = () => {
    setOpen(false)
    setError(undefined)
  }

  const cancel = async () => {
    const text = reason.trim()
    if (text.length < GARAGE_CANCEL_REASON_MIN) {
      setError(t('Say why you are cancelling, so Detlio can help the customer.'))
      return
    }
    setError(undefined)
    try {
      await writeVendorBooking(booking.id, () => garageCancelBooking(booking.id, text))
      toast.success(t('Booking cancelled'))
      setReason('')
      setOpen(false)
      onChanged()
    } catch (err) {
      // Started or cancelled meanwhile: said in the sheet, and the job re-read.
      setError(
        err instanceof Error ? err.message : t('Could not cancel this booking')
      )
      onChanged()
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <ScButton
        variant="outline"
        size="md"
        aria-label={t('Cancel booking for {name}', {
          name: booking.customerName || t('the customer'),
        })}
        onClick={() => setOpen(true)}
      >
        {t('Cancel booking')}
      </ScButton>
      <ConfirmSheet
        open={open}
        onClose={close}
        onConfirm={cancel}
        level="firm"
        title={t('Cancel this booking?')}
        body={
          <div className="flex flex-col gap-3">
            <p className="text-[15px] text-text-secondary">
              {paid
                ? t('{who} gets a full refund, and we tell them you had to cancel.', { who })
                : t('We tell {who} you had to cancel.', { who })}
            </p>
            <p className={late ? 'text-[15px] text-warning' : 'text-[15px] text-text-secondary'}>
              {late
                ? t(
                    'This is within {hours} hours of the booking, so it counts as a missed booking for your medal.',
                    { hours: GARAGE_CANCEL_LATE_HOURS }
                  )
                : t(
                    "More than {hours} hours before the booking, it counts like a booking you couldn't take.",
                    { hours: GARAGE_CANCEL_LATE_HOURS }
                  )}
            </p>
            <ScTextarea
              label={t('Why are you cancelling?')}
              rows={3}
              maxLength={GARAGE_CANCEL_REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        }
        confirmLabel={t('Cancel booking')}
        cancelLabel={t('Keep booking')}
        error={error}
      />
    </section>
  )
}
