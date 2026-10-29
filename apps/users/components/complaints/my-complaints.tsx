'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ScCard } from '@/components/ui/card'
import type { CustomerComplaint } from '@repo/core/api/complaints'
import { useMyComplaints, useWithdrawComplaint } from '@repo/core/api/hooks/use-complaints'
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_SOURCE_CUSTOMER_LINES,
  COMPLAINT_STATUS_LABELS,
  formatComplaintDate,
  type ComplaintStatus,
} from '@repo/core/complaints'
import { RaiseComplaintSheet } from '@/components/complaints/raise-complaint-sheet'

/**
 * The status as a badge. Waiting on the team is the neutral outline (nothing
 * is wrong yet); resolved is green; closed is grey. Never red: red is for
 * what to press.
 */
const STATUS_BADGE: Record<ComplaintStatus, 'pending' | 'success' | 'muted'> = {
  open: 'pending',
  acknowledged: 'pending',
  resolved: 'success',
  closed: 'muted',
}

function ComplaintRow({ complaint }: { complaint: CustomerComplaint }) {
  const withdrawn = Boolean(complaint.withdrawnAt)
  const answered =
    (complaint.status === 'resolved' || complaint.status === 'closed') && !withdrawn
  const withdraw = useWithdrawComplaint()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | undefined>()
  return (
    <li>
      <ScCard className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="font-numeric text-[13px] font-semibold text-text-primary">
            {complaint.number}
          </span>
          <ScBadge variant={STATUS_BADGE[complaint.status]}>
            {withdrawn ? 'Withdrawn' : COMPLAINT_STATUS_LABELS[complaint.status]}
          </ScBadge>
          <span className="ml-auto font-numeric text-[11px] text-text-muted">
            {formatComplaintDate(complaint.receivedAt)}
          </span>
        </div>
        <p className="text-[12px] text-text-secondary">
          {COMPLAINT_CATEGORY_LABELS[complaint.category]}
          {complaint.bookingRef && (
            <>
              {' '}
              · booking{' '}
              <span className="font-numeric">#{complaint.bookingRef}</span>
            </>
          )}
          {complaint.garageName && <> · {complaint.garageName}</>}
        </p>
        {/* One the team logged from a call or a message: said, so a
            complaint they never typed here makes sense. */}
        {complaint.source !== 'app' && (
          <p className="text-[12px] text-text-muted">
            {COMPLAINT_SOURCE_CUSTOMER_LINES[complaint.source]}
          </p>
        )}
        {/* Their words as recorded: the copy of the complaint the rules ask
            them to be given. */}
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-[12px] text-text-primary">
          {complaint.message}
        </p>
        {/* Nobody has answered it yet (0066): the customer can take it back. */}
        {complaint.canWithdraw && (
          <button
            type="button"
            aria-label={`Withdraw complaint ${complaint.number}`}
            onClick={() => setConfirming(true)}
            className="mt-1 min-h-11 self-start text-[12px] font-medium text-text-secondary underline underline-offset-2 transition-colors hover:text-text-primary"
          >
            Withdraw
          </button>
        )}
        <ConfirmSheet
          open={confirming}
          onClose={() => {
            setConfirming(false)
            setError(undefined)
          }}
          onConfirm={async () => {
            try {
              await withdraw.mutateAsync(complaint.id)
              toast.success('Complaint withdrawn')
              setConfirming(false)
            } catch (err) {
              // Answered meanwhile: said here; the list is re-read.
              setError(err instanceof Error ? err.message : 'Could not withdraw it')
            }
          }}
          level="light"
          title={`Withdraw complaint ${complaint.number}?`}
          body="We'll close it without answering. You can raise a new one any time."
          confirmLabel="Withdraw complaint"
          cancelLabel="Keep it"
          busy={withdraw.isPending}
          error={error}
        />
        {answered && complaint.resolutionNote && (
          <div className="mt-1 rounded-[10px] border border-border bg-surface-elevated px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Our answer
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] text-text-primary">
              {complaint.resolutionNote}
            </p>
          </div>
        )}
      </ScCard>
    </li>
  )
}

/**
 * Profile's My complaints: each complaint's number, status, date and what it
 * was about, with the team's answer once it is resolved. Raising one that is
 * not about a booking starts here too.
 */
export function MyComplaints() {
  const {
    data: complaints = [],
    isPending,
    isError,
    refetch,
  } = useMyComplaints()
  const [raising, setRaising] = useState(false)

  return (
    <section
      id="my-complaints"
      aria-labelledby="my-complaints-heading"
      className="scroll-mt-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2
          id="my-complaints-heading"
          className="text-sm font-semibold text-text-primary"
        >
          My complaints
        </h2>
        {/* Neutral, not red: nothing on Profile asks to be pressed. */}
        <button
          type="button"
          onClick={() => setRaising(true)}
          className="min-h-11 px-1 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          Raise a complaint
        </button>
      </div>

      {isPending ? (
        <ScCard>
          <p className="text-[12px] text-text-secondary">Loading…</p>
        </ScCard>
      ) : isError && complaints.length === 0 ? (
        <ScCard className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-text-secondary">
            Couldn&apos;t load your complaints.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-11 px-1 text-[12px] font-medium text-text-primary underline"
          >
            Try again
          </button>
        </ScCard>
      ) : complaints.length === 0 ? (
        <ScCard>
          <p className="text-[12px] text-text-secondary">
            None so far. About a booking? Use Help with this booking on its
            page.
          </p>
        </ScCard>
      ) : (
        <ul
          aria-label="My complaints, newest first"
          className="flex flex-col gap-2"
        >
          {complaints.map((complaint) => (
            <ComplaintRow key={complaint.id} complaint={complaint} />
          ))}
        </ul>
      )}

      <RaiseComplaintSheet
        open={raising}
        onClose={() => setRaising(false)}
        booking={null}
      />
    </section>
  )
}
