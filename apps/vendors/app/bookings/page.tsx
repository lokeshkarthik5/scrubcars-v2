'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconCheck } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScInput } from '@repo/ui/sc/input'
import { StarRating } from '@repo/ui/sc/stars'
import { TopBar } from '@repo/ui/sc/top-bar'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useNow } from '@repo/core/hooks/use-now'
import { toast } from 'react-toastify'
import { FinalBillPanel } from '@/components/final-bill'
import { JobContact } from '@/components/job-contact'
import { JobPhotos } from '@/components/job-photos'
import { jobStepTimes } from '@repo/core/job-records'
import type { Booking } from '@repo/core/types'
import { formatDuration } from '@repo/core/utils'

type Tab = 'incoming' | 'upcoming' | 'completed' | 'cancelled'

export default function VendorBookingsPage() {
  const [tab, setTab] = useState<Tab>('incoming')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const vendorBookings = useBookingsStore((s) => s.vendorBookings)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const updateStatus = useBookingsStore((s) => s.updateStatus)

  useEffect(() => {
    void fetchVendorBookings()
    // Poll so vendors see new/updated bookings live (~10s).
    const interval = setInterval(() => {
      void fetchVendorBookings()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchVendorBookings])

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
    <AppShell showNav navType="vendor" className="gap-4 py-4">
      <TopBar
        title="Bookings"
        right={
          incomingCount > 0 ? (
            <ScBadge variant="accent">{incomingCount} new</ScBadge>
          ) : undefined
        }
      />

      <ScSegmented
        aria-label="Filter bookings by status"
        value={tab}
        onChange={setTab}
        options={tabs.map((t) => ({
          value: t.key,
          label: `${t.label} (${t.count})`,
        }))}
      />

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <ScCard>
            <p className="text-[11px] capitalize text-text-secondary">{tab} bookings</p>
            <p className="text-lg font-semibold text-text-primary">0</p>
          </ScCard>
        ) : (
          filtered.map((b) => {
          const badge = bookingStatusBadge(b.status)
          return (
            <ScCard key={b.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-semibold">{b.customerName}</p>
                  <p className="text-[11px] text-text-secondary">{b.serviceSummary} · {b.scheduledAt}</p>
                </div>
                <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
              </div>

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
                      <IconCheck size={12} className="shrink-0 text-brand-red" />
                      {item.name}
                      <span className="text-text-muted">
                        · {formatDuration(item.durationMins)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {b.vehicle && (
                <p className="text-[11px] text-text-secondary">
                  {b.vehicle.make} {b.vehicle.model} · {b.vehicle.plate}
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

              {tab === 'incoming' && rejectId !== b.id && slotPassed(b, now) && (
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
                </div>
              )}

              {tab === 'incoming' && rejectId !== b.id && !slotPassed(b, now) && (
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
                </div>
              )}

              {tab === 'incoming' && rejectId === b.id && (
                <div className="flex flex-col gap-2 border-t border-border pt-2">
                  <ScInput
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
                <div className="flex flex-col gap-3 border-t border-border pt-2">
                  <JobPhotos booking={b} stage="before" onChanged={refresh} />
                  {b.status === 'in_progress' && (
                    <JobPhotos booking={b} stage="after" onChanged={refresh} />
                  )}
                </div>
              )}

              {tab === 'upcoming' && b.status === 'in_progress' && (
                <FinalBillPanel booking={b} onChanged={refresh} />
              )}

              {tab === 'upcoming' && b.status === 'confirmed' && (
                <ScButton
                  aria-label={`Mark booking for ${b.customerName} in progress`}
                  onClick={() => handleStatus(b.id, 'in_progress')}
                >
                  Mark in progress
                </ScButton>
              )}

              {tab === 'upcoming' && b.status === 'in_progress' && (
                <ScButton
                  aria-label={`Mark booking for ${b.customerName} completed`}
                  onClick={() => handleStatus(b.id, 'completed')}
                >
                  Mark completed
                </ScButton>
              )}

              {tab === 'completed' && (
                <div className="flex flex-col gap-3 border-t border-border pt-2">
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
                <div className="border-t border-border pt-2">
                  <StarRating rating={b.review.rating} />
                  <p className="mt-1 text-[12px] text-text-secondary">{b.review.comment}</p>
                </div>
              )}

              {tab === 'cancelled' && (
                <div className="border-t border-border pt-2">
                  <p className="text-[12px] font-medium text-text-primary">
                    {cancelledLabel(b)}
                  </p>
                  {b.cancellationReason && (
                    <p className="mt-1 text-[12px] text-text-secondary">{b.cancellationReason}</p>
                  )}
                </div>
              )}
            </ScCard>
          )
        })
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
