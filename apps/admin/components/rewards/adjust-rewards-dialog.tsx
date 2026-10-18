'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdjustRewardsPayload, AdminCustomerRewards } from '@repo/core/api/rewards'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdjustCustomerRewards } from '@repo/core/api/hooks/use-admin-rewards'
import { rememberName, rememberedName } from '@/lib/actor-name'

type Action = AdjustRewardsPayload['action']

const ACTIONS: Array<{ value: Action; label: string }> = [
  { value: 'add_stamps', label: 'Add stamps' },
  { value: 'remove_stamps', label: 'Remove stamps' },
  { value: 'issue_voucher', label: 'Give a voucher' },
  { value: 'cancel_voucher', label: 'Cancel a voucher' },
]

/**
 * A manual adjustment to one customer's rewards: stamps on or off the card
 * (1–5), a voucher (₹1–₹500), or cancelling an unspent voucher. Always a
 * reason and the typed name, recorded in the audit log.
 */
export function AdjustRewardsDialog({ data, onClose }: { data: AdminCustomerRewards; onClose: () => void }) {
  const adjust = useAdjustCustomerRewards(data.customer.id)
  const [action, setAction] = useState<Action>('add_stamps')
  const [number, setNumber] = useState('1')
  const [voucherId, setVoucherId] = useState('')
  const [reason, setReason] = useState('')
  const [name, setName] = useState(rememberedName)
  const [error, setError] = useState('')
  const unspent = data.vouchers.filter((v) => v.state === 'available')

  const value = Number(number)
  const valid =
    (action === 'cancel_voucher' ? !!voucherId : Number.isInteger(value) && value >= 1 && value <= (action === 'issue_voucher' ? 500 : 5)) &&
    reason.trim().length >= 3 &&
    name.trim().length >= 2

  const submit = () => {
    if (!valid || adjust.isPending) return
    setError('')
    rememberName(name.trim())
    const base = { reason: reason.trim(), actorName: name.trim() }
    const payload: AdjustRewardsPayload =
      action === 'cancel_voucher'
        ? { action, voucherId, ...base }
        : action === 'issue_voucher'
          ? { action, amount: value, ...base }
          : { action, stamps: value, ...base }
    adjust.mutate(payload, {
      onSuccess: () => {
        toast.success('Rewards adjusted')
        onClose()
      },
      onError: (err) => setError(errorMessage(err, "Couldn't adjust the rewards")),
    })
  }

  return (
    <ScModal open onClose={onClose} dismissible={!adjust.isPending} aria-label={`Adjust rewards for ${data.customer.name}`} className="flex max-w-[440px] flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Adjust rewards</h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          {data.customer.name} · <span className="font-numeric">{data.card.onCard}</span> stamps on the card
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What to change">
        {ACTIONS.map((a) => (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={action === a.value}
            onClick={() => setAction(a.value)}
            className={
              action === a.value
                ? 'rounded-full border border-brand-white bg-brand-white px-3 py-1.5 text-[12px] text-brand-black'
                : 'rounded-full border border-border px-3 py-1.5 text-[12px] text-text-primary'
            }
          >
            {a.label}
          </button>
        ))}
      </div>
      {action === 'cancel_voucher' ? (
        unspent.length === 0 ? (
          <p className="text-[12px] text-text-secondary">No unspent vouchers to cancel.</p>
        ) : (
          <select
            aria-label="Voucher"
            value={voucherId}
            onChange={(e) => setVoucherId(e.target.value)}
            className="h-11 rounded-[10px] border border-border bg-surface px-3 text-[13px] text-text-primary"
          >
            <option value="">Pick a voucher</option>
            {unspent.map((v) => (
              <option key={v.id} value={v.id}>
                ₹{Math.round(Number(v.amount))} · {v.label} · {v.code}
              </option>
            ))}
          </select>
        )
      ) : (
        <ScInput
          label={action === 'issue_voucher' ? 'Amount (₹1–₹500)' : 'Stamps (1–5)'}
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
          className="min-h-11 font-numeric"
        />
      )}
      <ScTextarea label="Reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      <ScInput label="Your name" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <p className="text-[11px] text-text-muted">Recorded in the audit log with your name and reason. A voucher from the team is Detlio-funded, like every reward.</p>
      {error && (
        <p role="alert" className="text-[12px] text-error">{error}</p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton variant="secondary" onClick={onClose} disabled={adjust.isPending} className="min-h-11">Go back</ScButton>
        <ScButton onClick={submit} disabled={!valid || adjust.isPending} className="min-h-11">
          {adjust.isPending ? 'Saving…' : 'Save'}
        </ScButton>
      </div>
    </ScModal>
  )
}
