'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ScInput } from '@repo/ui/sc/input'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import type { Booking } from '@repo/core/types'

/**
 * "Can't do" on a new booking, asked the same way on Home, Bookings and the
 * job page (it used to be a two-button row on Home and an inline reason
 * field on Bookings). Declining refunds a customer who has paid and can't be
 * taken back, so it is a confirm, with an optional reason the customer sees.
 */
export function RejectBookingSheet({
  booking,
  open,
  onClose,
  onDone,
}: {
  booking: Booking
  open: boolean
  onClose: () => void
  /** After the booking is declined (or the decline was refused and the list re-read). */
  onDone?: () => void
}) {
  const updateStatus = useBookingsStore((s) => s.updateStatus)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const who = booking.customerName || 'The customer'
  const paid = booking.paymentStatus === 'paid'

  const reject = async () => {
    setBusy(true)
    try {
      await updateStatus(booking.id, 'cancelled', reason.trim() || undefined)
      toast.success('Booking rejected')
      setReason('')
      onClose()
      onDone?.()
    } catch (error) {
      // The slot started, or the customer cancelled a moment ago: say so and
      // re-read, so the card stops offering it.
      toast.error(
        error instanceof Error ? error.message : 'Could not reject this booking'
      )
      void fetchVendorBookings().catch(() => undefined)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmSheet
      open={open}
      onClose={onClose}
      onConfirm={reject}
      level="firm"
      title="Can't do this booking?"
      body={
        <div className="flex flex-col gap-3">
          <p className="text-[15px] text-text-secondary">
            {paid
              ? `${who} gets a full refund, and we tell them you can't take it.`
              : `We tell ${who} you can't take it.`}
          </p>
          <ScInput
            // A placeholder is no name once something is typed.
            aria-label="Reason for rejecting (optional)"
            placeholder="Reason for rejecting (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      }
      confirmLabel="Reject booking"
      cancelLabel="Keep"
      busy={busy}
    />
  )
}
