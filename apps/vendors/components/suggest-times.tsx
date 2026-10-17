'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconCalendarQuestion, IconLoader2 } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { Chip } from '@repo/ui/sc/chip'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { getProposalSlots, suggestTimes, withdrawTimeProposal } from '@repo/core/api/bookings'
import { bookingDayLabel, istClock, istDateKey } from '@repo/core/home-display'
import type { Booking } from '@repo/core/types'

/** Mirrors the server (lib/time-proposals.ts) so the sheet refuses first. */
const MAX_TIMES = 3
const NOTE_MAX = 200
/** How far ahead the day chips go. */
const DAYS_AHEAD = 14
const DAY_MS = 24 * 60 * 60 * 1000

/** "Sat 17 Oct, 2:00 PM", in IST like the rest of the portal. */
function timeLabel(iso: string): string {
  return `${bookingDayLabel(iso)}, ${istClock(new Date(iso))}`
}

/** The next DAYS_AHEAD IST days as "YYYY-MM-DD", starting with the booking's own day or today. */
function dayKeys(from: Date): string[] {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => istDateKey(new Date(from.getTime() + i * DAY_MS)))
}

/** "Sat 17 Oct" from an IST day key (noon IST, so the label never slips a day). */
function dayChipLabel(key: string): string {
  return bookingDayLabel(`${key}T06:30:00.000Z`)
}

interface SuggestTimesProps {
  booking: Booking
  /** Re-read the job list once the suggestion changes. */
  onChanged: () => void
}

/**
 * "Suggest another time" on a new booking the garage can't do at its time
 * (0041): instead of rejecting it, offer one to three of the garage's own
 * free times for the same job. The list is the customer's own slot list for
 * this job (same services, length, booking type and notice; bays, holidays
 * and pause counted), so every time offered is one the garage can take.
 *
 * Once sent, the card says what was offered and until when, and Withdraw
 * puts the booking back to waiting for Accept or Reject. The customer picks
 * one in the app (it is accepted at once — the garage offered it), or says
 * none work, which cancels it with a full refund, as does no answer by then.
 */
export function SuggestTimes({ booking, onChanged }: SuggestTimesProps) {
  const proposal = booking.timeProposal?.status === 'open' ? booking.timeProposal : null
  // Ran out unanswered, and not yet cancelled by the next sweep (minutes).
  const ranOut = booking.status === 'pending' && booking.timeProposal?.status === 'expired'
  const who = booking.customerName ?? 'the customer'
  const [open, setOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const handleWithdraw = async () => {
    if (withdrawing) return
    setWithdrawing(true)
    try {
      await withdrawTimeProposal(booking.id)
      toast.success('Suggested times withdrawn. Accept or reject the booking as usual.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not withdraw the times')
    } finally {
      setWithdrawing(false)
      onChanged()
    }
  }

  if (proposal) {
    return (
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
          <IconCalendarQuestion size={15} stroke={1.5} aria-hidden />
          Waiting for {who} to pick a time
        </p>
        <ul className="flex flex-col gap-0.5">
          {proposal.options.map((option) => (
            <li key={option} className="font-numeric text-[12px] text-text-secondary">
              {timeLabel(option)}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-text-muted">
          If {who} doesn&apos;t pick one by{' '}
          <span className="font-numeric">{timeLabel(proposal.expiresAt)}</span>, the booking is cancelled
          and refunded in full.
        </p>
        <ScButton
          variant="secondary"
          disabled={withdrawing}
          onClick={handleWithdraw}
          aria-label={`Withdraw suggested times for ${who}`}
          className="min-h-11"
        >
          {withdrawing ? 'Withdrawing…' : 'Withdraw times'}
        </ScButton>
      </div>
    )
  }

  if (ranOut) {
    return (
      <p className="border-t border-border pt-3 text-[12px] text-text-secondary">
        {who} didn&apos;t pick one of your times in time, so this booking is being cancelled and refunded.
      </p>
    )
  }

  if (!booking.canSuggestTimes) return null

  return (
    <>
      <ScButton
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label={`Suggest another time for ${who}`}
        className="min-h-11"
      >
        Suggest another time
      </ScButton>
      {open && (
        <SuggestTimesSheet
          booking={booking}
          onClose={() => setOpen(false)}
          onSent={() => {
            setOpen(false)
            onChanged()
          }}
        />
      )}
    </>
  )
}

function SuggestTimesSheet({
  booking,
  onClose,
  onSent,
}: {
  booking: Booking
  onClose: () => void
  onSent: () => void
}) {
  const who = booking.customerName ?? 'the customer'
  // The days on offer, worked out once when the sheet opens: from the
  // booked day, or today when that has passed.
  const [days] = useState(() => {
    const booked = new Date(booking.scheduledAtIso)
    return dayKeys(booked.getTime() > Date.now() ? booked : new Date())
  })
  const [day, setDay] = useState(days[0])
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const times = useQuery({
    queryKey: ['proposal-slots', booking.id, day],
    queryFn: () => getProposalSlots(booking.id, day),
    // Always the garage's room as it is now: another booking may have taken
    // a time since the sheet last looked.
    staleTime: 0,
    retry: false,
  })
  const slots = times.data?.slots ?? null
  const dayNote = times.error
    ? times.error instanceof Error
      ? times.error.message
      : 'Could not load the times'
    : !times.data
      ? null
      : times.data.paused
        ? "You've paused new bookings, so there are no times to offer."
        : times.data.isClosed
          ? 'Closed this day.'
          : times.data.slots.length === 0
            ? times.data.allBooked
              ? 'Every time this day is booked up.'
              : 'No times left this day.'
            : null

  const toggle = (time: string) =>
    setPicked((current) =>
      current.includes(time)
        ? current.filter((t) => t !== time)
        : current.length >= MAX_TIMES
          ? current
          : [...current, time]
    )

  const handleSend = async () => {
    if (picked.length === 0 || sending) return
    setSending(true)
    try {
      await suggestTimes(booking.id, picked, note.trim() || undefined)
      toast.success(`Times sent. ${who} picks one in the Detlio app.`)
      onSent()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the times')
    } finally {
      setSending(false)
    }
  }

  return (
    <ScSheet
      open
      onClose={onClose}
      dismissible={!sending}
      aria-label={`Suggest another time for ${who}`}
      className="px-4"
    >
      <h2 className="text-base font-semibold text-text-primary">Suggest another time</h2>
      <p className="mt-1 text-[12px] text-text-secondary">
        Can&apos;t do <span className="font-numeric">{timeLabel(booking.scheduledAtIso)}</span>? Pick up to{' '}
        {MAX_TIMES} times you can do. {who} picks one in the app and it&apos;s booked straight away.
      </p>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-text-secondary">Day</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {days.map((key) => (
          <Chip key={key} label={dayChipLabel(key)} selected={key === day} onClick={() => setDay(key)} />
        ))}
      </div>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-text-secondary">Time</p>
      <div className="mt-2 flex min-h-11 flex-wrap gap-2">
        {slots === null && !dayNote ? (
          <IconLoader2 size={18} className="animate-spin text-text-muted" aria-label="Loading times" />
        ) : dayNote ? (
          <p className="text-[12px] text-text-secondary">{dayNote}</p>
        ) : (
          (slots ?? []).map((slot) => (
            <Chip
              key={slot.time}
              label={slot.label}
              selected={picked.includes(slot.time)}
              disabled={!picked.includes(slot.time) && picked.length >= MAX_TIMES}
              onClick={() => toggle(slot.time)}
            />
          ))
        )}
      </div>

      {picked.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            Offering <span className="font-numeric">{picked.length}</span> of {MAX_TIMES}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {[...picked].sort().map((time) => (
              <li key={time} className="font-numeric text-[13px] text-text-primary">
                {timeLabel(time)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <ScTextarea
          label="Note for the customer (optional)"
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <p className="mt-3 text-[11px] text-text-muted">
        If {who} doesn&apos;t answer in time (at most 12 hours), the booking is cancelled and refunded in full.
      </p>

      <div className="mt-5 flex gap-2">
        <ScButton variant="secondary" disabled={sending} onClick={onClose}>
          Cancel
        </ScButton>
        <ScButton disabled={picked.length === 0 || sending} onClick={handleSend}>
          {sending ? 'Sending…' : picked.length > 1 ? `Send ${picked.length} times` : 'Send time'}
        </ScButton>
      </div>
    </ScSheet>
  )
}
