'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdminBypassReport } from '@repo/core/api/bypass-reports'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useConfirmBypassReport, useDismissBypassReport } from '@repo/core/api/hooks/use-bypass-reports'
import { BYPASS_NUMBERS } from '@repo/core/bypass-reports'
import { SignedAs } from '@/components/signed-as'

/**
 * Confirm or Dismiss a bypass report (0052), signed with the admin's name,
 * as every money action is (the audit log keeps it). Confirming adds a strike to the
 * garage and, once per customer per garage, the reward; dismissing needs a
 * reason, for the team only. Mounted fresh for each press (keyed by the
 * caller).
 */
export function BypassAnswerDialog({
  report,
  action,
  rewardAmount,
  creditOn,
  onClose,
}: {
  report: AdminBypassReport
  action: 'confirm' | 'dismiss'
  /** Rupees, "100.00". */
  rewardAmount: string
  creditOn: boolean
  onClose: () => void
}) {
  const confirm = useConfirmBypassReport()
  const dismiss = useDismissBypassReport()
  const pending = confirm.isPending || dismiss.isPending
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const canSubmit = (action === 'confirm' || reason.trim().length >= 3) && !pending
  const reward = `₹${Number(rewardAmount).toLocaleString('en-IN')}`

  const submit = () => {
    if (!canSubmit) return
    setError('')
    const done = {
      onSuccess: (answered: unknown) => {
        const after = answered as AdminBypassReport
        toast.success(
          action === 'dismiss'
            ? 'Report dismissed'
            : after.reward.status === 'granted'
              ? `Confirmed — ${reward} added to the customer’s credit`
              : after.reward.status === 'owed'
                ? `Confirmed — ${reward} owed until Detlio credit is on`
                : 'Confirmed — no reward (already rewarded for this garage)'
        )
        onClose()
      },
      onError: (err: unknown) => setError(errorMessage(err, "Couldn't save this")),
    }
    if (action === 'confirm') confirm.mutate({ id: report.id }, done)
    else dismiss.mutate({ id: report.id, reason: reason.trim() }, done)
  }

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!pending}
      aria-label={action === 'confirm' ? 'Confirm report' : 'Dismiss report'}
      className="flex max-w-[440px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          {action === 'confirm' ? 'Confirm report' : 'Dismiss report'}
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          {report.garage.name} · booking <span className="font-numeric">#{report.booking.reference}</span> ·{' '}
          {report.kindLabel}
        </p>
      </div>

      {action === 'confirm' ? (
        <ul className="list-disc space-y-1 pl-4 text-[12px] text-text-primary">
          <li>
            A strike against {report.garage.name} for {BYPASS_NUMBERS.strikeWindowDays} days (it has{' '}
            <span className="font-numeric">{report.garage.strikes}</span> now). Any strike makes it ineligible for Detlio
            Certified.
          </li>
          <li>
            {report.customer
              ? creditOn
                ? `${reward} of Detlio credit for the customer, unless they were already rewarded for this garage.`
                : `${reward} for the customer, owed until Detlio credit is on (unless already rewarded for this garage).`
              : 'No reward: the customer’s account was deleted.'}
          </li>
          <li>The garage is never told who reported it. This can’t be undone.</li>
        </ul>
      ) : (
        <p className="text-[12px] text-text-primary">
          No strike and no reward. The customer reads that we looked into it; the reason stays with the team.
        </p>
      )}

      {action === 'dismiss' && (
        <ScTextarea
          id="bypass-answer-reason"
          label="Why"
          rows={2}
          maxLength={BYPASS_NUMBERS.dismissReasonMax}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}

      <SignedAs />

      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton variant="secondary" onClick={onClose} disabled={pending} className="min-h-11">
          Go back
        </ScButton>
        <ScButton onClick={submit} disabled={!canSubmit} className="min-h-11">
          {pending ? 'Saving…' : action === 'confirm' ? 'Confirm report' : 'Dismiss report'}
        </ScButton>
      </div>
    </ScModal>
  )
}
