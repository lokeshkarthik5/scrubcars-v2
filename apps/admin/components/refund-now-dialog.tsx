'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdminRefund } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useSendAdminRefund } from '@repo/core/api/hooks/use-admin-refunds'
import { BANK_DAYS } from '@repo/core/refunds'
import { formatRupees } from '@/lib/bookings'
import { refundKindLabel } from '@/lib/refunds'

/** Rupees as typed, in paise, or null when it isn't an amount to the paisa. */
function toPaise(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  return Math.round(Number(trimmed) * 100)
}

/**
 * Refund now: the confirm sheet that sends a refund through Razorpay.
 *
 * It says whose money, which booking and how much before anything goes. The
 * amount starts at everything still owed and can be lowered to a part
 * refund, never raised above it (the server checks again, against
 * Razorpay's own refunds). Sending moves real money from Detlio's Razorpay
 * balance and can't be undone, so it is the one red button here; a refund
 * done by hand in the dashboard is still Mark refunded.
 *
 * Mounted fresh for each refund and given its latest copy on every render,
 * like MarkRefundedDialog: a refusal refetches the lists and the figures
 * here follow.
 */
export function RefundNowDialog({
  refund,
  open,
  onClose,
  onDone,
}: {
  refund: AdminRefund
  open: boolean
  onClose: () => void
  onDone?: () => void
}) {
  const send = useSendAdminRefund()
  const [amount, setAmount] = useState(String(Number(refund.amountOwed)))
  const [owedShown, setOwedShown] = useState(refund.amountOwed)
  if (owedShown !== refund.amountOwed) {
    setOwedShown(refund.amountOwed)
    setAmount(String(Number(refund.amountOwed)))
  }
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const owedPaise = Math.round(Number(refund.amountOwed) * 100)
  const amountPaise = toPaise(amount)
  const amountProblem =
    owedPaise === 0
      ? 'Nothing is left to refund on this.'
      : amountPaise === null || amountPaise <= 0
        ? 'Enter the amount to refund, in rupees.'
        : amountPaise > owedPaise
          ? `That's more than the ${formatRupees(refund.amountOwed)} still owed.`
          : null
  const canSubmit = !amountProblem && !send.isPending
  const part = amountPaise !== null && amountPaise < owedPaise
  const shown =
    amountPaise !== null && amountPaise > 0
      ? formatRupees(amountPaise / 100)
      : '₹0'

  const submit = () => {
    if (!canSubmit || amountPaise === null) return
    setError('')
    send.mutate(
      {
        bookingId: refund.bookingId,
        input: {
          kind: refund.kind,
          id: refund.id,
          amount: amountPaise / 100,
          note: note.trim() || undefined,
          // The figures on screen. If they have moved on at the server,
          // nothing is sent.
          expectedRefunded: Number(refund.amountRefunded),
        },
      },
      {
        onSuccess: () => {
          toast.success(`Refund of ${formatRupees(amountPaise / 100)} started`)
          onClose()
          onDone?.()
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't send this refund")),
      }
    )
  }

  return (
    <ScModal
      open={open}
      onClose={onClose}
      dismissible={!send.isPending}
      aria-label={`Refund now: #${refund.reference}`}
      className="flex max-w-[440px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          Refund now <span className="font-numeric">#{refund.reference}</span>
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          {refundKindLabel(refund)} · {refund.reason}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <div>
          <dt className="text-[11px] text-text-muted">Customer</dt>
          <dd className="truncate text-text-primary">{refund.customer.name}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-text-muted">
            {refund.bookingId ? 'Booking' : 'Checkout'}
          </dt>
          <dd className="font-numeric text-text-primary">
            #{refund.reference}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-text-muted">Owed</dt>
          <dd className="font-numeric text-text-primary">
            {formatRupees(refund.amountOwed)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-text-muted">Razorpay payment</dt>
          <dd className="truncate font-numeric text-text-primary">
            {refund.razorpayPaymentId}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1">
        <ScInput
          id="refund-now-amount"
          label="Amount to refund (₹)"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={Boolean(amountProblem)}
          className="min-h-11 font-numeric"
        />
        <p
          className={
            amountProblem
              ? 'text-[11px] text-error'
              : 'text-[11px] text-text-muted'
          }
        >
          {amountProblem ??
            (part
              ? 'A part refund. The rest stays on the Owed list.'
              : 'The full amount still owed.')}
        </p>
      </div>

      <ScTextarea
        id="refund-now-note"
        label="Note for the team (optional)"
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="flex flex-col gap-1 rounded-[10px] border border-border px-3 py-2 text-[12px] text-text-secondary">
        <p className="text-text-primary">
          Refunds take {BANK_DAYS} to reach the customer.
        </p>
        <p>
          The money goes back through Razorpay, from Detlio&apos;s balance, to
          how the customer paid. It can&apos;t be undone.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton
          variant="secondary"
          onClick={onClose}
          disabled={send.isPending}
          className="min-h-11"
        >
          Go back
        </ScButton>
        <ScButton onClick={submit} disabled={!canSubmit} className="min-h-11">
          {send.isPending ? 'Sending…' : `Refund ${shown} now`}
        </ScButton>
      </div>
    </ScModal>
  )
}
