'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { IconAlertTriangle } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import type { AdminBooking } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useSetAdminBookingTestMark } from '@repo/core/api/hooks/use-admin-data-reset'
import { adminBookingKeys } from '@repo/core/api/hooks/use-admin-bookings'
import { DeleteTestBookingDialog } from '@/components/delete-test-booking-dialog'
import { formatMoney } from '@/lib/format'
import { paymentStatusLabel } from '@/lib/bookings'

/**
 * "Mark as test…" and "Delete test booking…" from the bookings list (owner,
 * 10 Nov 2026: the team runs whole bookings end to end, accepting and all,
 * and clears them after), so neither needs the booking's page. The same
 * confirm and the same dry run as there: marking is asked first because it
 * changes the pilot numbers; deleting shows what goes, and what it leaves,
 * before anything can be confirmed. The server decides who may delete what.
 *
 * `onDeleted` runs after Done on a deleted booking, for the panel to close:
 * the booking it shows no longer exists.
 */
export function TestBookingActions({
  booking: b,
  onDeleted,
}: {
  booking: AdminBooking
  onDeleted?: () => void
}) {
  const queryClient = useQueryClient()
  const setMark = useSetAdminBookingTestMark()
  const [asking, setAsking] = useState(false)
  const [markError, setMarkError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const marked = Boolean(b.markedTest)
  const livePaid =
    b.payment?.status === 'paid' && b.payment.gatewayMode === 'live'

  const mark = async () => {
    setMarkError('')
    try {
      await setMark.mutateAsync({ id: b.id, marked: true })
      setAsking(false)
      toast.success(`#${b.reference} marked as a test booking`)
    } catch (err) {
      setMarkError(errorMessage(err, "Couldn't mark it as a test booking"))
    }
  }

  return (
    <>
      {marked ? (
        <ScButton
          variant="secondary"
          fullWidth={false}
          onClick={() => setDeleting(true)}
          className="min-h-11 px-4 text-[13px]"
        >
          Delete test booking…
        </ScButton>
      ) : (
        <ScButton
          variant="secondary"
          fullWidth={false}
          onClick={() => {
            setMarkError('')
            setAsking(true)
          }}
          className="min-h-11 px-4 text-[13px]"
        >
          Mark as test…
        </ScButton>
      )}
      <ConfirmSheet
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={mark}
        busy={setMark.isPending}
        error={markError || undefined}
        level="firm"
        title={`Mark #${b.reference} as a test booking?`}
        confirmLabel="Mark as test"
        cancelLabel="Keep as real"
        body={
          <div className="flex flex-col gap-2.5">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[12px] border border-border px-3 py-2.5 text-[13px]">
              <dt className="text-text-secondary">Customer</dt>
              <dd className="text-text-primary">{b.customer?.name ?? '—'}</dd>
              <dt className="text-text-secondary">Paid</dt>
              <dd className="text-text-primary">
                {b.payment?.status === 'paid'
                  ? `${formatMoney(b.payment.amount ?? b.amount)} · ${livePaid ? 'Razorpay live' : 'test mode'}`
                  : paymentStatusLabel(b.payment?.status)}
              </dd>
            </dl>
            {livePaid && (
              <p className="flex gap-2 text-tone-attention-text">
                <IconAlertTriangle
                  size={18}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                />
                <span>
                  This was paid with <strong>real money</strong>. Test bookings
                  are usually paid in test mode.
                </span>
              </p>
            )}
            <p>It leaves Statistics and the pilot numbers.</p>
            <p>You can unmark it any time from its page.</p>
          </div>
        }
      />
      {deleting && (
        <DeleteTestBookingDialog
          booking={b}
          open={deleting}
          onClose={() => setDeleting(false)}
          // The delete only marks the lists out of date (its hook is shared
          // with the booking's page, which must not refetch a booking that is
          // gone), so the list on screen is read again here and the row goes;
          // the panel closes rather than show a booking that no longer exists.
          onDeleted={() => {
            setDeleting(false)
            void queryClient.invalidateQueries({
              queryKey: adminBookingKeys.lists(),
            })
            void queryClient.invalidateQueries({
              queryKey: [...adminBookingKeys.all, 'view-counts'],
            })
            onDeleted?.()
          }}
        />
      )}
    </>
  )
}
