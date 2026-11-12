'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconCalendarQuestion, IconLoader2 } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { fill, useT } from '@repo/core/i18n'
import { ScButton } from '@repo/ui/sc/button'
import { Chip } from '@repo/ui/sc/chip'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import {
  getProposalSlots,
  suggestTimes,
  withdrawTimeProposal,
} from '@repo/core/api/bookings'
import { formatClock, formatWhen } from '@repo/core/format'
import { bookingDayLabel, istDateKey } from '@repo/core/home-display'
import type { Booking } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/** Mirrors the server (lib/time-proposals.ts) so the sheet refuses first. */
const MAX_TIMES = 3
const NOTE_MAX = 200
/** How far ahead the day chips go. */
const DAYS_AHEAD = 14
const DAY_MS = 24 * 60 * 60 * 1000

/** "Tomorrow · 2:00 pm", "Sat 17 Oct · 2:00 pm": the one way times read in the portal. */
function timeLabel(iso: string): string {
  return formatWhen(iso)
}

/** The next DAYS_AHEAD IST days as "YYYY-MM-DD", starting with the booking's own day or today. */
function dayKeys(from: Date): string[] {
  return Array.from({ length: DAYS_AHEAD }, (_, i) =>
    istDateKey(new Date(from.getTime() + i * DAY_MS))
  )
}

/** "Sat 17 Oct" from an IST day key (noon IST, so the label never slips a day). */
function dayChipLabel(key: string): string {
  return bookingDayLabel(`${key}T06:30:00.000Z`)
}

interface SuggestTimesProps {
  booking: Booking
  /** Re-read the job list once the suggestion changes. */
  onChanged: () => void
  /** Where the "Other time" button sits in its row. */
  className?: string
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
export function SuggestTimes({
  booking,
  onChanged,
  className,
}: SuggestTimesProps) {
  const t = useT()
  const proposal =
    booking.timeProposal?.status === 'open' ? booking.timeProposal : null
  // Ran out unanswered, and not yet cancelled by the next sweep (minutes).
  const ranOut =
    booking.status === 'pending' && booking.timeProposal?.status === 'expired'
  const who = booking.customerName ?? t('the customer')
  const [open, setOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const handleWithdraw = async () => {
    if (withdrawing) return
    setWithdrawing(true)
    try {
      await withdrawTimeProposal(booking.id)
      toast.success(
        t('Suggested times withdrawn. Accept or reject the booking as usual.')
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Could not withdraw the times')
      )
    } finally {
      setWithdrawing(false)
      onChanged()
    }
  }

  if (proposal) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <p className="flex items-center gap-1.5 text-[15px] font-medium text-text-primary">
          <IconCalendarQuestion size={18} stroke={1.5} aria-hidden />
          {t('Waiting for {who} to pick a time', { who })}
        </p>
        <ul className="flex flex-col gap-0.5">
          {proposal.options.map((option) => (
            <li
              key={option}
              className="font-numeric text-[15px] text-text-secondary"
            >
              {timeLabel(option)}
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-text-secondary">
          {t(
            "If {who} doesn't pick one by {time}, the booking is cancelled and refunded in full.",
            { who, time: timeLabel(proposal.expiresAt) }
          )}
        </p>
        <ScButton
          variant="outline"
          size="md"
          disabled={withdrawing}
          onClick={handleWithdraw}
          aria-label={t('Withdraw suggested times for {who}', { who })}
        >
          {withdrawing ? t('Withdrawing…') : t('Withdraw times')}
        </ScButton>
      </div>
    )
  }

  if (ranOut) {
    return (
      <p className={cn('text-[15px] text-text-secondary', className)}>
        {t(
          "{who} didn't pick one of your times in time, so this booking is being cancelled and refunded.",
          { who }
        )}
      </p>
    )
  }

  if (!booking.canSuggestTimes) return null

  return (
    <>
      {/* The name starts with the words on the button, then says whose job. */}
      <ScButton
        variant="outline"
        size="md"
        onClick={() => setOpen(true)}
        aria-label={t('Other time: suggest another time for {who}', { who })}
        className={className}
      >
        {t('Other time')}
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
  const t = useT()
  const who = booking.customerName ?? t('the customer')
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
      : t('Could not load the times')
    : !times.data
      ? null
      : times.data.paused
        ? t("You've paused new bookings, so there are no times to offer.")
        : times.data.isClosed
          ? t('Closed this day.')
          : times.data.slots.length === 0
            ? times.data.allBooked
              ? t('Every time this day is booked up.')
              : t('No times left this day.')
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
      toast.success(t('Times sent. {who} picks one in the Detlio app.', { who }))
      onSent()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Could not send the times')
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <ScSheet
      open
      onClose={onClose}
      dismissible={!sending}
      aria-label={t('Suggest another time for {who}', { who })}
      className="px-4"
    >
      <h2 className="text-base font-semibold text-text-primary">
        {t('Suggest another time')}
      </h2>
      {/* Whole sentences from template strings: a name glued into JSX text
          lost its space after it in the built page ("Arjun Rameshpicks"). */}
      <p className="mt-1 text-[14px] text-text-secondary">
        {t(
          "Can't do {time}? Pick up to {max} times you can do. {who} picks one in the app and it's booked straight away.",
          { time: timeLabel(booking.scheduledAtIso), max: MAX_TIMES, who }
        )}
      </p>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        {t('Day')}
      </p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {days.map((key) => (
          <Chip
            key={key}
            label={dayChipLabel(key)}
            selected={key === day}
            onClick={() => setDay(key)}
          />
        ))}
      </div>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        {t('Time')}
      </p>
      <div className="mt-2 flex min-h-11 flex-wrap gap-2">
        {slots === null && !dayNote ? (
          <IconLoader2
            size={18}
            className="animate-spin text-text-muted"
            aria-label={t('Loading times')}
          />
        ) : dayNote ? (
          <p className="text-[12px] text-text-secondary">{dayNote}</p>
        ) : (
          (slots ?? []).map((slot) => (
            <Chip
              key={slot.time}
              label={formatClock(slot.time)}
              selected={picked.includes(slot.time)}
              disabled={
                !picked.includes(slot.time) && picked.length >= MAX_TIMES
              }
              onClick={() => toggle(slot.time)}
            />
          ))
        )}
      </div>

      {picked.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {fill(t('Offering {count} of {max}'), {
              count: <span className="font-numeric">{picked.length}</span>,
              max: MAX_TIMES,
            })}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {[...picked].sort().map((time) => (
              <li
                key={time}
                className="font-numeric text-[13px] text-text-primary"
              >
                {timeLabel(time)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <ScTextarea
          label={t('Note for the customer (optional)')}
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <p className="mt-3 text-[13px] text-text-secondary">
        {t(
          "If {who} doesn't answer in time (at most 12 hours), the booking is cancelled and refunded in full.",
          { who }
        )}
      </p>

      <div className="mt-5 flex gap-2">
        <ScButton
          variant="outline"
          size="lg"
          disabled={sending}
          onClick={onClose}
        >
          {t('Cancel')}
        </ScButton>
        <ScButton
          variant="main"
          size="lg"
          disabled={picked.length === 0 || sending}
          disabledReason={
            picked.length === 0 && !sending
              ? t('Pick at least one time')
              : undefined
          }
          onClick={handleSend}
        >
          {sending
            ? t('Sending…')
            : picked.length > 1
              ? t('Send {count} times', { count: picked.length })
              : t('Send time')}
        </ScButton>
      </div>
    </ScSheet>
  )
}
