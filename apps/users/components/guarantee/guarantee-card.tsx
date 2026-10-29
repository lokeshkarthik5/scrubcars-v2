'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconChevronRight, IconShieldCheck } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ScCard } from '@/components/ui/card'
import {
  useBookingGuarantee,
  useGuaranteeConfig,
  useWithdrawClaim,
} from '@repo/core/api/hooks/use-guarantee'
import { GUARANTEE_BUTTON, GUARANTEE_NAME } from '@repo/core/guarantee'
import { formatStepTime } from '@repo/core/job-records'
import type { Booking } from '@repo/core/types'

/**
 * Detlio Guarantee (0051) on the booking page: on a completed job inside its
 * 48 hours, "Not happy? Detlio Guarantee — free redo", opening the claim
 * screen; once a claim is made, where it stands in plain words (waiting for
 * the garage, with Detlio, redo booked for …, refund approved, not approved
 * and why), with "Pick a time" while a redo is approved. A free redo itself
 * says so. Nothing at all while the guarantee is off, or on a job that
 * cannot take a claim.
 */
export function GuaranteeCard({ booking }: { booking: Booking }) {
  const config = useGuaranteeConfig()
  const on = config.data?.enabled === true
  const completed = booking.status === 'completed'
  const guarantee = useBookingGuarantee(
    booking.id,
    on && completed && !booking.guaranteeRedo
  )
  const withdraw = useWithdrawClaim(booking.id)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | undefined>()

  if (!on) return null

  if (booking.guaranteeRedo) {
    return (
      <ScCard className="flex items-start gap-3">
        <IconShieldCheck
          size={20}
          aria-hidden
          className="mt-0.5 shrink-0 text-text-primary"
        />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Free redo · {GUARANTEE_NAME}
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            This booking redoes an earlier job at no charge. There is nothing to
            pay and no receipt for it.
          </p>
        </div>
      </ScCard>
    )
  }

  const data = guarantee.data
  if (!completed || !data) return null
  const claimPath = `/bookings/${booking.id}/guarantee`

  if (data.claim) {
    const claim = data.claim
    return (
      <ScCard className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <IconShieldCheck
            size={20}
            aria-hidden
            className="mt-0.5 shrink-0 text-text-primary"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {GUARANTEE_NAME}
            </p>
            <h2 className="text-sm font-semibold text-text-primary">
              {claim.title}
            </h2>
            {claim.body && (
              <p className="mt-0.5 text-[12px] text-text-secondary">
                {claim.body}
              </p>
            )}
          </div>
        </div>
        {claim.canBookRedo && (
          <ScButtonLink href={claimPath} fullWidth>
            Pick a time for your free redo
          </ScButtonLink>
        )}
        {claim.redoBooking && (
          <Link
            href={`/bookings/${claim.redoBooking.id}`}
            className="flex min-h-11 items-center justify-between rounded-[10px] border border-border px-3 text-[13px] text-text-primary"
          >
            <span>
              Free redo · {formatStepTime(claim.redoBooking.scheduledAt)}
            </span>
            <IconChevronRight size={16} aria-hidden />
          </Link>
        )}
        {!claim.canBookRedo && (
          <Link
            href={claimPath}
            className="text-[12px] text-text-secondary underline underline-offset-2"
          >
            See your claim
          </Link>
        )}
        {/* While nobody has answered it (0066). */}
        {claim.canWithdraw && (
          <button
            type="button"
            onClick={() => setWithdrawing(true)}
            className="min-h-11 self-start text-[12px] font-medium text-text-secondary underline underline-offset-2 transition-colors hover:text-text-primary"
          >
            Withdraw claim
          </button>
        )}
        <ConfirmSheet
          open={withdrawing}
          onClose={() => {
            setWithdrawing(false)
            setWithdrawError(undefined)
          }}
          onConfirm={async () => {
            try {
              await withdraw.mutateAsync(claim.id)
              toast.success('Claim withdrawn')
              setWithdrawing(false)
            } catch (err) {
              setWithdrawError(err instanceof Error ? err.message : 'Could not withdraw the claim')
            }
          }}
          level="light"
          title="Withdraw your free redo claim?"
          body="We'll close it and no redo is arranged. A booking takes one claim, so you can't claim on it again."
          confirmLabel="Withdraw claim"
          cancelLabel="Keep it"
          busy={withdraw.isPending}
          error={withdrawError}
        />
      </ScCard>
    )
  }

  if (!data.canClaim) return null

  return (
    <ScCard className="flex flex-col gap-2">
      <ScButtonLink
        href={claimPath}
        variant="secondary"
        fullWidth
        className="gap-2"
      >
        <IconShieldCheck size={18} aria-hidden />
        {GUARANTEE_BUTTON}
      </ScButtonLink>
      {data.claimBy && (
        <p className="text-center text-[12px] text-text-secondary">
          Ask with photos of the problem by {formatStepTime(data.claimBy)}.
        </p>
      )}
    </ScCard>
  )
}
