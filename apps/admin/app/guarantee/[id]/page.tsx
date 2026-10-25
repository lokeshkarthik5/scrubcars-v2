'use client'

import { Suspense, use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { GuaranteeEvidence } from '@repo/ui/features/guarantee-photos'
import type { DecideClaimInput } from '@repo/core/api/guarantee'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminClaim, useDecideClaim } from '@repo/core/api/hooks/use-guarantee'
import { CLAIM_STATUS_LABELS, GUARANTEE_RULES } from '@repo/core/guarantee'
import { cn } from '@repo/core/utils'
import { Meta } from '@/components/meta'
import { rememberName, rememberedName } from '@/lib/actor-name'
import { formatWhen } from '@/lib/bookings'
import { DECISION_WORDS, claimClockLine, customerFiguresLine, customerFlags } from '@/lib/guarantee'

type Decision = DecideClaimInput['decision']

function ClaimDetail({ id }: { id: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const back = params.get('back') ?? '/guarantee'
  const { data: claim, isPending, error, refetch } = useAdminClaim(id)
  const decide = useDecideClaim(id)
  const [deciding, setDeciding] = useState<Decision | null>(null)
  const [actorName, setActorName] = useState(() => (typeof window === 'undefined' ? '' : rememberedName()))
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  if (isPending) return <SkeletonList count={3} itemClassName="h-40" />
  if (error || !claim) {
    return <ErrorState message={errorMessage(error, 'Failed to load this claim')} onRetry={() => void refetch()} />
  }

  const clock = claimClockLine(claim)
  const flags = customerFlags(claim.customerFigures)
  const reasonNeeded = deciding === 'reject'
  const ready = actorName.trim().length >= 2 && (!reasonNeeded || reason.trim().length >= 5)

  const submit = async () => {
    if (!deciding || !ready) return
    try {
      await decide.mutateAsync({
        decision: deciding,
        actorName: actorName.trim(),
        ...(reason.trim() && { reason: reason.trim() }),
        ...(note.trim() && { note: note.trim() }),
      })
      rememberName(actorName.trim())
      toast.success('Decision saved')
      setDeciding(null)
      setReason('')
      setNote('')
    } catch (failure) {
      toast.error(errorMessage(failure, 'Could not save the decision'))
    }
  }

  return (
    <>
      <PageHeader
        title={`Redo claim · #${claim.bookingRef}`}
        showBack
        backHref={back}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <ScBadge variant={claim.closed ? 'muted' : 'pending'}>{CLAIM_STATUS_LABELS[claim.status]}</ScBadge>
            {claim.overdue && <ScBadge variant="danger">Overdue</ScBadge>}
            {clock && <span className={cn('text-[12px]', claim.overdue ? 'text-warning' : 'text-text-secondary')}>{clock}</span>}
          </span>
        }
      />

      <ScCard className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
          <Meta label="Customer" size="md">
            {claim.customer.name}
            <span className="block font-numeric text-[12px] text-text-secondary">{claim.customer.phone}</span>
          </Meta>
          <Meta label="Garage" size="md">
            <Link href={`/vendors/${claim.vendorId}/edit`} className="underline underline-offset-2">
              {claim.garageName}
            </Link>
          </Meta>
          <Meta label="Booking" size="md">
            <Link href={`/bookings/${claim.bookingId}`} className="font-numeric underline underline-offset-2">
              #{claim.bookingRef}
            </Link>
            {claim.booking && (
              <span className="block text-[12px] text-text-secondary">
                {claim.booking.service}
                {claim.booking.paid && <> · ₹{claim.booking.paid}</>}
              </span>
            )}
          </Meta>
          <Meta label="Made" size="md">
            <span className="font-numeric">{formatWhen(claim.createdAt)}</span>
            {claim.booking?.completedAt && (
              <span className="block text-[12px] text-text-secondary">Job done {formatWhen(claim.booking.completedAt)}</span>
            )}
          </Meta>
        </div>
        <Meta label="What's wrong" size="md">
          {claim.issues.map((issue) => issue.label).join(', ')}
          {claim.otherText && <span className="block text-text-secondary">“{claim.otherText}”</span>}
        </Meta>
        <Meta label="Why it went where it went" size="md">
          {claim.routeReasons.map((reason) => reason.label).join(' · ')}
          {claim.booking?.photosWaived && <span className="block text-text-secondary">Photos were waived on this job.</span>}
        </Meta>
      </ScCard>

      <ScCard className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Customer history (never shown to them)</h2>
        <p className="text-[13px] text-text-primary">{customerFiguresLine(claim.customerFigures)}</p>
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {flags.map((flag) => (
              <ScBadge key={flag} variant="accent">
                {flag}
              </ScBadge>
            ))}
          </div>
        )}
        {claim.otherClaims.length > 0 && (
          <ul className="flex flex-col gap-1 text-[12px] text-text-secondary">
            {claim.otherClaims.map((other) => (
              <li key={other.id}>
                <Link href={`/guarantee/${other.id}`} className="underline underline-offset-2">
                  {formatWhen(other.createdAt)}
                </Link>{' '}
                · {other.garageName} · {CLAIM_STATUS_LABELS[other.status]}
                {other.approved ? ' · approved' : ''}
              </li>
            ))}
          </ul>
        )}
      </ScCard>

      <ScCard className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Both sides&apos; photos</h2>
        <GuaranteeEvidence customerPhotos={claim.customerPhotos} garagePhotos={claim.garagePhotos} />
      </ScCard>

      <ScCard className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-primary">What happened</h2>
        <ul className="flex flex-col gap-1 text-[13px] text-text-primary">
          {claim.garageResponse && (
            <li>
              Garage:{' '}
              {claim.garageResponse === 'accepted'
                ? 'accepted'
                : claim.garageResponse === 'disputed'
                  ? `disputed — “${claim.garageNote ?? ''}”`
                  : 'did not answer in time (treated as accepted)'}
              {claim.garageRespondedAt && <span className="text-text-secondary"> · {formatWhen(claim.garageRespondedAt)}</span>}
            </li>
          )}
          {claim.decision && (
            <li>
              Detlio ({claim.decidedBy}): {DECISION_WORDS[claim.decision].label.toLowerCase()}
              {claim.decisionReason && <> — “{claim.decisionReason}”</>}
              {claim.decidedAt && <span className="text-text-secondary"> · {formatWhen(claim.decidedAt)}</span>}
            </li>
          )}
          {claim.adminNote && <li className="text-text-secondary">Team note: {claim.adminNote}</li>}
          {claim.redoBooking && (
            <li>
              Free redo:{' '}
              <Link href={`/bookings/${claim.redoBooking.id}`} className="underline underline-offset-2">
                {formatWhen(claim.redoBooking.scheduledAt)}
              </Link>{' '}
              ({claim.redoBooking.status})
            </li>
          )}
          {claim.booking?.refundApprovedAt && (
            <li>
              Refund instead approved {formatWhen(claim.booking.refundApprovedAt)}:{' '}
              <Link href="/refunds" className="underline underline-offset-2">
                Refunds page
              </Link>
            </li>
          )}
          {claim.closeReason && <li className="text-text-secondary">Closed: {claim.closeReason.replaceAll('_', ' ')}</li>}
          {!claim.garageResponse && !claim.decision && !claim.redoBooking && (
            <li className="text-text-secondary">Nothing yet.</li>
          )}
        </ul>
      </ScCard>

      {(claim.allowed.redo || claim.allowed.refund || claim.allowed.reject) && (
        <ScCard className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Decide</h2>
          <p className="text-[12px] text-text-secondary">
            Compare the photos. A redo when the job was not done properly; a refund instead when a redo is not
            practical; not approved, with a reason the customer reads, when the photos do not support it. Target:{' '}
            {GUARANTEE_RULES.detlioDecideHours} hours.
          </p>
          <div className="flex flex-col gap-2 md:flex-row">
            {(['redo', 'refund', 'reject'] as const)
              .filter((decision) => claim.allowed[decision])
              .map((decision) => (
                <ScButton
                  key={decision}
                  variant={decision === 'redo' ? 'primary' : 'secondary'}
                  onClick={() => setDeciding(decision)}
                  className="min-h-11 flex-1"
                >
                  {DECISION_WORDS[decision].label}
                </ScButton>
              ))}
          </div>
        </ScCard>
      )}

      <ScModal open={deciding !== null} onClose={() => setDeciding(null)} dismissible={!decide.isPending} aria-label="Decide this claim">
        {deciding && (
          <div className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold text-text-primary">{DECISION_WORDS[deciding].label}</h2>
            <p className="text-[12px] text-text-secondary">{DECISION_WORDS[deciding].effect}</p>
            {reasonNeeded ? (
              <ScTextarea
                label="Reason (the customer and the garage read this)"
                rows={3}
                maxLength={GUARANTEE_RULES.reasonMax}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            ) : (
              <ScTextarea
                label="Note for the customer (optional)"
                rows={2}
                maxLength={GUARANTEE_RULES.reasonMax}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
            <ScTextarea
              label="Team note (internal, optional)"
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <ScInput label="Your name" value={actorName} onChange={(event) => setActorName(event.target.value)} maxLength={100} />
            <div className="flex gap-2">
              <ScButton variant="secondary" onClick={() => setDeciding(null)} disabled={decide.isPending} className="min-h-11 flex-1">
                Back
              </ScButton>
              <ScButton onClick={() => void submit()} disabled={!ready || decide.isPending} className="min-h-11 flex-1">
                {decide.isPending ? 'Saving…' : 'Confirm'}
              </ScButton>
            </div>
          </div>
        )}
      </ScModal>
    </>
  )
}

export default function AdminRedoClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-40" />}>
      <ClaimDetail id={id} />
    </Suspense>
  )
}
