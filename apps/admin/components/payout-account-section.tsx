'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScField } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { PayoutAccount } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminPayoutAccount,
  useRemovePayoutAccount,
  useSavePayoutAccount,
} from '@repo/core/api/hooks/use-admin-payouts'
import { istDateTimeLabel } from '@repo/core/ist-input'

/** Same shapes as the API (lib/payouts.ts). */
const ACCOUNT_NUMBER = /^[0-9]{9,18}$/
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/
const UPI_ID = /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]+$/

interface Draft {
  accountName: string
  accountNumber: string
  ifsc: string
  upiId: string
}

function draftOf(account: PayoutAccount | null | undefined): Draft {
  return {
    accountName: account?.accountName ?? '',
    accountNumber: account?.accountNumber ?? '',
    ifsc: account?.ifsc ?? '',
    upiId: account?.upiId ?? '',
  }
}

/** What is wrong with the typed details, or null when they can be saved. */
export function payoutDetailsProblem(draft: Draft): string | null {
  const number = draft.accountNumber.replace(/\s+/g, '')
  const ifsc = draft.ifsc.trim().toUpperCase()
  const upi = draft.upiId.trim()
  if (!number && !upi) return 'Give a bank account or a UPI id.'
  if (Boolean(number) !== Boolean(ifsc))
    return 'Give the account number and the IFSC together.'
  if (number && !ACCOUNT_NUMBER.test(number))
    return 'An account number is 9 to 18 digits.'
  if (ifsc && !IFSC.test(ifsc))
    return 'An IFSC is 11 characters, like HDFC0001234.'
  if (upi && !UPI_ID.test(upi)) return 'A UPI id looks like name@bank.'
  return null
}

/**
 * Where Detlio sends a garage's payouts: a bank account (name, number,
 * IFSC) and/or a UPI id. Admin only: the garage's own portal never shows
 * them, and the Payouts list shows only the last four digits.
 *
 * Saves immediately, like the team section: it does not wait for "Save
 * changes", which only covers the garage form around it. Inside that form's
 * read-only fieldset while the garage is in the Bin.
 */
export function PayoutAccountSection({ vendorId }: { vendorId: string }) {
  const {
    data: account,
    isLoading,
    error: loadError,
  } = useAdminPayoutAccount(vendorId)
  // Only remounted when the saved details change, so what is typed stays.
  return isLoading ? (
    <ScSection title="Payout details">
      <SkeletonList count={2} itemClassName="h-14 rounded-[10px]" />
    </ScSection>
  ) : loadError ? (
    <ScSection title="Payout details">
      <p role="alert" className="text-[12px] text-error">
        {errorMessage(loadError, "Couldn't load the payout details.")}
      </p>
    </ScSection>
  ) : (
    <PayoutAccountForm
      key={account?.updatedAt ?? 'none'}
      vendorId={vendorId}
      account={account ?? null}
    />
  )
}

function PayoutAccountForm({
  vendorId,
  account,
}: {
  vendorId: string
  account: PayoutAccount | null
}) {
  const save = useSavePayoutAccount(vendorId)
  const remove = useRemovePayoutAccount(vendorId)
  const [draft, setDraft] = useState<Draft>(() => draftOf(account))
  const [actorName, setActorName] = useState('')
  const [error, setError] = useState('')
  const set = (key: keyof Draft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const problem = payoutDetailsProblem(draft)
  const changed = JSON.stringify(draft) !== JSON.stringify(draftOf(account))
  const busy = save.isPending || remove.isPending

  const submit = () => {
    if (problem || actorName.trim().length < 2) return
    setError('')
    save.mutate(
      {
        accountName: draft.accountName.trim() || null,
        accountNumber: draft.accountNumber.replace(/\s+/g, '') || null,
        ifsc: draft.ifsc.trim().toUpperCase() || null,
        upiId: draft.upiId.trim() || null,
        actorName: actorName.trim(),
      },
      {
        onSuccess: () => toast.success('Payout details saved'),
        onError: (err) =>
          setError(errorMessage(err, "Couldn't save the payout details")),
      }
    )
  }

  return (
    <ScSection title="Payout details">
      <p className="text-[12px] text-text-muted">
        Where Detlio sends this garage its share. Saved immediately — not part
        of “Save changes”. Only the team sees these; the garage list shows the
        last four digits.
      </p>
      <ScField
        label="Account holder name"
        value={draft.accountName}
        onChange={set('accountName')}
        autoComplete="off"
      />
      <div className="grid grid-cols-2 gap-3">
        <ScField
          label="Account number"
          value={draft.accountNumber}
          onChange={set('accountNumber')}
          inputMode="numeric"
          autoComplete="off"
          className="font-numeric"
        />
        <ScField
          label="IFSC"
          value={draft.ifsc}
          onChange={set('ifsc')}
          autoComplete="off"
          spellCheck={false}
          className="font-numeric uppercase"
        />
      </div>
      <ScField
        label="UPI id"
        value={draft.upiId}
        onChange={set('upiId')}
        placeholder="name@bank"
        autoComplete="off"
        spellCheck={false}
      />
      <ScField
        label="Your name"
        value={actorName}
        onChange={setActorName}
        autoComplete="name"
      />
      {changed && problem && (
        <p className="text-[12px] text-error">{problem}</p>
      )}
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}
      {account && (
        <p className="text-[12px] text-text-muted">
          Last changed by {account.updatedBy},{' '}
          {istDateTimeLabel(account.updatedAt)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <ScButton
          variant="secondary"
          onClick={submit}
          disabled={
            !changed || Boolean(problem) || actorName.trim().length < 2 || busy
          }
          className="min-h-11"
          fullWidth={false}
        >
          {save.isPending ? 'Saving…' : 'Save payout details'}
        </ScButton>
        {account && (
          <ScButton
            variant="secondary"
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => toast.success('Payout details removed'),
                onError: (err) =>
                  setError(
                    errorMessage(err, "Couldn't remove the payout details")
                  ),
              })
            }
            disabled={busy}
            className="min-h-11"
            fullWidth={false}
          >
            Remove
          </ScButton>
        )}
      </div>
    </ScSection>
  )
}
