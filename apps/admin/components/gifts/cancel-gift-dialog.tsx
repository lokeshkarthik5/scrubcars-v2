'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdminGift } from '@repo/core/api/gifts'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useCancelAdminGift } from '@repo/core/api/hooks/use-admin-gifts'
import { rememberName, rememberedName } from '@/lib/actor-name'
import { formatRupees } from '@/lib/bookings'

/**
 * Cancel gift: for a gift whose buyer is being refunded by hand in the
 * Razorpay dashboard. Nothing is refunded from here; the gift's link stops
 * working and it can no longer be redeemed. The name and reason go to the
 * audit log. Mounted fresh for each gift (keyed by the caller).
 */
export function CancelGiftDialog({ gift, onClose }: { gift: AdminGift; onClose: () => void }) {
  const cancel = useCancelAdminGift()
  const [name, setName] = useState(rememberedName)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const canSubmit = name.trim().length >= 2 && reason.trim().length >= 3 && !cancel.isPending

  const submit = () => {
    if (!canSubmit) return
    setError('')
    rememberName(name.trim())
    cancel.mutate(
      { giftId: gift.id, actorName: name.trim(), reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Gift ${gift.number} cancelled`)
          onClose()
        },
        onError: (err) => setError(errorMessage(err, "Couldn't cancel this gift")),
      }
    )
  }

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!cancel.isPending}
      aria-label={`Cancel gift ${gift.number}`}
      className="flex max-w-[440px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          Cancel gift <span className="font-numeric">{gift.number}</span>
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          <span className="font-numeric text-text-primary">{formatRupees(gift.amount)}</span> from {gift.buyer.name}{' '}
          for {gift.recipientName}
        </p>
      </div>

      <p className="text-[12px] text-text-primary">
        Use this when the buyer is being refunded by hand in the Razorpay dashboard. The gift link stops working.
        Nothing is refunded from here.
      </p>

      {gift.paymentId && (
        <p className="text-[12px] text-text-secondary">
          Razorpay payment <span className="font-numeric text-text-primary">{gift.paymentId}</span>
        </p>
      )}

      <ScInput
        id="cancel-gift-name"
        label="Your name"
        autoComplete="name"
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <ScTextarea
        id="cancel-gift-reason"
        label="Why"
        rows={2}
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton variant="secondary" onClick={onClose} disabled={cancel.isPending} className="min-h-11">
          Go back
        </ScButton>
        <ScButton onClick={submit} disabled={!canSubmit} className="min-h-11">
          {cancel.isPending ? 'Cancelling…' : 'Cancel gift'}
        </ScButton>
      </div>
    </ScModal>
  )
}
