'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdminRefund } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useRecordAdminRefund } from '@repo/core/api/hooks/use-admin-refunds'
import { CopyButton } from '@/components/copy-button'
import { formatRupees } from '@/lib/bookings'
import { refundKindLabel } from '@/lib/refunds'

/** Same shape the API checks: rfnd_ and letters and digits. */
const REFUND_ID = /^rfnd_[A-Za-z0-9]{1,59}$/

/** Rupees as typed, in paise, or null when it isn't an amount to the paisa. */
function toPaise(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  return Math.round(Number(trimmed) * 100)
}

/**
 * Records a refund ops has just done in the Razorpay dashboard.
 *
 * The amount starts at everything still owed — the usual case — and can be
 * lowered for a part refund. The Razorpay refund id is what reconciliation
 * needs, so it is asked for by default; money sent back another way (UPI, a
 * bank transfer) has none, and then ops says how instead. Nothing here
 * refunds anything: that happens in Razorpay, before this.
 *
 * Mounted fresh for each refund (keyed by the caller), so it always opens
 * with that refund's figures. The caller passes the latest copy of the
 * refund on every render, not the one that was clicked: a refusal refetches
 * the lists, and the figures here follow, so "its latest figures are shown"
 * is true. The amount follows what is owed when that changes.
 *
 * `onDone` runs after a refund is recorded and the dialog has closed. The
 * card that opened it usually goes (it leaves the Owed list, or its button
 * does), so the caller moves focus somewhere that stays.
 */
export function MarkRefundedDialog({
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
  const record = useRecordAdminRefund()
  const [amount, setAmount] = useState(String(Number(refund.amountOwed)))
  // What had been refunded when the dialog opened, to say so when that moves
  // while it is open (someone else recorded one, or an earlier try of this
  // one went through and its answer was lost).
  const [openedRefunded] = useState(refund.amountRefunded)
  const movedSinceOpened =
    Number(refund.amountRefunded) !== Number(openedRefunded)

  // Prefilled with what is owed, again whenever that changes under it, so
  // the full-refund default never asks for more than is left.
  const [owedShown, setOwedShown] = useState(refund.amountOwed)
  if (owedShown !== refund.amountOwed) {
    setOwedShown(refund.amountOwed)
    setAmount(String(Number(refund.amountOwed)))
  }
  const [outside, setOutside] = useState(false)
  const [refundRef, setRefundRef] = useState('')
  const [outsideNote, setOutsideNote] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const owedPaise = Math.round(Number(refund.amountOwed) * 100)
  const amountPaise = toPaise(amount)
  const amountProblem =
    owedPaise === 0
      ? 'Nothing is left to refund on this.'
      : amountPaise === null || amountPaise <= 0
        ? 'Enter the amount refunded, in rupees.'
        : amountPaise > owedPaise
          ? `That's more than the ${formatRupees(refund.amountOwed)} still owed.`
          : null
  const refTyped = refundRef.trim()
  const refProblem =
    !outside && refTyped && !REFUND_ID.test(refTyped)
      ? "That isn't a Razorpay refund id. It starts rfnd_ (a payment id starts pay_)."
      : null
  const canSubmit =
    !amountProblem &&
    (outside ? outsideNote.trim().length > 0 : REFUND_ID.test(refTyped)) &&
    !record.isPending
  const part = amountPaise !== null && amountPaise < owedPaise

  const submit = () => {
    if (!canSubmit || amountPaise === null) return
    setError('')
    record.mutate(
      {
        bookingId: refund.bookingId,
        input: {
          kind: refund.kind,
          id: refund.id,
          amount: amountPaise / 100,
          ...(outside
            ? { outsideRazorpayNote: outsideNote.trim() }
            : { refundRef: refTyped }),
          note: note.trim() || undefined,
          // The figures on screen. If they have moved on at the server, the
          // refund is refused rather than added on top of them.
          expectedRefunded: Number(refund.amountRefunded),
        },
      },
      {
        onSuccess: () => {
          toast.success(`Refund of ${formatRupees(amountPaise / 100)} recorded`)
          onClose()
          onDone?.()
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't record this refund")),
      }
    )
  }

  return (
    <ScModal
      open={open}
      onClose={onClose}
      dismissible={!record.isPending}
      aria-label={`Mark refunded: #${refund.reference}`}
      className="flex max-w-[440px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          Mark refunded{' '}
          <span className="font-numeric">#{refund.reference}</span>
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          {refundKindLabel(refund)} · {refund.customer.name} ·{' '}
          <span className="font-numeric text-text-primary">
            {formatRupees(refund.amountOwed)}
          </span>{' '}
          owed
        </p>
      </div>

      {movedSinceOpened && (
        <p role="status" className="text-[12px] text-text-primary">
          <span className="font-numeric">
            {formatRupees(refund.amountRefunded)}
          </span>{' '}
          is now recorded as refunded on this, since you opened it. The figures
          here are the latest.
        </p>
      )}

      {/* The payment to find in Razorpay, said before anything is typed:
          refunding the wrong payment is the costly mistake here. */}
      {refund.razorpayPaymentId && (
        <div className="flex min-w-0 items-center rounded-[10px] border border-border px-3">
          <span className="text-[12px] text-text-secondary">Payment</span>
          <span className="ml-2 truncate font-numeric text-[13px] text-text-primary">
            {refund.razorpayPaymentId}
          </span>
          <CopyButton
            value={refund.razorpayPaymentId}
            label={`Copy Razorpay payment id ${refund.razorpayPaymentId}`}
            className="ml-auto shrink-0"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <ScInput
          id="refund-amount"
          label="Amount refunded (₹)"
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
              ? 'text-[12px] text-error'
              : 'text-[12px] text-text-muted'
          }
        >
          {amountProblem ??
            (part
              ? 'A part refund. The rest stays on the Owed list.'
              : 'The full amount still owed.')}
        </p>
      </div>

      <ScCheckbox
        label="Refunded outside Razorpay (UPI or bank transfer)"
        checked={outside}
        onChange={setOutside}
        className="min-h-11"
      />

      {outside ? (
        <ScTextarea
          id="refund-outside"
          label="How was it refunded?"
          rows={2}
          maxLength={500}
          value={outsideNote}
          onChange={(e) => setOutsideNote(e.target.value)}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <ScInput
            id="refund-ref"
            label="Razorpay refund id"
            placeholder="rfnd_…"
            autoComplete="off"
            spellCheck={false}
            value={refundRef}
            onChange={(e) => setRefundRef(e.target.value)}
            aria-invalid={Boolean(refProblem)}
            className="min-h-11 font-numeric"
          />
          <p
            className={
              refProblem
                ? 'text-[12px] text-error'
                : 'text-[12px] text-text-muted'
            }
          >
            {refProblem ?? 'Copy it from the refund in the Razorpay dashboard.'}
          </p>
        </div>
      )}

      <ScTextarea
        id="refund-note"
        label="Note for the team (optional)"
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton
          variant="secondary"
          onClick={onClose}
          disabled={record.isPending}
          className="min-h-11"
        >
          Go back
        </ScButton>
        {/* The one red button: recording is final, and a second record is
            refused. */}
        <ScButton onClick={submit} disabled={!canSubmit} className="min-h-11">
          {record.isPending ? 'Saving…' : 'Mark refunded'}
        </ScButton>
      </div>
    </ScModal>
  )
}
