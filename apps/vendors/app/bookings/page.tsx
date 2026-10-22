'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconCalendarCheck,
  IconCalendarX,
  IconCheck,
  IconCircleCheck,
  IconInbox,
} from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScInput } from '@repo/ui/sc/input'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { Stars } from '@repo/ui/sc/stars'
import { TopBar } from '@repo/ui/sc/top-bar'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useNow } from '@repo/core/hooks/use-now'
import { toast } from 'react-toastify'
import { FinalBillPanel } from '@/components/final-bill'
import { ExtraWorkPanel } from '@/components/extra-work'
import { SuggestTimes } from '@/components/suggest-times'
import { ActiveGarage } from '@/components/active-garage'
import { JobCardHeader } from '@/components/job-card-header'
import { JobContact } from '@/components/job-contact'
import { JobPhotos } from '@/components/job-photos'
import { PickupSteps } from '@/components/pickup-steps'
import { jobStepTimes } from '@repo/core/job-records'
import type { Booking } from '@repo/core/types'
import { formatDuration } from '@repo/core/utils'

type Tab = 'incoming' | 'upcoming' | 'completed' | 'cancelled'

/** What an empty tab says, in the garage's words. */
const EMPTY: Record<Tab, { icon: React.ReactNode; title: string; subtitle: string }> = {
  incoming: {
    icon: <IconInbox size={28} stroke={1.5} />,
    title: 'No new bookings',
    subtitle: 'New requests from customers show up here for you to accept.',
  },
  upcoming: {
    icon: <IconCalendarCheck size={28} stroke={1.5} />,
    title: 'Nothing upcoming',
    subtitle: 'Bookings you accept wait here until the job is done.',
  },
  completed: {
    icon: <IconCircleCheck size={28} stroke={1.5} />,
    title: 'No completed jobs yet',
    subtitle: 'Jobs you mark completed are kept here.',
  },
  cancelled: {
    icon: <IconCalendarX size={28} stroke={1.5} />,
    title: 'No cancelled bookings',
    subtitle: 'Bookings you reject, or that are cancelled, are kept here.',
  },
}

export default function VendorBookingsPage() {
  const [tab, setTab] = useState<Tab>('incoming')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const vendorBookings = useBookingsStore((s) => s.vendorBookings)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const updateStatus = useBookingsStore((s) => s.updateStatus)
  // Placeholders until the first read settles. Only the first: the poll
  // below re-reads every 10 seconds, and the list must not blink each time.
  const [loaded, setLoaded] = useState(false)
  // A failed read is not an empty list. Without this the Incoming tab would
  // say "No new bookings" while paid requests wait for an Accept. Any later
  // read that succeeds (the poll, or Retry) clears it.
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(
    () =>
      fetchVendorBookings()
        .then(() => setLoadFailed(false))
        .catch(() => setLoadFailed(true))
        .finally(() => setLoaded(true)),
    [fetchVendorBookings]
  )

  useEffect(() => {
    void load()
    // Poll so vendors see new/updated bookings live (~10s).
    const interval = setInterval(() => {
      void fetchVendorBookings()
        .then(() => setLoadFailed(false))
        .catch(() => undefined)
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchVendorBookings, load])

  const { filtered, incomingCount, upcomingCount, completedCount, cancelledCount } = useMemo(() => {
    let incoming = 0, upcoming = 0, completed = 0, cancelled = 0
    const result: typeof vendorBookings = []
    for (const b of vendorBookings) {
      if (b.status === 'pending') {
        incoming++
        if (tab === 'incoming') result.push(b)
      } else if (b.status === 'confirmed' || b.status === 'in_progress') {
        upcoming++
        if (tab === 'upcoming') result.push(b)
      } else if (b.status === 'completed') {
        completed++
        if (tab === 'completed') result.push(b)
      } else if (b.status === 'cancelled') {
        cancelled++
        if (tab === 'cancelled') result.push(b)
      }
    }
    return { filtered: result, incomingCount: incoming, upcomingCount: upcoming, completedCount: completed, cancelledCount: cancelled }
  }, [vendorBookings, tab])

  // A pending job whose time passes while this page is open loses its Accept.
  const now = useNow(30_000)

  // A refusal (the slot has started, the customer cancelled a moment ago)
  // is shown, and the list re-read so the card stops offering it.
  const refused = (error: unknown, fallback: string) => {
    toast.error(error instanceof Error ? error.message : fallback)
    void fetchVendorBookings()
  }

  // After a photo or a bill changes, read the list again: the card shows
  // what the server now holds.
  const refresh = () => {
    void fetchVendorBookings()
  }

  const handleStatus = async (id: string, status: Booking['status']) => {
    try {
      await updateStatus(id, status)
    } catch (error) {
      refused(error, 'Could not update this booking')
    }
  }

  const handleReject = async (id: string) => {
    try {
      await updateStatus(id, 'cancelled', rejectReason.trim() || undefined)
      setRejectId(null)
      setRejectReason('')
    } catch (error) {
      refused(error, 'Could not reject this booking')
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'incoming', label: 'Incoming', count: incomingCount },
    { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
    { key: 'completed', label: 'Completed', count: completedCount },
    { key: 'cancelled', label: 'Cancelled', count: cancelledCount },
  ]

  return (
    <AppShell
      showNav
      navType="vendor"
      showBrand
      brandRight={<ActiveGarage />}
      className="gap-4 py-4"
    >
      <TopBar
        title="Bookings"
        right={
          incomingCount > 0 ? (
            <ScBadge variant="accent">
              <span className="font-numeric">{incomingCount}</span>&nbsp;new
            </ScBadge>
          ) : undefined
        }
      />

      {/* The count sits beside each name in the numeric face, quieter than
          the name. Its accessible name still starts with the name. */}
      <ScSegmented
        aria-label="Filter bookings by status"
        value={tab}
        onChange={setTab}
        options={tabs.map((t) => ({
          value: t.key,
          label: (
            <>
              {t.label}{' '}
              <span className="font-numeric text-[12px] opacity-70">{t.count}</span>
            </>
          ),
        }))}
      />

      <div className="flex flex-col gap-2">
        {!loaded && vendorBookings.length === 0 ? (
          <SkeletonList count={3} itemClassName="h-36" />
        ) : loadFailed && vendorBookings.length === 0 ? (
          <ErrorState
            message="Couldn't load your bookings. Check your connection."
            onRetry={() => {
              setLoaded(false)
              void load()
            }}
          />
        ) : filtered.length === 0 ? (
          <EmptyState {...EMPTY[tab]} />
        ) : (
          // No <Reveal> on these cards, unlike Home's: a job card hosts the
          // Final bill sheet and the photo viewer, which draw themselves
          // `position: fixed` in place. Reveal's transform would make the card
          // their containing block, so the sheet would open inside the card
          // instead of over the screen.
          filtered.map((b) => (
            <ScCard key={b.id} className="flex flex-col gap-3">
              <JobCardHeader booking={b} />

              {/* The summary line above says "+2 more"; whoever does the work
                  needs the actual list, so a multi-service job spells it out.
                  A single-service job reads exactly as it always did. */}
              {b.items.length > 1 && (
                <ul className="flex flex-col gap-0.5">
                  {b.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-1.5 text-[11px] text-text-secondary"
                    >
                      <IconCheck size={12} aria-hidden="true" className="shrink-0 text-text-muted" />
                      {item.name}
                      <span className="text-text-muted">
                        · <span className="font-numeric">{formatDuration(item.durationMins)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {b.vehicle && (
                <p className="text-[12px] text-text-secondary">
                  {b.vehicle.make} {b.vehicle.model} ·{' '}
                  <span className="font-numeric">{b.vehicle.plate}</span>
                </p>
              )}

              <JobContact booking={b} />

              {/* When each step happened, as the garage recorded it. */}
              {b.status !== 'pending' && jobStepTimes(b, now).length > 0 && (
                <p className="font-numeric text-[11px] text-text-secondary">
                  {jobStepTimes(b, now).join(' · ')}
                </p>
              )}

              {b.status === 'pending' && b.rescheduledFromId && !slotPassed(b, now) && (
                <p className="text-[12px] text-text-secondary">
                  The customer moved this booking to a new time. Accept it if you can do it.
                </p>
              )}

              {/* Times suggested instead of a decision (0041): what was
                  offered, until when, and Withdraw. Accept and Reject wait. */}
              {tab === 'incoming' && proposalOpen(b) && <SuggestTimes booking={b} onChanged={refresh} />}

              {tab === 'incoming' && !proposalOpen(b) && rejectId !== b.id && slotPassed(b, now) && (
                // Accepting is refused once the time has passed: the customer
                // waited and nobody answered. Declining frees the refund.
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] text-text-secondary">
                    This slot&apos;s time has passed without being accepted. Reject it so the
                    customer can be refunded, or call them to rebook.
                  </p>
                  <ScButton
                    variant="secondary"
                    aria-label={`Reject booking for ${b.customerName}`}
                    onClick={() => { setRejectId(b.id); setRejectReason('') }}
                  >
                    Reject
                  </ScButton>
                  <SuggestTimes booking={b} onChanged={refresh} />
                </div>
              )}

              {tab === 'incoming' && !proposalOpen(b) && rejectId !== b.id && !slotPassed(b, now) && (
                <div className="grid grid-cols-2 gap-2">
                  {/* A list of identical "Accept" buttons announces as a list of
                      identical "Accept" buttons; the name has to say whose job
                      it is. */}
                  <ScButton
                    variant="secondary"
                    aria-label={`Reject booking for ${b.customerName}`}
                    onClick={() => { setRejectId(b.id); setRejectReason('') }}
                  >
                    Reject
                  </ScButton>
                  <ScButton
                    aria-label={`Accept booking for ${b.customerName}`}
                    onClick={() => handleStatus(b.id, 'confirmed')}
                  >
                    Accept
                  </ScButton>
                  {/* Can't do this time? Offer others instead of rejecting. */}
                  <div className="col-span-2 flex flex-col">
                    <SuggestTimes booking={b} onChanged={refresh} />
                  </div>
                </div>
              )}

              {tab === 'incoming' && rejectId === b.id && (
                <div className="rise-in flex flex-col gap-2 border-t border-border pt-3">
                  <ScInput
                    // A placeholder is no name once something is typed.
                    aria-label="Reason for rejecting (optional)"
                    placeholder="Reason for rejecting (optional)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ScButton variant="secondary" onClick={() => setRejectId(null)}>Keep</ScButton>
                    <ScButton onClick={() => handleReject(b.id)}>Confirm reject</ScButton>
                  </div>
                </div>
              )}

              {/* Photos are optional: nothing below waits on them. Before
                  photos from acceptance, after photos once work starts. */}
              {tab === 'upcoming' && (
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                  <JobPhotos booking={b} stage="before" onChanged={refresh} />
                  {b.status === 'in_progress' && (
                    <JobPhotos booking={b} stage="after" onChanged={refresh} />
                  )}
                </div>
              )}

              {tab === 'upcoming' && b.status === 'in_progress' && (
                <FinalBillPanel booking={b} onChanged={refresh} />
              )}

              {/* Extra work the customer approves by paying in the app (0041). */}
              {(tab === 'upcoming' || tab === 'completed' || tab === 'cancelled') && (
                <ExtraWorkPanel booking={b} onChanged={refresh} />
              )}

              {tab === 'upcoming' && b.completeBlockedByExtraWork && (
                <p className="text-[12px] text-text-secondary">
                  Waiting for {b.customerName ?? 'the customer'} to answer your extra-work request. Withdraw
                  it, or wait for their answer, before completing the job.
                </p>
              )}

              {/* Pickup & drop has its own steps around the work: one button
                  for whatever the job waits for, from the server. */}
              {tab === 'upcoming' && b.bookingType === 'pickup' && (
                <PickupSteps
                  booking={b}
                  onStartWork={() => handleStatus(b.id, 'in_progress')}
                  onChanged={refresh}
                />
              )}

              {tab === 'upcoming' && b.bookingType !== 'pickup' && b.status === 'confirmed' && (
                <ScButton
                  aria-label={`Mark booking for ${b.customerName} in progress`}
                  onClick={() => handleStatus(b.id, 'in_progress')}
                >
                  Mark in progress
                </ScButton>
              )}

              {tab === 'upcoming' && b.bookingType !== 'pickup' && b.status === 'in_progress' && (
                <ScButton
                  aria-label={`Mark booking for ${b.customerName} completed`}
                  disabled={b.completeBlockedByExtraWork}
                  onClick={() => handleStatus(b.id, 'completed')}
                >
                  Mark completed
                </ScButton>
              )}

              {tab === 'completed' && (
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                  <JobPhotos
                    booking={b}
                    stage="before"
                    onChanged={refresh}
                    readOnly={!photosOpen(b, now)}
                  />
                  <JobPhotos
                    booking={b}
                    stage="after"
                    onChanged={refresh}
                    readOnly={!photosOpen(b, now)}
                  />
                </div>
              )}

              {tab === 'completed' && <FinalBillPanel booking={b} onChanged={refresh} />}

              {tab === 'completed' && b.review && (
                <div className="border-t border-border pt-3">
                  <div className="flex items-center gap-1.5">
                    <Stars rating={b.review.rating} size={12} />
                    <span className="font-numeric text-[12px] font-medium text-text-primary">
                      {b.review.rating}
                    </span>
                  </div>
                  {b.review.comment && (
                    <p className="mt-1 text-[12px] text-text-secondary">{b.review.comment}</p>
                  )}
                </div>
              )}

              {tab === 'cancelled' && (
                <div className="border-t border-border pt-3">
                  <p className="text-[12px] font-medium text-text-primary">
                    {cancelledLabel(b)}
                  </p>
                  {b.cancellationReason && (
                    <p className="mt-1 text-[12px] text-text-secondary">{b.cancellationReason}</p>
                  )}
                </div>
              )}
            </ScCard>
          ))
        )}
      </div>
    </AppShell>
  )
}

/**
 * Who called a job off, as the garage reads it. A Detlio cancellation says
 * whose request it was, and a no-show names who didn't turn up — the garage
 * sees its own no-shows too, since they are on its record.
 */
function cancelledLabel(b: Booking): string {
  if (b.noShow === 'customer') return 'Customer no-show'
  if (b.noShow === 'garage') return 'Marked as garage no-show'
  // None of the times the garage suggested was taken (0041).
  if (b.cancelledBy === 'vendor' && b.timeProposal?.status === 'declined') {
    return 'None of your suggested times worked for the customer'
  }
  if (b.cancelledBy === 'vendor' && b.timeProposal?.status === 'expired') {
    return "The customer didn't pick one of your times in time"
  }
  switch (b.cancelledBy) {
    case 'vendor':
      return 'Rejected by you'
    case 'user':
      return 'Cancelled by customer'
    case 'admin':
      return b.cancelledOnBehalfOf === 'customer'
        ? "Cancelled by Detlio at the customer's request"
        : b.cancelledOnBehalfOf === 'garage'
          ? 'Cancelled by Detlio at your request'
          : 'Cancelled by Detlio'
    default:
      return 'Cancelled'
  }
}

/**
 * Whether a finished job's photos can still change: for a week after it was
 * completed (PHOTO_EDIT_WINDOW_DAYS on the server), counted from the slot on
 * jobs finished before completion times were kept.
 */
const PHOTO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function photosOpen(b: Booking, now: number): boolean {
  const finished = new Date(b.completedAtIso ?? b.scheduledAtIso).getTime()
  return now - finished <= PHOTO_WINDOW_MS
}

/** A pending job whose start time has come and gone: it can only be rejected. */
function slotPassed(b: Booking, now: number): boolean {
  return b.status === 'pending' && new Date(b.scheduledAtIso).getTime() <= now
}

/**
 * The garage suggested other times, and the customer hasn't answered yet —
 * or let them run out, and the booking is about to be cancelled. Accept and
 * Reject wait either way.
 */
function proposalOpen(b: Booking): boolean {
  return b.status === 'pending' && (b.timeProposal?.status === 'open' || b.timeProposal?.status === 'expired')
}
