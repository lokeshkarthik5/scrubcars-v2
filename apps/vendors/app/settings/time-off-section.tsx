'use client'

import { useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { Notice } from '@repo/ui/sc/notice'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { ScSwitch } from '@repo/ui/sc/switch'
import {
  addClosure,
  pauseBookings,
  removeClosure,
  resumeBookings,
} from '@repo/core/api/vendors'
import type { ApiVendorClosure, ApiVendorProfile } from '@repo/core/api/types'
import type { Booking } from '@repo/core/types'
import { APP_TIMEZONE } from '@repo/core/utils'
import { toast } from 'react-toastify'

// How far ahead a holiday can go, matching the server's rule.
const MAX_DAYS_AHEAD = 365

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}

function addDays(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** "2026-10-20" → "Tue 20 Oct". The date is a calendar day, not an instant. */
function formatDay(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function bookingsSentence(count: number) {
  return count === 1
    ? 'You have 1 booking that day — reschedule or cancel it with the customer.'
    : `You have ${count} bookings that day — reschedule or cancel them with the customers.`
}

/**
 * "Pause new bookings": the garage drops out of the lists and checkout turns
 * customers away, while every booking it already has carries on. For a week
 * the owner is away, or a backlog they need to clear.
 *
 * The reason comes before the switch, because the switch acts the moment it
 * is tapped: read top to bottom, the owner says why and then pauses. While
 * paused the reason stays editable — pausing again only rewrites it.
 */
export function PauseSection({
  vendor,
  onChange,
}: {
  vendor: ApiVendorProfile
  onChange: (vendor: ApiVendorProfile) => void
}) {
  const [reason, setReason] = useState(vendor.bookingsPausedReason ?? '')
  const [busy, setBusy] = useState(false)
  // `!=`, not `!==`: a server older than pausing sends no field at all, and
  // that garage is not paused.
  const paused = vendor.bookingsPausedAt != null
  const savedReason = vendor.bookingsPausedReason ?? ''

  const run = async (
    action: () => Promise<ApiVendorProfile>,
    done: string
  ) => {
    setBusy(true)
    try {
      const updated = await action()
      onChange(updated)
      setReason(updated.bookingsPausedReason ?? '')
      toast.success(done)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const pause = () =>
    run(() => pauseBookings(reason.trim() || undefined), 'New bookings paused')

  const toggle = () =>
    paused ? run(resumeBookings, 'Taking bookings again') : pause()

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Pause new bookings" />
      <ScCard className="flex flex-col gap-3">
        <p className="text-[11px] text-text-secondary">
          Customers can&apos;t book you while this is on. Bookings you already
          have stay as they are.
        </p>
        <ScInput
          id="settings-pause-reason"
          label="Reason (optional, customers see this)"
          placeholder="e.g. Closed for renovation"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-text-primary">Pause new bookings</p>
          {/* Amber when on: a paused garage is a state to notice, not an
              action to take. */}
          <ScSwitch
            label="Pause new bookings"
            tone="warning"
            checked={paused}
            disabled={busy}
            onChange={toggle}
          />
        </div>

        {paused && (
          <>
            <p className="text-[12px] text-text-primary">
              Paused since{' '}
              <span className="font-numeric font-medium">
                {new Date(vendor.bookingsPausedAt as string).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  timeZone: APP_TIMEZONE,
                })}
              </span>
              .
              {savedReason && (
                <span className="text-text-secondary">
                  {' '}
                  Customers see: “{savedReason}”
                </span>
              )}
            </p>
            <div className="flex gap-2">
              {/* Pausing again keeps the original start and only rewrites
                  the reason, so this is safe to press while paused. */}
              <ScButton
                variant="secondary"
                className="flex-1"
                disabled={busy || reason.trim() === savedReason}
                onClick={pause}
              >
                Update reason
              </ScButton>
              <ScButton className="flex-1" disabled={busy} onClick={toggle}>
                {busy ? 'Saving...' : 'Resume bookings'}
              </ScButton>
            </div>
          </>
        )}
      </ScCard>
    </section>
  )
}

/**
 * Single days off on top of the weekly hours. A holiday offers no times to
 * customers; bookings already on that day are left alone and listed, so the
 * owner can call those customers.
 */
export function HolidaysSection({
  closures,
  loadFailed = false,
  onChange,
}: {
  closures: ApiVendorClosure[]
  /** The list could not be read. Adding still works; the list is just unknown. */
  loadFailed?: boolean
  onChange: (closures: ApiVendorClosure[]) => void
}) {
  const today = todayKey()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  // The bookings on the day just added, named so the owner knows whom to call.
  const [onThatDay, setOnThatDay] = useState<{
    date: string
    bookings: Booking[]
  } | null>(null)

  const add = async () => {
    if (!date) return
    setBusy('add')
    try {
      const result = await addClosure({
        date,
        ...(reason.trim() && { reason: reason.trim() }),
      })
      onChange(
        [...closures, result.closure].sort((a, b) => a.date.localeCompare(b.date))
      )
      setOnThatDay(
        result.bookings.length > 0
          ? { date: result.closure.date, bookings: result.bookings }
          : null
      )
      setDate('')
      setReason('')
      toast.success('Holiday added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (closure: ApiVendorClosure) => {
    setBusy(closure.id)
    try {
      await removeClosure(closure.id)
      onChange(closures.filter((c) => c.id !== closure.id))
      if (onThatDay?.date === closure.date) setOnThatDay(null)
      toast.success('Holiday removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Holidays" />
      <ScCard className="flex flex-col gap-3">
        <p className="text-[12px] text-text-secondary">
          Days you&apos;re closed on top of your weekly hours. Customers can&apos;t
          pick them.
        </p>
        <ScInput
          id="settings-holiday-date"
          label="Date"
          type="date"
          min={today}
          max={addDays(today, MAX_DAYS_AHEAD)}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="font-numeric"
        />
        <ScInput
          id="settings-holiday-reason"
          label="Reason (optional)"
          placeholder="e.g. Diwali"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {/* Secondary: while paused, Resume above is this tab's one main
            action, and red is kept for that. */}
        <ScButton variant="secondary" disabled={!date || busy === 'add'} onClick={add}>
          {busy === 'add' ? 'Saving...' : 'Add holiday'}
        </ScButton>

        {onThatDay && (
          <Notice role="status" title={bookingsSentence(onThatDay.bookings.length)}>
            {onThatDay.bookings.map((b) => (
              <span key={b.id} className="block">
                {b.customerName ?? 'Customer'} ·{' '}
                <span className="font-numeric">{b.scheduledAt}</span>
              </span>
            ))}
          </Notice>
        )}

        {loadFailed && (
          <p role="alert" className="text-[12px] text-warning">
            Couldn&apos;t load your holidays. Reload the page to see them.
          </p>
        )}

        {closures.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {closures.map((closure) => (
              <li key={closure.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-numeric text-[13px] font-medium text-text-primary">
                    {formatDay(closure.date)}
                  </p>
                  {closure.reason && (
                    <p className="truncate text-[11px] text-text-secondary">{closure.reason}</p>
                  )}
                  {closure.activeBookingCount > 0 && (
                    <p className="text-[11px] text-warning">
                      <span className="font-numeric">{closure.activeBookingCount}</span>{' '}
                      {closure.activeBookingCount === 1 ? 'booking' : 'bookings'} still on
                      this day
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Remove holiday on ${formatDay(closure.date)}`}
                  disabled={busy === closure.id}
                  onClick={() => remove(closure)}
                  className="min-h-11 px-2 text-[12px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScCard>
    </section>
  )
}
