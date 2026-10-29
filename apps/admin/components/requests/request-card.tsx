'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconPhone } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdminRequest } from '@repo/core/api/admin-requests'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useCancelAdminRequest } from '@repo/core/api/hooks/use-admin-requests'
import { telHref } from '@repo/core/contact-links'
import { cn } from '@repo/core/utils'
import { formatRupees } from '@/lib/bookings'
import {
  canCancelRequest,
  chainLine,
  needsGarageCall,
  requestClockLine,
  requestStateLabel,
  requestStateTone,
} from '@/lib/requests'

const TONE_CHIP = {
  attention: 'bg-tone-attention-tint text-tone-attention-text',
  progress: 'bg-tone-progress-tint text-tone-progress-text',
  done: 'bg-tone-done-tint text-tone-done-text',
  late: 'bg-tone-late-tint text-tone-late-text',
  closed: 'bg-tone-closed-tint text-tone-closed-text',
} as const

/** The reason's limits (the API's: 3 to 200 characters). */
const REASON_MIN = 3
const REASON_MAX = 200

/**
 * Cancel an open request with the team's reason. The customer gets a push
 * saying Detlio cancelled it (nothing was paid); the reason stays with the
 * team.
 */
export function CancelRequestDialog({
  request,
  onClose,
}: {
  request: AdminRequest
  onClose: () => void
}) {
  const cancel = useCancelAdminRequest()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const ready = reason.trim().length >= REASON_MIN

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!cancel.isPending}
      aria-label="Cancel this request"
      className="max-w-[420px]"
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!ready || cancel.isPending) return
          setError('')
          cancel.mutate(
            { id: request.id, reason: reason.trim() },
            {
              onSuccess: () => {
                toast.success('Request cancelled. The customer has been told.')
                onClose()
              },
              onError: (err) =>
                setError(
                  errorMessage(err, 'Couldn’t cancel the request. Try again.')
                ),
            }
          )
        }}
      >
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            Cancel this request?
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            {request.customer.name ?? 'The customer'} asked{' '}
            {request.garage.name}. They get a notification that Detlio cancelled
            it; nothing was paid. Your reason stays with the team.
          </p>
        </div>
        <ScTextarea
          label="Reason (for the team)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={REASON_MAX}
          rows={3}
          autoFocus
        />
        {error && (
          <p role="alert" className="text-[12px] text-tone-attention-text">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <ScButton
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={cancel.isPending}
            className="min-h-11"
          >
            Keep it
          </ScButton>
          <ScButton
            type="submit"
            variant="danger-outline"
            disabled={!ready || cancel.isPending}
            className="min-h-11"
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel request'}
          </ScButton>
        </div>
      </form>
    </ScModal>
  )
}

/**
 * One request on the admin list: where it stands and its clock, the
 * customer (the last four digits only), the garage, the zone, the window,
 * what was asked, the chain it went through, the travel fee; "Call garage"
 * while it waits for the garage, and Cancel while it is open.
 */
export function RequestCard({
  request,
  now,
  onCancel,
}: {
  request: AdminRequest
  now: number
  onCancel: (request: AdminRequest) => void
}) {
  const tel = telHref(request.garage.phone)
  const chain = chainLine(request)
  const mode = request.bookingType === 'pickup' ? 'Pickup' : 'Doorstep visit'
  return (
    <article
      aria-label={`Request from ${request.customer.name ?? 'a customer'} to ${request.garage.name}`}
      className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface px-4 py-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-text-primary">
            {request.customer.name ?? 'A customer'}{' '}
            <span className="font-numeric text-[12px] font-normal text-text-secondary">
              {request.customer.phone}
            </span>
          </p>
          <p className="text-[12px] text-text-secondary">
            {mode} · {request.zone ? request.zone.name : 'No zone'} ·{' '}
            {request.window.label}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium',
            TONE_CHIP[requestStateTone(request)]
          )}
        >
          {requestStateLabel(request)}
        </span>
      </div>
      <p className="text-[12.5px] text-text-primary">
        {request.items.map((item) => item.name).join(', ')} ·{' '}
        <span className="font-numeric">{formatRupees(request.subtotal)}</span>
        {request.travelFee !== null && (
          <>
            {' '}
            · travel fee{' '}
            <span className="font-numeric">
              {request.travelFee === 0
                ? 'none'
                : formatRupees(request.travelFee)}
            </span>
          </>
        )}
      </p>
      <p className="text-[12px] text-text-secondary">
        {requestClockLine(request, now)}
      </p>
      {chain && <p className="text-[12px] text-text-secondary">{chain}</p>}
      {(needsGarageCall(request) ||
        canCancelRequest(request) ||
        request.bookingId) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {needsGarageCall(request) && tel && (
            <a
              href={tel}
              aria-label={`Call garage ${request.garage.name}`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[12.5px] font-medium text-text-primary hover:bg-white/[0.04]"
            >
              <IconPhone size={14} aria-hidden />
              Call garage
            </a>
          )}
          {request.bookingId && (
            <Link
              href={`/bookings/${request.bookingId}`}
              className="inline-flex min-h-10 items-center text-[12.5px] font-medium text-text-primary underline underline-offset-4"
            >
              Open the booking
            </Link>
          )}
          {canCancelRequest(request) && (
            <button
              type="button"
              onClick={() => onCancel(request)}
              className="ml-auto min-h-10 px-2 text-[12.5px] text-tone-late-text underline underline-offset-4"
            >
              Cancel request
            </button>
          )}
        </div>
      )}
    </article>
  )
}
