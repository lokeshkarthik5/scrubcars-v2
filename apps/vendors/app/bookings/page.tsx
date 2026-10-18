'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { PushBanner } from '@/components/push-banner'
import { JobCardHeader } from '@/components/job-card-header'
import { JobContact } from '@/components/job-contact'
import { JobPhotos } from '@/components/job-photos'
import { PickupSteps } from '@/components/pickup-steps'
import { ResponseCountdown, responseRunOut } from '@/components/response-countdown'
import { jobStepTimes } from '@repo/core/job-records'
import { GARAGE_AFTER_GRACE_MINUTES, photoGateMessage } from '@repo/core/job-photo-standards'
import { BeforeAfterCompare } from '@repo/ui/features/before-after'
import type { Booking } from '@repo/core/types'
import { formatDuration } from '@repo/core/utils'

type Tab = 'incoming' | 'upcoming' | 'completed' | 'cancelled'

const TABS: readonly Tab[] = ['incoming', 'upcoming', 'completed', 'cancelled']
const isTab = (value: string | null): value is Tab => TABS.includes(value as Tab)

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

// useSearchParams needs a Suspense boundary for the page to prerender.
export default function VendorBookingsPage() {
  return (
    <Suspense fallback={null}>
      <VendorBookings />
    </Suspense>
  )
}

function VendorBookings() {
  const searchParams = useSearchParams()
  // The tab a link asked for: a notification opens its job's tab (0044).
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get('tab')
    return isTab(requested) ? requested : 'incoming'
  })
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

  // A pending job whose time passes while this page is open loses its Accept,
  // and so does one whose time to answer runs out (0042): often enough that
  // the buttons go with the countdown's own "cancelled and refunded".
  const now = useNow(10_000)

  // A notification opens a job here (0044): /bookings?tab=incoming#job-<id>.
  // The job is scrolled to once, as soon as the list has it.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#job-') || scrolledTo.current === hash) return
    const card = document.getElementById(hash.slice(1))
    if (!card) return
    scrolledTo.current = hash
    card.scrollIntoView({ block: 'start' })
  }, [filtered])

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

      <PushBanner />

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
            <ScCard key={b.id} id={`job-${b.id}`} className="flex scroll-mt-4 flex-col gap-3">
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

              {/* How long is left to answer (0042): a countdown, amber in
                  its last five minutes. Once it runs out with auto-cancel on,
                  it says the booking is cancelled and refunded, and the
                  buttons below go (the server refuses them). */}
              {tab === 'incoming' &&
                b.status === 'pending' &&
                b.responseDeadline &&
                !proposalOpen(b) &&
                (!slotPassed(b, now) || responseRunOut(b.responseDeadline, now)) && (
                  <ResponseCountdown deadline={b.responseDeadline} />
                )}

              {tab === 'incoming' && !proposalOpen(b) && rejectId !== b.id && slotPassed(b, now) && !responseRunOut(b.responseDeadline, now) && (
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

              {tab === 'incoming' && !proposalOpen(b) && rejectId !== b.id && !slotPassed(b, now) && !responseRunOut(b.responseDeadline, now) && (
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

              {/* Before photos from acceptance, after photos once work
                  starts (0045: Start waits for two before photos and
                  Complete for two after photos while the standard is on). */}
              {tab === 'upcoming' && (
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                  <JobPhotos booking={b} stage="before" onChanged={refresh} readOnly={!photosOpen(b, 'before', now)} />
                  {b.status === 'in_progress' && (
                    <JobPhotos booking={b} stage="after" onChanged={refresh} />
                  )}
                  {b.photoStandard?.required && b.photoStandard.waived && (
                    <p className="text-[11px] text-text-muted">
                      Detlio waived the photos for this job: Start and Complete don&apos;t wait for them.
                    </p>
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

              {/* What Start waits for, said beside it (0045). */}
              {/* Siblings on the card, not wrapped: a spec finds a job's card as
                  the innermost element holding its button. */}
              {tab === 'upcoming' && b.bookingType !== 'pickup' && b.status === 'confirmed' && (
                <>
                  {b.photoStandard?.startBlocked && (
                    <p id={`job-${b.id}-start-blocked`} className="text-[12px] text-warning">
                      {photoGateMessage(b.photoStandard.startBlocked)}
                    </p>
                  )}
                  <ScButton
                    aria-label={`Mark booking for ${b.customerName} in progress`}
                    aria-describedby={b.photoStandard?.startBlocked ? `job-${b.id}-start-blocked` : undefined}
                    disabled={Boolean(b.photoStandard?.startBlocked)}
                    onClick={() => handleStatus(b.id, 'in_progress')}
                  >
                    Mark in progress
                  </ScButton>
                </>
              )}

              {tab === 'upcoming' && b.bookingType !== 'pickup' && b.status === 'in_progress' && (
                <>
                  {b.photoStandard?.finishBlocked && (
                    <p id={`job-${b.id}-finish-blocked`} className="text-[12px] text-warning">
                      {photoGateMessage(b.photoStandard.finishBlocked)}
                    </p>
                  )}
                  <ScButton
                    aria-label={`Mark booking for ${b.customerName} completed`}
                    aria-describedby={b.photoStandard?.finishBlocked ? `job-${b.id}-finish-blocked` : undefined}
                    disabled={b.completeBlockedByExtraWork || Boolean(b.photoStandard?.finishBlocked)}
                    onClick={() => handleStatus(b.id, 'completed')}
                  >
                    Mark completed
                  </ScButton>
                </>
              )}

              {tab === 'completed' && (
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                  {/* The finished job, side by side with how it came in. */}
                  <BeforeAfterCompare photos={b.jobPhotos} />
                  <JobPhotos
                    booking={b}
                    stage="before"
                    onChanged={refresh}
                    readOnly={!photosOpen(b, 'before', now)}
                  />
                  <JobPhotos
                    booking={b}
                    stage="after"
                    onChanged={refresh}
                    readOnly={!photosOpen(b, 'after', now)}
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
                  {/* The label says it all for a missed answer (its reason
                      is the same words). */}
                  {b.cancellationReason && !b.notAcceptedInTime && (
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
  // Nobody accepted it in time, so Detlio cancelled it (0042).
  if (b.notAcceptedInTime) return 'Not accepted in time — cancelled and refunded'
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
 * Whether the garage can still change a stage's photos, as the server says
 * (`photoStandard`, 0045: before photos until the job is completed, after
 * photos for an hour after). The card re-reads every 10 seconds, so the hour
 * is counted here too, from the completion time, rather than waiting for it.
 */
const AFTER_GRACE_MS = GARAGE_AFTER_GRACE_MINUTES * 60 * 1000

function photosOpen(b: Booking, stage: 'before' | 'after', now: number): boolean {
  if (b.photoStandard && !b.photoStandard[stage].canChange) return false
  if (stage === 'after' && b.status === 'completed') {
    const finished = new Date(b.completedAtIso ?? b.scheduledAtIso).getTime()
    return now - finished <= AFTER_GRACE_MS
  }
  return b.status !== 'completed' || stage === 'after'
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
