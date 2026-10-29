'use client'

import { Suspense, use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react'
import { ScBadge, bookingStatusBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminComplaint } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  useAcknowledgeComplaint,
  useAdminComplaint,
  useCloseComplaint,
  useMarkComplaintLoggedInError,
  useResolveComplaint,
  useSetComplaintNote,
  useUndoComplaintLoggedInError,
} from '@repo/core/api/hooks/use-admin-complaints'
import {
  COMPLAINT_ADMIN_NOTE_MAX,
  COMPLAINT_ADMIN_STATUS_LABELS,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_RESOLUTION_MAX,
} from '@repo/core/complaints'
import { cn } from '@repo/core/utils'
import { CopyButton } from '@/components/copy-button'
import { Meta } from '@/components/meta'
import { PhoneLink } from '@/components/phone-link'
import { formatWhen } from '@/lib/bookings'
import { useAdminBooking } from '@repo/core/api/hooks/use-admin-bookings'
import { JobPhotosSection } from '@/app/bookings/[id]/job-records'
import {
  complaintActions,
  complaintSourceLine,
  overdueLabel,
} from '@/lib/complaints'

const STATUS_BADGE: Record<
  AdminComplaint['status'],
  'pending' | 'success' | 'muted'
> = {
  open: 'pending',
  acknowledged: 'pending',
  resolved: 'success',
  closed: 'muted',
}

/** Back to the list as it was, and only ever to the list. */
function backHref(back: string | null): string {
  return back && /^\/complaints(\?show=[a-z]+)?$/.test(back)
    ? back
    : '/complaints'
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Meta label={label} size="md">
      {children}
    </Meta>
  )
}

/**
 * The two promises, each with when it is due and, once kept, when and by
 * whom. A missed one is amber.
 */
function Clock({ c }: { c: AdminComplaint }) {
  const rows = [
    {
      label: 'Acknowledge by',
      due: c.acknowledgeBy,
      doneAt: c.acknowledgedAt,
      doneBy: c.acknowledgedBy,
      late: c.overdue === 'acknowledge',
    },
    {
      label: 'Resolve by',
      due: c.resolveBy,
      doneAt: c.resolvedAt ?? c.closedAt,
      doneBy: c.resolvedAt ? c.resolvedBy : c.closedBy,
      late: c.overdue === 'resolve',
    },
  ]
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Response clock">
      {rows.map((row) => (
        <li
          key={row.label}
          className={cn(
            'rounded-[10px] border px-3 py-2',
            row.late
              ? 'border-warning/60 bg-warning-muted'
              : 'border-border bg-surface'
          )}
        >
          <p className="text-[12px] font-medium text-text-secondary">
            {row.label}
          </p>
          <p
            className={cn(
              'font-numeric text-[13px]',
              row.late ? 'text-warning' : 'text-text-primary'
            )}
          >
            {formatWhen(row.due)}
          </p>
          {row.doneAt ? (
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-text-secondary">
              <IconCheck size={13} aria-hidden className="text-success" />
              <span className="font-numeric">{formatWhen(row.doneAt)}</span>
              {row.doneBy && <> · {row.doneBy}</>}
            </p>
          ) : row.late ? (
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-warning">
              <IconAlertTriangle size={13} aria-hidden /> Overdue
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Acknowledge, Resolve (with the note the customer reads) and Close. */
function Actions({ c }: { c: AdminComplaint }) {
  const can = complaintActions(c.status)
  const acknowledge = useAcknowledgeComplaint(c.id)
  const resolve = useResolveComplaint(c.id)
  const close = useCloseComplaint(c.id)
  const [resolution, setResolution] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeNote, setCloseNote] = useState('')

  const busy = acknowledge.isPending || resolve.isPending || close.isPending

  if (!can.acknowledge && !can.resolve && !can.close) return null

  // A toast, not text in this section: a refused action refetches the complaint,
  // and a failure must still be seen when the complaint has moved on meanwhile.
  const onError = (fallback: string) => (err: Error) =>
    toast.error(errorMessage(err, fallback))

  return (
    <ScSection title="Respond">
      {can.acknowledge && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-text-secondary">
            Acknowledge once you have been in touch with the customer, or have
            it in hand. It stops the 24-hour clock; the 7-day one keeps running.
          </p>
          <ScButton
            variant="secondary"
            fullWidth={false}
            disabled={busy}
            onClick={() => {
              acknowledge.mutate(undefined, {
                onSuccess: () => toast.success(`${c.number} acknowledged`),
                onError: onError("Couldn't acknowledge it"),
              })
            }}
            className="min-h-11 self-start px-4 text-[13px]"
          >
            {acknowledge.isPending ? 'Saving…' : 'Acknowledge'}
          </ScButton>
        </div>
      )}

      {can.resolve && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const note = resolution.trim()
            if (!note) return
            resolve.mutate(note, {
              onSuccess: () => {
                setResolution('')
                toast.success(`${c.number} resolved`)
              },
              onError: onError("Couldn't resolve it"),
            })
          }}
        >
          <ScTextarea
            id="complaint-resolution"
            label="What we did (the customer reads this)"
            rows={3}
            maxLength={COMPLAINT_RESOLUTION_MAX}
            placeholder="Refunded ₹499 to your card on 18 Oct; it shows in 5–7 working days."
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
          <ScButton
            type="submit"
            fullWidth={false}
            disabled={busy || !resolution.trim()}
            className="min-h-11 self-start px-4 text-[13px]"
          >
            {resolve.isPending ? 'Resolving…' : 'Resolve'}
          </ScButton>
        </form>
      )}

      {can.close && (
        <button
          type="button"
          onClick={() => setClosing(true)}
          disabled={busy}
          className="min-h-11 self-start text-[13px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline disabled:opacity-40"
        >
          {c.status === 'resolved' ? 'Close…' : 'Close without resolving…'}
        </button>
      )}

      <ScModal
        open={closing}
        onClose={() => setClosing(false)}
        dismissible={!close.isPending}
        aria-label={`Close complaint ${c.number}`}
        className="flex max-w-[420px] flex-col gap-4"
      >
        <h2 className="text-[15px] font-semibold text-text-primary">
          Close <span className="font-numeric">{c.number}</span>
        </h2>
        <p className="text-[13px] text-text-secondary">
          {c.status === 'resolved'
            ? 'It is resolved already; closing it keeps the answer the customer has.'
            : 'For a duplicate, a complaint the customer withdrew, or one that was not a complaint. It leaves the Open list and stops the clock.'}{' '}
          It can&apos;t be reopened: the customer raises a new one.
        </p>
        <ScTextarea
          id="complaint-close-note"
          label="Why, for the customer (optional)"
          rows={3}
          maxLength={COMPLAINT_RESOLUTION_MAX}
          placeholder="The same as C-000122, which we resolved on 18 Oct."
          value={closeNote}
          onChange={(e) => setCloseNote(e.target.value)}
        />
        <div className="flex gap-2">
          <ScButton
            variant="secondary"
            onClick={() => setClosing(false)}
            disabled={close.isPending}
          >
            Keep it open
          </ScButton>
          <ScButton
            variant="secondary"
            disabled={close.isPending}
            onClick={() => {
              close.mutate(closeNote.trim() || undefined, {
                onSuccess: () => {
                  setClosing(false)
                  setCloseNote('')
                  toast.success(`${c.number} closed`)
                },
                onError: (err) => {
                  setClosing(false)
                  onError("Couldn't close it")(err)
                },
              })
            }}
          >
            {close.isPending ? 'Closing…' : 'Close complaint'}
          </ScButton>
        </div>
      </ScModal>
    </ScSection>
  )
}

/** The team's own note. Saved as a whole; empty clears it. */
function InternalNote({ c }: { c: AdminComplaint }) {
  const save = useSetComplaintNote(c.id)
  const [note, setNote] = useState(c.adminNote ?? '')
  const [error, setError] = useState('')
  const changed = note.trim() !== (c.adminNote ?? '')

  return (
    <ScSection title="Internal note">
      <p className="text-[12px] text-text-muted">
        Only the Detlio team sees this. The customer never does.
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setError('')
          save.mutate(note.trim(), {
            onSuccess: () => toast.success('Note saved'),
            onError: (err) =>
              setError(errorMessage(err, "Couldn't save the note")),
          })
        }}
      >
        <ScTextarea
          id="complaint-admin-note"
          label="Note"
          rows={3}
          maxLength={COMPLAINT_ADMIN_NOTE_MAX}
          placeholder="Who called whom, what the garage said"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-[12px] text-error">
            {error}
          </p>
        )}
        <ScButton
          type="submit"
          variant="secondary"
          fullWidth={false}
          disabled={!changed || save.isPending}
          className="min-h-11 self-end px-4 text-[13px]"
        >
          {save.isPending ? 'Saving…' : 'Save note'}
        </ScButton>
      </form>
    </ScSection>
  )
}

function ComplaintDetail({ id }: { id: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const back = backHref(params.get('back'))
  const { data: c, isPending, error, refetch } = useAdminComplaint(id)

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  if (isPending) return <SkeletonList count={3} itemClassName="h-32" />
  if (!c) {
    return (
      <>
        <PageHeader title="Complaint" showBack backHref={back} />
        <ErrorState
          message={errorMessage(error, 'Failed to load the complaint')}
          onRetry={() => void refetch()}
        />
      </>
    )
  }

  const overdue = overdueLabel(c)
  const bookingBadge = c.booking?.status
    ? bookingStatusBadge(c.booking.status)
    : null

  return (
    <>
      <PageHeader
        title={`Complaint ${c.number}`}
        subtitle={
          <>
            {COMPLAINT_CATEGORY_LABELS[c.category]} · received{' '}
            <span className="font-numeric">{formatWhen(c.receivedAt)}</span>
          </>
        }
        showBack
        backHref={back}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <ScBadge variant={STATUS_BADGE[c.status]}>
              {COMPLAINT_ADMIN_STATUS_LABELS[c.status]}
            </ScBadge>
            {c.loggedInError && <ScBadge variant="muted">Logged in error</ScBadge>}
            {overdue && (
              <ScBadge variant="danger">
                <IconAlertTriangle size={11} aria-hidden className="mr-1" />
                {overdue}
              </ScBadge>
            )}
            <CopyButton value={c.number} label={`Copy ${c.number}`} />
          </div>
        }
      />

      <Clock c={c} />

      <ScSection title="Complaint">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
          <Field label="Customer">
            <p>{c.customer.name}</p>
            <PhoneLink phone={c.customer.phone} name={c.customer.name} />
            {c.customer.accountDeleted && (
              <p className="text-[12px] text-text-muted">
                Account since deleted
              </p>
            )}
          </Field>
          <Field label="Booking">
            {c.booking ? (
              c.booking.id ? (
                <>
                  <Link
                    href={`/bookings/${c.booking.id}`}
                    className="inline-flex min-h-11 items-center font-numeric font-medium text-text-primary underline underline-offset-2"
                  >
                    #{c.booking.reference}
                  </Link>
                  {c.booking.scheduledAt && (
                    <p className="font-numeric text-[12px] text-text-secondary">
                      {formatWhen(c.booking.scheduledAt)}
                    </p>
                  )}
                  {bookingBadge && (
                    <ScBadge variant={bookingBadge.variant}>
                      {bookingBadge.label}
                    </ScBadge>
                  )}
                </>
              ) : (
                <p>
                  <span className="font-numeric">#{c.booking.reference}</span>
                  <span className="block text-[12px] text-text-muted">
                    Booking since deleted
                  </span>
                </p>
              )
            ) : (
              <p className="text-text-secondary">Not about a booking</p>
            )}
          </Field>
          <Field label="Garage">
            {c.garage ? (
              c.garage.id ? (
                <Link
                  href={`/vendors/${c.garage.id}/edit`}
                  className="inline-flex min-h-11 items-center text-text-primary underline underline-offset-2"
                >
                  {c.garage.name}
                </Link>
              ) : (
                <p>
                  {c.garage.name}
                  <span className="block text-[12px] text-text-muted">
                    Garage since deleted
                  </span>
                </p>
              )
            ) : (
              <p className="text-text-secondary">—</p>
            )}
          </Field>
          <Field label="How it came">
            <p>{complaintSourceLine(c)}</p>
            {/* Logged later than it came: when it was written down. */}
            {c.source !== 'app' && c.createdAt !== c.receivedAt && (
              <p className="text-[12px] text-text-muted">
                Logged{' '}
                <span className="font-numeric">{formatWhen(c.createdAt)}</span>
              </p>
            )}
            {c.source !== 'app' && !c.customer.id && (
              <p className="text-[12px] text-text-muted">
                No account: the customer can&apos;t see it in the app
              </p>
            )}
          </Field>
        </div>

        <div>
          <p className="text-[12px] font-medium text-text-secondary">
            In their words
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-text-primary">
            {c.message}
          </p>
        </div>

        {c.resolutionNote && (
          <div className="rounded-[10px] border border-border bg-surface px-3 py-2">
            <p className="text-[12px] font-medium text-text-secondary">
              What the customer reads
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-text-primary">
              {c.resolutionNote}
            </p>
          </div>
        )}
      </ScSection>

      {/* A complaint about damage or the quality of the work (0045): the
          booking's photos, both sides', the record to check it against. */}
      {c.booking?.id && PHOTO_CATEGORIES.has(c.category) && (
        <ComplaintJobPhotos bookingId={c.booking.id} />
      )}

      <Actions key={c.id} c={c} />

      <InternalNote key={c.id} c={c} />

      {c.source !== 'app' && <LoggedInError key={`error-${c.id}`} c={c} />}
    </>
  )
}

/**
 * "Logged in error" (0065), for a complaint the team logged by mistake (the
 * wrong caller, a test call): it stays in the record, under All, and leaves
 * every count (Open, Overdue, the customer's list, Silver and Gold). Never a
 * delete, and undone with Undo. Only on a team-logged complaint: a
 * customer's own is closed instead.
 */
function LoggedInError({ c }: { c: AdminComplaint }) {
  const mark = useMarkComplaintLoggedInError(c.id)
  const undo = useUndoComplaintLoggedInError(c.id)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const busy = mark.isPending || undo.isPending
  const marked = c.loggedInError ?? null

  return (
    <ScSection title="Logged in error">
      {marked ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-text-primary">
            Marked by {marked.by},{' '}
            <span className="font-numeric">{formatWhen(marked.at)}</span>: {marked.reason}
          </p>
          <p className="text-[12px] text-text-muted">
            Kept in the record and out of every count: Open, Overdue, the customer&apos;s list and the tiers.
          </p>
          <ScButton
            variant="secondary"
            fullWidth={false}
            disabled={busy}
            onClick={() =>
              undo.mutate(undefined, {
                onSuccess: () => toast.success(`${c.number} is back in the counts`),
                onError: (err) => toast.error(errorMessage(err, "Couldn't undo it")),
              })
            }
            className="min-h-11 self-start px-4 text-[13px]"
          >
            {undo.isPending ? 'Undoing…' : 'Undo'}
          </ScButton>
        </div>
      ) : asking ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const why = reason.trim()
            if (why.length < 3) return
            mark.mutate(why, {
              onSuccess: () => {
                setAsking(false)
                setReason('')
                toast.success(`${c.number} marked as logged in error`)
              },
              onError: (err) => toast.error(errorMessage(err, "Couldn't mark it")),
            })
          }}
        >
          <ScInput
            id="complaint-error-reason"
            label="Why was it logged in error?"
            placeholder="Logged against the wrong caller"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-11"
          />
          <div className="flex gap-2">
            <ScButton
              type="submit"
              variant="secondary"
              fullWidth={false}
              disabled={busy || reason.trim().length < 3}
              className="min-h-11 px-4 text-[13px]"
            >
              {mark.isPending ? 'Saving…' : 'Mark as logged in error'}
            </ScButton>
            <ScButton
              variant="secondary"
              fullWidth={false}
              disabled={busy}
              onClick={() => setAsking(false)}
              className="min-h-11 px-4 text-[13px]"
            >
              Cancel
            </ScButton>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-text-secondary">
            Logged by mistake? It stays in the record and leaves every count. You can undo it.
          </p>
          <ScButton
            variant="secondary"
            fullWidth={false}
            onClick={() => setAsking(true)}
            className="min-h-11 self-start px-4 text-[13px]"
          >
            Logged in error…
          </ScButton>
        </div>
      )}
    </ScSection>
  )
}

/** The categories whose answer starts with the job photos. */
const PHOTO_CATEGORIES = new Set<AdminComplaint['category']>([
  'damage',
  'service_quality',
])

function ComplaintJobPhotos({ bookingId }: { bookingId: string }) {
  const { data: booking, isPending, error } = useAdminBooking(bookingId)
  if (isPending) return <SkeletonList count={1} itemClassName="h-24" />
  if (error || !booking) {
    return (
      <ScSection title="Job photos">
        <p className="text-[13px] text-text-secondary">
          Couldn&apos;t load this booking&apos;s photos.
        </p>
      </ScSection>
    )
  }
  if ((booking.photos ?? []).length === 0) {
    return (
      <ScSection title="Job photos">
        <p className="text-[13px] text-text-secondary">
          Neither the garage nor the customer added photos to this booking.
        </p>
      </ScSection>
    )
  }
  return <JobPhotosSection booking={booking} allowWaive={false} />
}

export default function AdminComplaintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  // useSearchParams needs a Suspense boundary, or Next.js refuses to
  // prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-32" />}>
      <ComplaintDetail id={id} />
    </Suspense>
  )
}
