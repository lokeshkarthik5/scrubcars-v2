'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdminCouponBatch } from '@repo/core/api/coupons'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useVoidCouponBatch, useVoidCouponCode } from '@repo/core/api/hooks/use-admin-coupons'
import { SignedAs } from '@/components/signed-as'

/**
 * Void a batch: no code of it can be added any more. By default the
 * vouchers customers added but have not used are cancelled too (a leaked
 * batch); untick to let them keep those. A voucher already on a booking is
 * never taken back. The reason goes to the audit log, signed with the
 * admin's name.
 */
export function VoidBatchDialog({ batch, onClose }: { batch: AdminCouponBatch; onClose: () => void }) {
  const voidBatch = useVoidCouponBatch(batch.id)
  const [reason, setReason] = useState('')
  const [cancelUnspent, setCancelUnspent] = useState(true)
  const [error, setError] = useState('')
  const canSubmit = reason.trim().length >= 3 && !voidBatch.isPending

  const submit = () => {
    if (!canSubmit) return
    setError('')
    voidBatch.mutate(
      { reason: reason.trim(), cancelUnspent },
      {
        onSuccess: (result) => {
          toast.success(
            result.cancelledVouchers > 0
              ? `Batch void. ${result.cancelledVouchers} unused ${result.cancelledVouchers === 1 ? 'coupon' : 'coupons'} cancelled.`
              : 'Batch void.'
          )
          onClose()
        },
        onError: (err) => setError(errorMessage(err, "Couldn't void this batch")),
      }
    )
  }

  return (
    <ScModal open onClose={onClose} dismissible={!voidBatch.isPending} aria-label={`Void ${batch.name}`} className="flex max-w-[440px] flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Void {batch.name}</h2>
        <p className="mt-1 text-[12px] text-text-secondary">{batch.location}</p>
      </div>
      <p className="text-[12px] text-text-primary">
        Nobody can add a coupon from this batch any more. This can&apos;t be undone.
      </p>
      <ScCheckbox
        label="Also cancel coupons customers added but haven't used"
        checked={cancelUnspent}
        onChange={setCancelUnspent}
      />
      <ScTextarea id="void-batch-reason" label="Why" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      <SignedAs />
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton variant="secondary" onClick={onClose} disabled={voidBatch.isPending} className="min-h-11">
          Go back
        </ScButton>
        <ScButton onClick={submit} disabled={!canSubmit} className="min-h-11">
          {voidBatch.isPending ? 'Voiding…' : 'Void batch'}
        </ScButton>
      </div>
    </ScModal>
  )
}

/**
 * Void one code (a card that was lost, a code posted online), typed in
 * full: only its hash is stored, so it can't be picked from a list. Its
 * unused coupon, if someone added it, is cancelled too.
 */
export function VoidCodeDialog({ batch, onClose }: { batch: AdminCouponBatch; onClose: () => void }) {
  const voidCode = useVoidCouponCode(batch.id)
  const [code, setCode] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const canSubmit = code.trim().length >= 10 && reason.trim().length >= 3 && !voidCode.isPending

  const submit = () => {
    if (!canSubmit) return
    setError('')
    voidCode.mutate(
      { code: code.trim(), reason: reason.trim() },
      {
        onSuccess: (result) => {
          toast.success(`Code ending ${result.suffix} void.`)
          onClose()
        },
        onError: (err) => setError(errorMessage(err, "Couldn't void this code")),
      }
    )
  }

  return (
    <ScModal open onClose={onClose} dismissible={!voidCode.isPending} aria-label="Void a code" className="flex max-w-[440px] flex-col gap-4">
      <h2 className="text-[15px] font-semibold text-text-primary">Void a code from {batch.name}</h2>
      <ScInput
        id="void-code"
        label="The code"
        placeholder="DTL-7K4QM-92MXA"
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="font-numeric tracking-wide"
      />
      <ScTextarea id="void-code-reason" label="Why" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      <SignedAs />
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton variant="secondary" onClick={onClose} disabled={voidCode.isPending} className="min-h-11">
          Go back
        </ScButton>
        <ScButton onClick={submit} disabled={!canSubmit} className="min-h-11">
          {voidCode.isPending ? 'Voiding…' : 'Void code'}
        </ScButton>
      </div>
    </ScModal>
  )
}
