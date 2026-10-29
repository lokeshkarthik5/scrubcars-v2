'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import { BeforeAfterCompare } from '@repo/ui/features/before-after'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useUndoAdminJobPhotosWaiver,
  useWaiveAdminJobPhotos,
} from '@repo/core/api/hooks/use-admin-bookings'
import { angleLabel, photoByLabel } from '@repo/core/job-photo-standards'
import type { JobPhoto } from '@repo/core/types'
import { ScSection } from '@repo/ui/sc/section'
import Link from 'next/link'
import type {
  AdminBookingDetail,
  AdminExtraWork,
  AdminFinalBill,
  AdminTimeProposal,
} from '@repo/core/api/admin'
import { finalBillStatusLabel } from '@repo/core/job-records'
import { CopyButton } from '@/components/copy-button'
import { SignedAs } from '@/components/signed-as'
import { formatRupees, formatWhen } from '@/lib/bookings'

const STATUS_VARIANT: Record<
  AdminFinalBill['status'],
  'pending' | 'success' | 'muted'
> = {
  due: 'pending',
  paid: 'success',
  not_needed: 'muted',
  cancelled: 'muted',
}

/** A Razorpay id with a copy button: what ops searches the dashboard for. */
function GatewayId({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-text-secondary">{label}</p>
      <div className="flex min-w-0 items-center">
        <span className="truncate font-numeric text-[13px] text-text-primary">
          {value}
        </span>
        <CopyButton
          value={value}
          label={`Copy ${label} ${value}`}
          className="-my-2 shrink-0"
        />
      </div>
    </div>
  )
}

/**
 * Where money paid on a bill stands, said from the same refund item the
 * Refund section above shows (lib/refunds.ts on the server decides), so the
 * two never disagree: owed and on the Refunds list, refunded, or kept
 * because the customer didn't turn up. Null when there is nothing to say.
 */
function BillMoneyLine({
  booking,
  billId,
  paidWhen,
  keptOnNoShow = false,
}: {
  booking: AdminBookingDetail
  billId: string
  /** How the payment came to be owed, before the refund part. */
  paidWhen: React.ReactNode
  /**
   * A bill that stood when it was paid is kept on a customer no-show. A
   * payment on a replaced or withdrawn bill paid for nothing, and always
   * goes back.
   */
  keptOnNoShow?: boolean
}) {
  const item = booking.refunds?.find(
    (r) => r.kind === 'bill' && r.id === billId
  )

  if (item && Number(item.amountOwed) > 0) {
    return (
      // Amber: money still to give back. The action is in the Refund section.
      <p className="text-[12px] text-error">
        {paidWhen} Refund owed:{' '}
        <span className="font-numeric">{formatRupees(item.amountOwed)}</span>,
        see Refund above.
      </p>
    )
  }
  if (item && Number(item.amountRefunded) > 0) {
    return (
      <p className="text-[12px] text-text-secondary">
        {paidWhen} Refunded{' '}
        <span className="font-numeric">
          {formatRupees(item.amountRefunded)}
        </span>
        .
      </p>
    )
  }
  if (keptOnNoShow && booking.noShow === 'customer') {
    return (
      <p className="text-[12px] text-text-secondary">
        {paidWhen} Kept: customer no-show.
      </p>
    )
  }
  return null
}

/**
 * The final bill of an inspection job: the lines the garage raised, what the
 * customer had already paid, the balance and where it stands, with the
 * Razorpay ids. Bills the garage replaced are listed under it; one with a
 * payment on it was paid after it was replaced, and is a refund (shown in
 * the Refund section, and only pointed at here).
 */
export function FinalBillSection({ booking }: { booking: AdminBookingDetail }) {
  const bill = booking.finalBill ?? null
  const replaced = booking.replacedFinalBills ?? []
  if (!bill && replaced.length === 0) return null
  // A cancelled booking takes no payment for its bill (cancelling withdraws
  // an unpaid one; one from before that rule still cannot be paid), and a
  // bill paid before the cancellation is money ops has to decide about.
  const cancelled = booking.status === 'cancelled'

  return (
    <ScSection
      title="Final bill"
      action={
        bill ? (
          <ScBadge variant={STATUS_VARIANT[bill.status]}>
            {finalBillStatusLabel(bill.status)}
          </ScBadge>
        ) : undefined
      }
    >
      {bill ? (
        <>
          <ul className="flex flex-col gap-1.5">
            {bill.lines.map((line, i) => (
              <li key={i} className="flex justify-between gap-3 text-[13px]">
                <span className="text-text-primary">{line.description}</span>
                <span className="font-numeric text-text-secondary">
                  {formatRupees(line.amount)}
                </span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-border pt-1.5 text-[13px]">
              <span className="text-text-secondary">Total</span>
              <span className="font-numeric text-text-primary">
                {formatRupees(bill.totalAmount)}
              </span>
            </li>
            <li className="flex justify-between gap-3 text-[13px]">
              <span className="text-text-secondary">Paid at booking</span>
              <span className="font-numeric text-text-secondary">
                −{formatRupees(bill.paidBefore)}
              </span>
            </li>
            <li className="flex justify-between gap-3 text-[13px] font-semibold">
              <span className="text-text-primary">
                {bill.status === 'paid'
                  ? 'Paid in the app'
                  : cancelled && bill.status === 'due'
                    ? 'Not payable: booking cancelled'
                    : 'To pay in the app'}
              </span>
              <span className="font-numeric text-text-primary">
                {formatRupees(bill.amountDue)}
              </span>
            </li>
          </ul>
          {cancelled && bill.status === 'paid' && (
            <BillMoneyLine
              booking={booking}
              billId={bill.id}
              paidWhen="The customer paid this bill before the booking was cancelled."
              keptOnNoShow
            />
          )}
          {bill.note && (
            <p className="text-[12px] text-text-secondary">
              <span className="font-medium text-text-primary">
                Garage&apos;s note:
              </span>{' '}
              {bill.note}
            </p>
          )}
          <p className="text-[12px] text-text-muted">
            Raised{' '}
            <span className="font-numeric">{formatWhen(bill.createdAt)}</span>
            {bill.paidAt && (
              <>
                {' · '}paid{' '}
                <span className="font-numeric">{formatWhen(bill.paidAt)}</span>
              </>
            )}
          </p>
          {(bill.gatewayOrderId || bill.gatewayPaymentId) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {bill.gatewayOrderId && (
                <GatewayId
                  label="Razorpay order id"
                  value={bill.gatewayOrderId}
                />
              )}
              {bill.gatewayPaymentId && (
                <GatewayId
                  label="Razorpay payment id"
                  value={bill.gatewayPaymentId}
                />
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-[13px] text-text-secondary">
          No bill stands on this booking.
        </p>
      )}

      {replaced.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <p className="text-[12px] text-text-secondary">
            <span className="font-numeric">{replaced.length}</span> earlier{' '}
            {replaced.length === 1 ? 'bill was' : 'bills were'}{' '}
            {cancelled
              ? 'replaced by the garage or withdrawn when the booking was cancelled, before being paid.'
              : 'replaced by the garage before being paid.'}
          </p>
          {replaced
            .filter((old) => old.gatewayPaymentId)
            .map((old) => (
              <div key={old.id} className="flex flex-col gap-1">
                <BillMoneyLine
                  booking={booking}
                  billId={old.id}
                  paidWhen={
                    <>
                      A payment of{' '}
                      <span className="font-numeric">
                        {formatRupees(old.amountDue)}
                      </span>{' '}
                      landed after this bill{' '}
                      {cancelled ? 'no longer stood' : 'was replaced'}.
                    </>
                  }
                />
                <GatewayId
                  label="Razorpay payment id"
                  value={old.gatewayPaymentId!}
                />
              </div>
            ))}
        </div>
      )}
    </ScSection>
  )
}

/** Admin's photos as the shared photo helpers read them (older servers: the garage's, no angle). */
function asJobPhotos(booking: AdminBookingDetail): JobPhoto[] {
  return (booking.photos ?? []).map((photo) => ({
    id: photo.id,
    stage: photo.stage,
    url: photo.url,
    createdAt: photo.createdAt,
    angle: photo.angle ?? null,
    by: photo.by ?? 'garage',
  }))
}

/**
 * Every photo of the job (0045: the garage's and the customer's own), with
 * the angle, who added it and when; a before/after slider of the angles
 * photographed both times; and where the job stands against the photo
 * standard, with Detlio's waiver. It is the record ops reads in a dispute,
 * so each photo opens full size in a new tab.
 */
export function JobPhotosSection({
  booking,
  allowWaive = true,
}: {
  booking: AdminBookingDetail
  /** Off where the section is shown for reference (a complaint's page). */
  allowWaive?: boolean
}) {
  const [waiving, setWaiving] = useState(false)
  const undoWaiver = useUndoAdminJobPhotosWaiver()
  const photos = booking.photos ?? []
  const standard = booking.photoStandard
  const waiver = booking.photosWaiver ?? null
  const ongoing = booking.status !== 'pending' && booking.status !== 'cancelled'
  const showStandard = Boolean(standard?.required) && ongoing
  if (photos.length === 0 && !showStandard && !waiver) return null

  const met = standard
    ? !standard.startBlocked && !standard.finishBlocked
    : true
  const canWaive =
    allowWaive &&
    Boolean(standard?.required) &&
    !waiver &&
    booking.status !== 'cancelled'

  return (
    <ScSection
      title="Job photos"
      action={
        waiver ? (
          <ScBadge variant="muted">Waived</ScBadge>
        ) : showStandard && standard ? (
          <ScBadge variant={met ? 'success' : 'pending'}>
            {met ? 'Standard met' : 'Photos missing'}
          </ScBadge>
        ) : undefined
      }
    >
      {showStandard && standard && (
        <p className="text-[12px] text-text-secondary">
          Garage&apos;s photos:{' '}
          <span className="font-numeric">{standard.before.count}</span> before,{' '}
          <span className="font-numeric">{standard.after.count}</span> after (
          <span className="font-numeric">{standard.minimum}</span> of each
          needed to start and complete).
        </p>
      )}
      {waiver && (
        <p className="text-[12px] text-text-secondary">
          Waived by{' '}
          <span className="font-medium text-text-primary">{waiver.by}</span>{' '}
          <span className="font-numeric">{formatWhen(waiver.at)}</span>:{' '}
          {waiver.reason}
        </p>
      )}
      {/* Undo (0065): while the job is not over and has no redo claim. */}
      {allowWaive && waiver?.undoable && (
        <ScButton
          variant="secondary"
          fullWidth={false}
          disabled={undoWaiver.isPending}
          onClick={() =>
            undoWaiver.mutate({ id: booking.id, input: undefined }, {
              onSuccess: () => toast.success('Waiver undone: the garage’s photos are needed again'),
              onError: (err) => toast.error(errorMessage(err, "Couldn't undo the waiver")),
            })
          }
          className="min-h-11 self-start px-4 text-[12px]"
        >
          {undoWaiver.isPending ? 'Undoing…' : 'Undo waiver'}
        </ScButton>
      )}

      <BeforeAfterCompare
        photos={asJobPhotos(booking)}
        className="max-w-[420px]"
      />

      {(['before', 'after'] as const).map((stage) => {
        const ofStage = photos.filter((photo) => photo.stage === stage)
        if (ofStage.length === 0) return null
        const label = stage === 'before' ? 'Before' : 'After'
        return (
          <div key={stage} className="flex flex-col gap-1.5">
            <p className="text-[12px] font-medium text-text-secondary">
              {label}
            </p>
            <ul className="flex flex-wrap gap-3">
              {ofStage.map((photo, i) => {
                const by = photoByLabel(photo.by ?? 'garage')
                const who = photo.uploadedByName
                  ? `${by} · ${photo.uploadedByName}`
                  : by
                return (
                  <li key={photo.id} className="flex w-24 flex-col gap-1">
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${label.toLowerCase()} photo ${i + 1}, ${angleLabel(photo.angle)}, by ${who}, taken ${formatWhen(photo.createdAt)}`}
                      className="block size-20 overflow-hidden rounded-[10px] bg-surface ring-1 ring-inset ring-border"
                    >
                      {/* A plain <img>: the phone already sized it. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </a>
                    <p className="text-[12px] leading-[14px] text-text-primary">
                      {angleLabel(photo.angle)}
                    </p>
                    <p
                      className="truncate text-[12px] leading-[14px] text-text-secondary"
                      title={who}
                    >
                      {who}
                    </p>
                    <p className="font-numeric text-[12px] leading-[14px] text-text-muted">
                      {formatWhen(photo.createdAt)}
                    </p>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {canWaive && (
        <div>
          <ScButton
            variant="secondary"
            onClick={() => setWaiving(true)}
            className="min-h-11"
          >
            Waive photos for this booking
          </ScButton>
        </div>
      )}
      <WaivePhotosDialog
        booking={booking}
        open={waiving}
        onClose={() => setWaiving(false)}
      />
    </ScSection>
  )
}

/**
 * Detlio waives the photo standard on one booking (0045), for a genuine
 * case: Start and Complete stop waiting for the garage's photos, and the job
 * leaves the garage's photo compliance. The typed name and the reason are
 * stored on the booking and left as a note; it cannot be undone.
 */
function WaivePhotosDialog({
  booking,
  open,
  onClose,
}: {
  booking: AdminBookingDetail
  open: boolean
  onClose: () => void
}) {
  const waive = useWaiveAdminJobPhotos()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const close = () => {
    setReason('')
    setError('')
    onClose()
  }

  const submit = () => {
    setError('')
    waive.mutate(
      {
        id: booking.id,
        input: { reason: reason.trim() },
      },
      {
        onSuccess: () => {
          toast.success(`Photos waived for #${booking.reference}`)
          close()
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't waive the photos")),
      }
    )
  }

  return (
    <ScModal
      open={open}
      onClose={close}
      dismissible={!waive.isPending}
      aria-label={`Waive photos for booking #${booking.reference}`}
      className="flex max-w-[420px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          Waive photos for this booking
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          The garage can then start and complete it without its before and after
          photos, and it leaves the garage&apos;s photo compliance. Only for a
          genuine reason, like a phone that died. This can&apos;t be undone.
        </p>
      </div>
      <ScTextarea
        id="waive-photos-reason"
        label="Why"
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <SignedAs />
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <ScButton
          variant="secondary"
          onClick={close}
          disabled={waive.isPending}
          className="min-h-11"
        >
          Not now
        </ScButton>
        <ScButton
          onClick={submit}
          disabled={reason.trim().length < 5 || waive.isPending}
          className="min-h-11"
        >
          {waive.isPending ? 'Waiving…' : 'Waive photos'}
        </ScButton>
      </div>
    </ScModal>
  )
}

const EXTRA_WORK_STATE: Record<
  AdminExtraWork['state'],
  { label: string; variant: 'pending' | 'success' | 'muted' }
> = {
  awaiting: { label: 'Waiting for customer', variant: 'pending' },
  paid: { label: 'Approved & paid', variant: 'success' },
  declined: { label: 'Declined by customer', variant: 'muted' },
  withdrawn: { label: 'Withdrawn by garage', variant: 'muted' },
  closed: { label: 'Closed with the booking', variant: 'muted' },
}

/**
 * Extra work the garage asked for (0041): what, how much, the photos, where
 * each stands and the Razorpay ids. Paid extra work is kept only when the
 * booking completes; a refund owed on one is in the Refund section above
 * and pointed at here, like a bill's.
 */
export function ExtraWorkSection({ booking }: { booking: AdminBookingDetail }) {
  const items = booking.extraWork ?? []
  if (items.length === 0) return null

  return (
    <ScSection title="Extra work">
      <ul className="flex flex-col gap-3">
        {items.map((work) => (
          <li
            key={work.id}
            className="flex flex-col gap-1.5 border-t border-border pt-2 first:border-t-0 first:pt-0"
          >
            <div className="flex items-start justify-between gap-3 text-[13px]">
              <span className="min-w-0 text-text-primary">
                {work.description}
              </span>
              <span className="shrink-0 font-numeric text-text-primary">
                {formatRupees(work.amount)}
              </span>
            </div>
            <div>
              <ScBadge variant={EXTRA_WORK_STATE[work.state].variant}>
                {EXTRA_WORK_STATE[work.state].label}
              </ScBadge>
            </div>
            {work.note && (
              <p className="text-[12px] text-text-secondary">
                <span className="font-medium text-text-primary">
                  Garage&apos;s note:
                </span>{' '}
                {work.note}
              </p>
            )}
            {work.photos.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {work.photos.map((photo, i) => (
                  <li key={photo.url}>
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open photo ${i + 1} of ${work.description}`}
                      className="block size-16 overflow-hidden rounded-[10px] bg-surface ring-1 ring-inset ring-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {(work.state === 'paid' || work.gatewayPaymentId) && (
              <BillMoneyLine
                booking={booking}
                billId={work.id}
                paidWhen={
                  work.state === 'paid'
                    ? 'Paid, on a booking that did not complete.'
                    : 'A payment landed after this request no longer stood.'
                }
              />
            )}
            <p className="text-[12px] text-text-muted">
              Asked{' '}
              <span className="font-numeric">{formatWhen(work.createdAt)}</span>
              {work.paidAt && (
                <>
                  {' · '}paid{' '}
                  <span className="font-numeric">
                    {formatWhen(work.paidAt)}
                  </span>
                </>
              )}
              {work.cancelledAt && (
                <>
                  {' · '}closed{' '}
                  <span className="font-numeric">
                    {formatWhen(work.cancelledAt)}
                  </span>
                </>
              )}
            </p>
            {(work.gatewayOrderId || work.gatewayPaymentId) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {work.gatewayOrderId && (
                  <GatewayId
                    label="Razorpay order id"
                    value={work.gatewayOrderId}
                  />
                )}
                {work.gatewayPaymentId && (
                  <GatewayId
                    label="Razorpay payment id"
                    value={work.gatewayPaymentId}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </ScSection>
  )
}

const PROPOSAL_OUTCOME: Record<AdminTimeProposal['status'], string> = {
  open: 'Waiting for the customer',
  accepted: 'The customer picked a time',
  declined: 'None worked: cancelled as the garage’s decline',
  expired: 'Ran out unanswered: cancelled as the garage’s decline',
  withdrawn: 'Withdrawn by the garage',
  closed: 'Closed: the booking changed another way',
}

/**
 * The times the garage suggested instead of declining (0041), and how each
 * suggestion ended. A pick moved the booking to a new one in its chain,
 * linked here.
 */
export function TimeProposalSection({
  booking,
}: {
  booking: AdminBookingDetail
}) {
  const proposals = booking.timeProposals ?? []
  if (proposals.length === 0) return null

  return (
    <ScSection title="Suggested times">
      <ul className="flex flex-col gap-3">
        {proposals.map((proposal) => (
          <li
            key={proposal.id}
            className="flex flex-col gap-1 border-t border-border pt-2 first:border-t-0 first:pt-0"
          >
            <p className="text-[13px] font-medium text-text-primary">
              {PROPOSAL_OUTCOME[proposal.status]}
            </p>
            <ul className="flex flex-col gap-0.5">
              {proposal.slots.map((slot) => (
                <li
                  key={slot}
                  className="font-numeric text-[12px] text-text-secondary"
                >
                  {formatWhen(slot)}
                  {proposal.chosenSlot &&
                    new Date(proposal.chosenSlot).getTime() ===
                      new Date(slot).getTime() && (
                      <span className="font-sans text-success"> · picked</span>
                    )}
                </li>
              ))}
            </ul>
            {proposal.note && (
              <p className="text-[12px] text-text-secondary">
                <span className="font-medium text-text-primary">
                  Garage&apos;s note:
                </span>{' '}
                {proposal.note}
              </p>
            )}
            <p className="text-[12px] text-text-muted">
              Suggested{' '}
              <span className="font-numeric">
                {formatWhen(proposal.createdAt)}
              </span>
              {proposal.resolvedAt ? (
                <>
                  {' · '}ended{' '}
                  <span className="font-numeric">
                    {formatWhen(proposal.resolvedAt)}
                  </span>
                </>
              ) : (
                <>
                  {' · '}runs out{' '}
                  <span className="font-numeric">
                    {formatWhen(proposal.expiresAt)}
                  </span>
                </>
              )}
            </p>
            {proposal.resultBookingId && (
              <Link
                href={`/bookings/${proposal.resultBookingId}`}
                className="text-[12px] font-medium text-text-primary underline underline-offset-2"
              >
                Open the moved booking
              </Link>
            )}
          </li>
        ))}
      </ul>
    </ScSection>
  )
}
