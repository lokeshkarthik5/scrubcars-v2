'use client'

import { useEffect, useState } from 'react'
import { IconShieldCheck } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { TopBar } from '@repo/ui/sc/top-bar'
import { GuaranteeEvidence } from '@repo/ui/features/guarantee-photos'
import type { GarageClaim } from '@repo/core/api/guarantee'
import {
  useAnswerClaim,
  useGarageClaims,
  useGuaranteeConfig,
} from '@repo/core/api/hooks/use-guarantee'
import {
  CLAIM_STATUS_LABELS,
  GUARANTEE_RULES,
  timeLeftLabel,
} from '@repo/core/guarantee'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { formatStepTime } from '@repo/core/job-records'

/**
 * Free redo claims (Detlio Guarantee, 0051), for the owner seat: each
 * customer's photos of the problem beside the garage's own before and after
 * photos, what they say is wrong, and the clock. Accept and the customer
 * picks a free redo time within 7 days; Dispute, saying why, and Detlio
 * decides. No answer in time approves the redo, and a job with no
 * before/after photos is approved at once: the photos are the garage's
 * defence. Only this garage's claims ever reach the page (resolveTenant).
 */
export default function GuaranteeClaimsPage() {
  const t = useT()
  const isVendorAdmin = useIsVendorAdmin()
  const config = useGuaranteeConfig()
  const on = config.data?.enabled === true
  const [scope, setScope] = useState<'open' | 'closed'>('open')
  const claims = useGarageClaims(scope, on && isVendorAdmin)
  // Ticks the countdowns once a minute.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <AppShell showNav navType="vendor" className="gap-4 py-4">
      <TopBar showBack backHref="/home" title={t('Free redo claims')} />
      {!isVendorAdmin ? (
        <p className="text-[13px] text-text-secondary">
          {t('Only the garage owner can see and answer redo claims.')}
        </p>
      ) : !config.isLoading && !on ? (
        <p className="text-[13px] text-text-secondary">
          {t('Free redo claims are not switched on yet.')}
        </p>
      ) : (
        <>
          <p className="text-[12px] text-text-secondary">
            {t(
              'A customer can ask for a free redo within {claimHours} hours of a wash or detailing, with photos. Answer within {answerHours} hours of your opening hours, or the redo is approved. Jobs without your before and after photos are approved at once.',
              {
                claimHours: GUARANTEE_RULES.claimWindowHours,
                answerHours: GUARANTEE_RULES.garageReviewHours,
              }
            )}
          </p>
          <ScSegmented
            aria-label={t('Which claims')}
            value={scope}
            onChange={setScope}
            options={[
              { value: 'open', label: t('Open') },
              { value: 'closed', label: t('Closed') },
            ]}
          />
          {claims.isLoading || config.isLoading ? (
            <SkeletonList count={2} itemClassName="h-[220px]" />
          ) : (claims.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<IconShieldCheck size={28} stroke={1.5} />}
              title={scope === 'open' ? t('No open claims') : t('No closed claims')}
              subtitle={t('Claims customers make on your jobs show here.')}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {claims.data!.items.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} />
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}

function ClaimCard({ claim }: { claim: GarageClaim }) {
  const t = useT()
  const answer = useAnswerClaim()
  const [disputing, setDisputing] = useState(false)
  const [note, setNote] = useState('')
  const left = timeLeftLabel(claim.garageRespondBy)

  const accept = async () => {
    try {
      await answer.mutateAsync({ claimId: claim.id, answer: 'accept' })
      toast.success(t('Accepted. The customer picks a time for the redo.'))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Could not answer. Please try again.')
      )
    }
  }

  const dispute = async () => {
    try {
      await answer.mutateAsync({
        claimId: claim.id,
        answer: 'dispute',
        note: note.trim(),
      })
      setDisputing(false)
      toast.success(t('Sent to Detlio to decide.'))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Could not send. Please try again.')
      )
    }
  }

  return (
    <ScCard
      id={`claim-${claim.id}`}
      className="flex scroll-mt-4 flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">
            {claim.customerFirstName} · {claim.service}
          </p>
          <p className="text-[12px] text-text-secondary">
            {t('Booking #{reference}', { reference: claim.bookingRef })}
            {claim.completedAt && (
              <> · {t('done {time}', { time: formatStepTime(claim.completedAt) })}</>
            )}
          </p>
        </div>
        <ScBadge
          variant={claim.canAnswer ? 'pending' : 'muted'}
          className="shrink-0"
        >
          {t(CLAIM_STATUS_LABELS[claim.status])}
        </ScBadge>
      </div>

      <div>
        <p className="text-[12px] font-medium text-text-primary">
          {claim.issues.map((issue) => t(issue.label)).join(', ')}
        </p>
        {claim.otherText && (
          <p className="mt-0.5 text-[12px] text-text-secondary">
            “{claim.otherText}”
          </p>
        )}
      </div>

      <GuaranteeEvidence
        customerPhotos={claim.customerPhotos}
        garagePhotos={claim.garagePhotos}
        garageTitle={t('Your before and after photos')}
      />

      {claim.route === 'auto' && (
        <p className="text-[12px] text-text-secondary">
          {t('Approved at once: there were no before and after photos on this job.')}
        </p>
      )}
      {claim.route === 'detlio' &&
        claim.status === 'needs_detlio' &&
        !claim.garageResponse && (
          <p className="text-[12px] text-text-secondary">
            {t('Detlio is reviewing this claim. Nothing for you to do yet.')}
          </p>
        )}
      {claim.garageResponse === 'disputed' && claim.garageNote && (
        <p className="text-[12px] text-text-secondary">
          {t('You disputed it: “{note}”', { note: claim.garageNote })}
        </p>
      )}
      {claim.garageResponse === 'timed_out' && (
        <p className="text-[12px] text-text-secondary">
          {t('There was no answer in time, so the redo was approved.')}
        </p>
      )}
      {claim.decisionReason && (
        <p className="text-[12px] text-text-secondary">
          {t('Detlio: “{reason}”', { reason: claim.decisionReason })}
        </p>
      )}
      {claim.status === 'refund_approved' && (
        <p className="text-[12px] text-text-secondary">
          {t('Detlio approved a refund instead of a redo. Nothing is paid out on this job.')}
        </p>
      )}
      {claim.redoBooking && (
        <p className="text-[12px] text-text-primary">
          {t('Free redo booked for {time} — it is on your Bookings page.', {
            time: formatStepTime(claim.redoBooking.scheduledAt),
          })}
        </p>
      )}
      {claim.status === 'redo_approved' && claim.redoBookBy && (
        <p className="text-[12px] text-text-secondary">
          {t('The customer picks a free redo time by {time}.', {
            time: formatStepTime(claim.redoBookBy),
          })}
        </p>
      )}

      {claim.canAnswer && (
        <div className="flex flex-col gap-2">
          {left && (
            <p className="text-[12px] font-medium text-warning">
              {claim.garageRespondBy
                ? t('Answer within {left} of now (by {time})', {
                    left,
                    time: formatStepTime(claim.garageRespondBy),
                  })
                : t('Answer within {left} of now', { left })}
            </p>
          )}
          <div className="flex gap-2">
            <ScButton
              variant="main"
              size="lg"
              onClick={() => void accept()}
              disabled={answer.isPending}
              className="flex-1"
            >
              {t('Accept — free redo')}
            </ScButton>
            {claim.canDispute && (
              <ScButton
                variant="outline"
                size="md"
                onClick={() => setDisputing(true)}
                disabled={answer.isPending}
                className="flex-1"
              >
                {t('Dispute')}
              </ScButton>
            )}
          </div>
        </div>
      )}

      <ScModal
        open={disputing}
        onClose={() => setDisputing(false)}
        dismissible={!answer.isPending}
        aria-label={t('Dispute this claim')}
      >
        <div className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">
            {t('Dispute this claim')}
          </h2>
          <p className="text-[12px] text-text-secondary">
            {t(
              "Say why the job was done properly. Detlio compares both sides' photos and decides within {hours} hours.",
              { hours: GUARANTEE_RULES.detlioDecideHours }
            )}
          </p>
          <ScTextarea
            label={t('Why')}
            rows={4}
            maxLength={GUARANTEE_RULES.garageNoteMax}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex gap-2">
            <ScButton
              variant="outline"
              size="md"
              onClick={() => setDisputing(false)}
              disabled={answer.isPending}
              className="flex-1"
            >
              {t('Back')}
            </ScButton>
            <ScButton
              variant="main"
              size="lg"
              onClick={() => void dispute()}
              disabled={note.trim().length < 5 || answer.isPending}
              className="flex-1"
            >
              {t('Send to Detlio')}
            </ScButton>
          </div>
        </div>
      </ScModal>
    </ScCard>
  )
}
