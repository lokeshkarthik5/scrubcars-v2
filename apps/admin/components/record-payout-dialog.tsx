'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import { ScSelect } from '@repo/ui/sc/select'
import type { AdminGaragePayouts, PayoutMethod } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useRecordPayout } from '@repo/core/api/hooks/use-admin-payouts'
import { fromIstInput, istDateTimeLabel, toIstInput } from '@repo/core/ist-input'
import { PAYOUT_METHOD_LABEL, rupeesLabel } from '@repo/core/payouts'

/** Same shape as the API: letters, numbers and - / _ . */
const REFERENCE = /^[A-Za-z0-9/_.-]{4,80}$/

/**
 * Records a payout the team has just made by bank transfer or UPI.
 *
 * The amount is not typed: a payout settles every booking due up to the
 * moment the page worked its figures out (`upTo`), for exactly what they
 * come to. If that has moved by the time Record is pressed (a job finished,
 * a refund landed), the API refuses and the page shows the new figure.
 * Nothing here moves money; that happened in the bank, before this.
 *
 * Mounted fresh each time it opens (keyed by the caller).
 */
export function RecordPayoutDialog({
  data,
  open,
  onClose,
}: {
  data: AdminGaragePayouts
  open: boolean
  onClose: () => void
}) {
  const record = useRecordPayout(data.garage.id)
  const [method, setMethod] = useState<PayoutMethod>(
    data.account?.accountNumber ? 'bank' : data.account?.upiId ? 'upi' : 'bank'
  )
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(() => toIstInput(new Date().toISOString()))
  const [note, setNote] = useState('')
  const [actorName, setActorName] = useState('')
  const [error, setError] = useState('')

  const ref = reference.trim()
  const paidAtIso = fromIstInput(paidAt)
  const refProblem = ref && !REFERENCE.test(ref) ? 'Letters and numbers only, as the bank shows it.' : null
  const canSubmit =
    data.payable.refusal === null &&
    REFERENCE.test(ref) &&
    paidAtIso !== null &&
    actorName.trim().length >= 2 &&
    !record.isPending

  const submit = () => {
    if (!canSubmit || !paidAtIso) return
    setError('')
    record.mutate(
      {
        amount: data.payable.amount,
        upTo: data.upTo,
        method,
        reference: ref,
        paidAt: paidAtIso,
        note: note.trim() || undefined,
        actorName: actorName.trim(),
      },
      {
        onSuccess: (payout) => {
          toast.success(`Payout of ${rupeesLabel(payout.amount)} recorded`)
          onClose()
        },
        onError: (err) => setError(errorMessage(err, "Couldn't record this payout")),
      }
    )
  }

  return (
    <ScModal
      open={open}
      onClose={onClose}
      dismissible={!record.isPending}
      aria-label={`Record payout: ${data.garage.name}`}
      className="flex max-w-[440px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Record payout</h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          {data.garage.name} ·{' '}
          <span className="font-numeric text-text-primary">{rupeesLabel(data.payable.amount)}</span> for{' '}
          {data.payable.bookings} {data.payable.bookings === 1 ? 'booking' : 'bookings'} due up to{' '}
          <span className="font-numeric">{istDateTimeLabel(data.upTo)}</span>
        </p>
      </div>

      <p className="text-[12px] text-text-secondary">
        Send the money first, in the bank or UPI app, then record it here with its reference. The garage sees the
        reference on its Earnings.
      </p>

      <ScSelect
        label="Paid by"
        value={method}
        onChange={(e) => setMethod(e.target.value as PayoutMethod)}
        className="min-h-11"
      >
        {(Object.keys(PAYOUT_METHOD_LABEL) as PayoutMethod[]).map((value) => (
          <option key={value} value={value}>
            {PAYOUT_METHOD_LABEL[value]}
          </option>
        ))}
      </ScSelect>

      <div className="flex flex-col gap-1">
        <ScInput
          id="payout-reference"
          label={method === 'upi' ? 'UPI transaction id' : method === 'bank' ? 'UTR (bank reference)' : 'Reference'}
          autoComplete="off"
          spellCheck={false}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          aria-invalid={Boolean(refProblem)}
          className="min-h-11 font-numeric"
        />
        <p className={refProblem ? 'text-[11px] text-error' : 'text-[11px] text-text-muted'}>
          {refProblem ?? 'Required. Copy it from the bank or UPI app.'}
        </p>
      </div>

      <ScInput
        id="payout-paid-at"
        type="datetime-local"
        label="Paid at (India time)"
        value={paidAt}
        onChange={(e) => setPaidAt(e.target.value)}
        className="min-h-11 font-numeric"
      />

      <ScTextarea
        id="payout-note"
        label="Note (optional)"
        rows={2}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <ScInput
        id="payout-actor"
        label="Your name"
        autoComplete="name"
        value={actorName}
        onChange={(e) => setActorName(e.target.value)}
        className="min-h-11"
      />

      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton variant="secondary" onClick={onClose} disabled={record.isPending} className="min-h-11">
          Go back
        </ScButton>
        {/* The one red button: a payout is final and settles these bookings. */}
        <ScButton onClick={submit} disabled={!canSubmit} className="min-h-11">
          {record.isPending ? 'Recording…' : `Record ${rupeesLabel(data.payable.amount)}`}
        </ScButton>
      </div>
    </ScModal>
  )
}
