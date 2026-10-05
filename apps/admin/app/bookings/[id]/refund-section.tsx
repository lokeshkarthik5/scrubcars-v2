'use client'

import { useEffect, useRef, useState } from 'react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScSection } from '@repo/ui/sc/section'
import type { AdminBookingDetail, AdminRefund } from '@repo/core/api/admin'
import { MarkRefundedDialog } from '@/components/mark-refunded-dialog'
import { RefundCard } from '@/components/refund-card'
import { latestRefund } from '@/lib/refunds'

/**
 * Money owed back on this booking, or already given back: its payment and
 * any final bill payments, each with the Razorpay payment to refund and the
 * same "Mark refunded…" as the Refunds page. Absent when nothing is owed and
 * nothing was refunded — a live booking, a customer no-show, a moved one.
 */
export function RefundSection({
  booking,
  now,
}: {
  booking: AdminBookingDetail
  now: number
}) {
  // The refund as it was clicked; the dialog is given its latest copy from
  // the booking (latestRefund), so a refusal's refetch updates its figures.
  const [marking, setMarking] = useState<AdminRefund | null>(null)
  const refunds = booking.refunds ?? []

  // A full refund takes away the button that opened the dialog, so focus
  // would fall to the top of the page. It goes to the refunds here instead,
  // which now say what was recorded.
  const listRef = useRef<HTMLDivElement>(null)
  const focusList = useRef(false)
  useEffect(() => {
    if (focusList.current && marking === null) {
      focusList.current = false
      listRef.current?.focus()
    }
  }, [marking])

  if (refunds.length === 0) return null

  const owed = refunds.some((r) => Number(r.amountOwed) > 0)

  return (
    <ScSection
      title="Refund"
      action={
        <ScBadge variant={owed ? 'danger' : 'muted'}>{owed ? 'Owed' : 'Refunded'}</ScBadge>
      }
    >
      <div ref={listRef} tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
        {refunds.map((refund) => (
          <RefundCard
            key={`${refund.kind}-${refund.id}`}
            refund={refund}
            now={now}
            onMark={setMarking}
            linkBooking={false}
            className="bg-transparent"
          />
        ))}
      </div>

      {marking && (
        <MarkRefundedDialog
          key={`${marking.kind}-${marking.id}`}
          refund={latestRefund(refunds, marking)}
          open
          onClose={() => setMarking(null)}
          onDone={() => {
            focusList.current = true
          }}
        />
      )}
    </ScSection>
  )
}
