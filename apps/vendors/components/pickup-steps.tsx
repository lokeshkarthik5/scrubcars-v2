'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { ApiError } from '@repo/core/api/client'
import {
  markAtGarage,
  markDelivered,
  markOutForDelivery,
  markPickedUp,
} from '@repo/core/api/bookings'
import {
  handoverLocked,
  MAX_CODE_ATTEMPTS,
  PICKUP_STEP_LABELS,
  type PickupNext,
} from '@repo/core/pickup'
import { SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_HREF } from '@repo/core/support'
import type { Booking } from '@repo/core/types'

/** What each step's button explains, under it. */
const STEP_HINTS: Record<PickupNext, string> = {
  picked_up:
    "Ask the customer for the 4-digit pickup code in their Detlio app. From now until the car is back, it's in your care.",
  at_garage: 'Press when the car arrives at your garage.',
  start_work: 'Start the work on the car.',
  out_for_delivery: 'Press when the work is done and the car leaves to go back to the customer.',
  delivered:
    'Ask the customer for the 4-digit delivery code in their Detlio app. This finishes the job.',
}

/**
 * Pickup & drop's step on a job card: the one thing the job waits for, as
 * the server says (`pickup.nextStep`), so the card never restates the order.
 * Picked up and Delivered take the customer's code; a wrong one says the
 * tries left, and too many send the garage to Detlio, which can confirm the
 * handover from admin once it has spoken to the customer. The garage never
 * sees the codes: the customer reads them out.
 */
export function PickupSteps({
  booking,
  onStartWork,
  onChanged,
}: {
  booking: Booking
  /** The normal Mark in progress, once the car is at the garage. */
  onStartWork: () => Promise<void> | void
  /** Re-read the job list after a step. */
  onChanged: () => void
}) {
  const step = booking.pickup?.nextStep ?? null
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // The step a "too many wrong codes" answer came back on. Tied to that step,
  // so when Detlio confirms the handover and the job moves on, it clears.
  const [lockedStep, setLockedStep] = useState<PickupNext | null>(null)

  if (!step) return null

  const needsCode = step === 'picked_up' || step === 'delivered'
  const triesLeft =
    step === 'picked_up' ? booking.pickup?.pickupCodeTriesLeft : booking.pickup?.deliveryCodeTriesLeft
  const outOfTries = handoverLocked(step, lockedStep, triesLeft)
  const who = booking.customerName ?? 'this customer'

  const run = async () => {
    setBusy(true)
    try {
      if (step === 'picked_up') await markPickedUp(booking.id, code)
      else if (step === 'delivered') await markDelivered(booking.id, code)
      else if (step === 'at_garage') await markAtGarage(booking.id)
      else if (step === 'out_for_delivery') await markOutForDelivery(booking.id)
      else await onStartWork()
      setCode('')
      if (step !== 'start_work') toast.success(`${PICKUP_STEP_LABELS[step]} marked`)
      onChanged()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'HANDOVER_CODE_LOCKED') setLockedStep(step)
      toast.error(error instanceof Error ? error.message : 'Could not update this booking')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {needsCode && !outOfTries && (
        <ScInput
          id={`pickup-code-${booking.id}`}
          label={step === 'picked_up' ? "Customer's pickup code" : "Customer's delivery code"}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="4 digits"
          className="font-numeric tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      )}

      {outOfTries ? (
        <p role="alert" className="text-[12px] text-warning">
          Too many wrong codes. Call Detlio support on{' '}
          <a href={SUPPORT_TEL_HREF} className="font-numeric underline">
            {SUPPORT_PHONE_DISPLAY}
          </a>
          : we can confirm the handover once we have spoken to the customer.
        </p>
      ) : (
        <>
          <ScButton
            aria-label={`Mark ${PICKUP_STEP_LABELS[step]} for ${who}`}
            disabled={busy || (needsCode && code.length !== 4)}
            onClick={run}
          >
            {busy
              ? 'Saving...'
              : step === 'start_work'
                ? 'Mark in progress'
                : PICKUP_STEP_LABELS[step]}
          </ScButton>
          <p className="text-[11px] text-text-secondary">
            {STEP_HINTS[step]}
            {needsCode && triesLeft !== undefined && triesLeft < MAX_CODE_ATTEMPTS && (
              <>
                {' '}
                <span className="font-numeric">{triesLeft}</span>{' '}
                {triesLeft === 1 ? 'try' : 'tries'} left.
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
