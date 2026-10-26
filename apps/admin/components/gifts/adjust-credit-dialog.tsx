'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdminCustomerCredit } from '@repo/core/api/gifts'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdjustCustomerCredit } from '@repo/core/api/hooks/use-admin-gifts'
import { SignedAs } from '@/components/signed-as'
import { formatRupees } from '@/lib/bookings'
import { parseAdjustment, signedRupees } from '@/lib/gifts'

/**
 * Adjust credit: adds to or takes from one customer's Detlio credit by
 * hand, with a reason, recorded in the audit log with the signed-in
 * admin's name. A deduction can't go below what the customer has (the server
 * refuses with CREDIT_ADJUSTMENT_OVER_BALANCE). Mounted fresh each time.
 */
export function AdjustCreditDialog({
  data,
  onClose,
}: {
  data: AdminCustomerCredit
  onClose: () => void
}) {
  const adjust = useAdjustCustomerCredit()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const parsed = amount.trim() ? parseAdjustment(amount) : null
  const amountProblem = parsed && 'problem' in parsed ? parsed.problem : null
  const value = parsed && 'amount' in parsed ? parsed.amount : null
  const canSubmit =
    value !== null &&
    reason.trim().length >= 3 &&
    !adjust.isPending

  const submit = () => {
    if (!canSubmit || value === null) return
    setError('')
    adjust.mutate(
      {
        userId: data.customer.id,
        amount: value,
        reason: reason.trim(),
      },
      {
        onSuccess: (updated) => {
          toast.success(
            `Credit adjusted. Balance ${formatRupees(updated.credit.balance)}`
          )
          onClose()
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't adjust the credit")),
      }
    )
  }

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!adjust.isPending}
      aria-label={`Adjust credit for ${data.customer.name}`}
      className="flex max-w-[440px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          Adjust credit
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          {data.customer.name} · balance{' '}
          <span className="font-numeric text-text-primary">
            {formatRupees(data.credit.balance)}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <ScInput
          id="adjust-credit-amount"
          label="Amount (₹)"
          placeholder="+200 or −150"
          inputMode="text"
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
            (value !== null
              ? `${signedRupees(value)} to the customer's credit.`
              : '+ adds credit, − takes it away. Up to ₹10,000 at a time.')}
        </p>
      </div>

      <ScTextarea
        id="adjust-credit-reason"
        label="Reason"
        rows={2}
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <SignedAs />
      <p className="text-[12px] text-text-muted">
        Recorded in the audit log with your name and reason. The customer sees
        it as &ldquo;Adjusted by Detlio&rdquo;, without the reason.
      </p>

      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton
          variant="secondary"
          onClick={onClose}
          disabled={adjust.isPending}
          className="min-h-11"
        >
          Go back
        </ScButton>
        <ScButton onClick={submit} disabled={!canSubmit} className="min-h-11">
          {adjust.isPending ? 'Saving…' : 'Adjust credit'}
        </ScButton>
      </div>
    </ScModal>
  )
}
