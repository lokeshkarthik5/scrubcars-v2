'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react'
import { ScSheet } from '@repo/ui/sc/modal'
import type { SlotDayState } from '@/lib/when-picker'
import {
  useAvailableSlots,
  useVendorClosures,
  useVendorWorkingHours,
} from '@repo/core/api/hooks/use-slots'
import {
  BOOKING_DAYS_AHEAD,
  meetsNotice,
  noticeSentence,
} from '@repo/core/booking-types'
import { useNow } from '@repo/core/hooks/use-now'
import type { BookingType } from '@repo/core/types'
import { APP_TIMEZONE, cn } from '@repo/core/utils'
import { formatClock } from '@repo/core/format'
import {
  addDaysToKey,
  dateChipOf,
  firstOpenDayAfter,
  splitByMorning,
  weekOf,
} from '@/lib/when-picker'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** How many days ahead the picker looks for the first one with a time free. */
const AUTO_PICK_DAYS = BOOKING_DAYS_AHEAD

interface WhenPickerProps {
  vendorId: string
  /** Every service being booked: the times fit their combined duration. */
  serviceIds: string[]
  /** The chosen start, as an ISO string. */
  value: string | null
  onChange: (scheduledAt: string | null) => void
  bookingType: BookingType
  /** A chosen time ran out of notice and was let go. */
  onLapse?: (scheduledAt: string) => void
  /**
   * Open on the earliest day that still has a time free (checkout, F1), so
   * times show from the first second. Off for the reschedule sheet, which
   * opens on today like before.
   */
  autoPick?: boolean
  /** The booking being moved, for the reschedule sheet. */
  rescheduleOf?: string
  /** A day to open on (YYYY-MM-DD) from a link, e.g. a slot alert. */
  initialDate?: string | null
  /** The heading over the dates. */
  title?: string
  /** Drawn under the times once the chosen day's answer is in. */
  renderDayExtra?: (state: SlotDayState) => ReactNode
}

/**
 * The customer app's date-and-time picker: a week of day chips, a calendar
 * for later days, and the day's times as "9:00 am", morning first with the
 * rest one tap away. Checkout opens it on the first day with a free time.
 */
export function WhenPicker({
  vendorId,
  serviceIds,
  value,
  onChange,
  bookingType,
  onLapse,
  autoPick = false,
  rescheduleOf,
  initialDate = null,
  title = 'When?',
  renderDayExtra,
}: WhenPickerProps) {
  const now = useNow()
  const today = new Date(now).toLocaleDateString('en-CA', {
    timeZone: APP_TIMEZONE,
  })
  const week = weekOf(today, BOOKING_DAYS_AHEAD)
  const calendarMin = addDaysToKey(week[week.length - 1].value, 1)

  const linkedDate =
    initialDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(initialDate) &&
    initialDate >= today
      ? initialDate
      : null
  // The day the customer chose (or a link chose); until then, the day the
  // picker settled on by itself.
  const [chosenDate, setChosenDate] = useState<string | null>(
    linkedDate ?? (autoPick ? null : today)
  )
  const [autoDate, setAutoDate] = useState<string | null>(null)
  const [autoTries, setAutoTries] = useState(0)
  const [customDate, setCustomDate] = useState<string | null>(
    linkedDate && linkedDate >= calendarMin ? linkedDate : null
  )
  const [showLater, setShowLater] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [calMonth, setCalMonth] = useState(() => {
    const [y, m] = calendarMin.split('-').map(Number)
    return { year: y, month: m - 1 }
  })

  const workingHours = useVendorWorkingHours(vendorId)
  const closures = useVendorClosures(vendorId)
  const closedDays = useMemo(
    () =>
      new Set(
        (workingHours.data ?? [])
          .filter((h) => h.isClosed)
          .map((h) => h.dayOfWeek)
      ),
    [workingHours.data]
  )
  const holidays = useMemo(() => new Set(closures.data ?? []), [closures.data])
  const isDayClosed = (date: string) =>
    closedDays.has(dateChipOf(date).dayOfWeek) || holidays.has(date)
  const daysKnown = !workingHours.isPending && !closures.isPending

  // The first open day, once the closed ones are known. Settled during
  // render (React's "adjust state when props change"), not in an effect.
  if (autoPick && !chosenDate && autoDate === null && daysKnown) {
    const first = firstOpenDayAfter(today, -1, isDayClosed, AUTO_PICK_DAYS)
    if (first) setAutoDate(first)
  }

  const selectedDate = chosenDate ?? autoDate

  const slotsQuery = useAvailableSlots({
    vendorId,
    serviceIds,
    date: selectedDate,
    bookingType,
    rescheduleOf,
  })
  const slots = (slotsQuery.data?.slots ?? []).filter((slot) =>
    meetsNotice(slot.time, bookingType, now)
  )
  const isClosedDay = slotsQuery.data?.isClosed ?? false
  const isHoliday = slotsQuery.data?.closedReason === 'holiday'
  const isPaused = slotsQuery.data?.paused ?? false
  const allBooked = slotsQuery.data?.allBooked ?? false
  const tooLongForTheDay =
    !isClosedDay &&
    !isPaused &&
    slotsQuery.isSuccess &&
    !slotsQuery.data.fitsInDay
  const slotsLoading =
    serviceIds.length === 0 || (Boolean(selectedDate) && slotsQuery.isPending)

  // A day the picker chose itself with nothing left on it: move on to the
  // next open one, a week at most. Never once the customer has chosen, and
  // never for a paused garage or a job too long for any day.
  if (
    !chosenDate &&
    autoDate &&
    slotsQuery.isSuccess &&
    slots.length === 0 &&
    !isPaused &&
    !tooLongForTheDay &&
    autoTries < AUTO_PICK_DAYS
  ) {
    const next = firstOpenDayAfter(autoDate, 0, isDayClosed, AUTO_PICK_DAYS)
    if (next && next <= week[week.length - 1].value) {
      setAutoDate(next)
      setAutoTries(autoTries + 1)
    }
  }

  // A chosen time that no longer has enough notice is let go.
  useEffect(() => {
    if (value && !meetsNotice(value, bookingType, now)) {
      onChange(null)
      onLapse?.(value)
    }
  }, [value, bookingType, now, onChange, onLapse])

  const selectDate = (date: string) => {
    setChosenDate(date)
    setShowLater(false)
    onChange(null)
  }

  const { morning, later } = splitByMorning(slots.map((slot) => slot.time))
  // Morning first, with the rest a tap away; everything when the morning is
  // empty, or the chosen time is later in the day.
  const collapse =
    morning.length > 0 &&
    later.length > 0 &&
    !showLater &&
    !(value && later.includes(value))
  const shown = collapse ? morning : slots.map((slot) => slot.time)

  const chip = (
    date: string,
    label: string,
    sub: string,
    accessible: string
  ) => {
    const closed = isDayClosed(date)
    const on = selectedDate === date
    return (
      <button
        key={date}
        type="button"
        aria-pressed={on}
        aria-label={accessible}
        disabled={closed}
        onClick={() => selectDate(date)}
        className={cn(
          'press flex min-h-[60px] min-w-[54px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] border transition-colors',
          closed
            ? 'cursor-not-allowed border-transparent bg-white/[0.02] text-text-muted opacity-50'
            : on
              ? 'border-transparent bg-[#F5F5F6] text-brand-black'
              : 'border-line bg-white/[0.03] text-text-primary'
        )}
      >
        <span
          className={cn(
            'text-[12px]',
            on && !closed ? 'text-brand-black/60' : 'text-dim'
          )}
        >
          {label}
        </span>
        <span className="font-numeric text-[17px] font-medium">{sub}</span>
      </button>
    )
  }

  return (
    <div>
      <h2 className="mb-3 text-[17px] font-medium tracking-[-0.01em] text-text-primary">
        {title}
      </h2>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!daysKnown
          ? week.map((d) => (
              <span
                key={d.value}
                className="h-[60px] w-[54px] shrink-0 rounded-[16px] shimmer"
              />
            ))
          : week.map((d, i) =>
              chip(
                d.value,
                i === 0 ? 'Today' : d.dayName,
                String(d.day),
                `${i === 0 ? 'Today, ' : ''}${d.dayName} ${d.day} ${d.monthName}${i === 1 ? ', tomorrow' : ''}`
              )
            )}
        {customDate &&
          chip(
            customDate,
            dateChipOf(customDate).dayName,
            String(dateChipOf(customDate).day),
            `${dateChipOf(customDate).dayName} ${dateChipOf(customDate).day} ${dateChipOf(customDate).monthName}`
          )}
        <button
          type="button"
          onClick={() => {
            const [y, m] = (customDate ?? calendarMin).split('-').map(Number)
            setCalMonth({ year: y, month: m - 1 })
            setShowCalendar(true)
          }}
          aria-label="Pick a later date"
          className="press flex min-h-[60px] min-w-[54px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] border border-line bg-white/[0.03] text-dim"
        >
          <span className="text-[12px]">More</span>
          <IconCalendar size={18} stroke={1.5} aria-hidden />
        </button>
      </div>

      {selectedDate && (
        <>
          <p className="mb-3 text-[13px] text-dim">
            {autoPick ? 'Earliest first. ' : ''}
            {noticeSentence(bookingType).replace(' at least', '')}
          </p>
          {slotsLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="h-12 rounded-[14px] shimmer" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              {isPaused
                ? rescheduleOf
                  ? "This garage isn't taking changes right now. Your booking stays at its current time, or you can cancel it."
                  : "This garage isn't taking new bookings right now."
                : isHoliday
                  ? 'The garage is closed for a holiday on this day. Pick another day.'
                  : isClosedDay
                    ? 'The garage is closed on this day. Pick another day.'
                    : tooLongForTheDay
                      ? "These services need more time than this garage's day allows. Remove one, or pick another day."
                      : allBooked
                        ? 'All times on this day are booked. Pick another day.'
                        : `No times left on this day. ${noticeSentence(bookingType)} Pick another day.`}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {shown.map((time) => (
                  <button
                    key={time}
                    type="button"
                    aria-pressed={value === time}
                    onClick={() => onChange(time)}
                    className={cn(
                      'press min-h-12 rounded-[14px] border font-numeric text-[15px] transition-colors',
                      value === time
                        ? 'border-transparent bg-[#F5F5F6] font-medium text-brand-black'
                        : 'border-line bg-white/[0.03] text-text-primary'
                    )}
                  >
                    {formatClock(time)}
                  </button>
                ))}
              </div>
              {collapse && (
                <button
                  type="button"
                  onClick={() => setShowLater(true)}
                  className="mx-auto mt-1 flex min-h-11 items-center gap-1 px-3 text-[13px] text-text-primary"
                >
                  Show afternoon and evening
                  <IconChevronDown size={15} stroke={1.5} aria-hidden />
                </button>
              )}
            </>
          )}
          {!slotsLoading &&
            slotsQuery.isSuccess &&
            renderDayExtra?.({
              date: selectedDate,
              slots: slots.map((slot) => slot.time),
              allBooked,
              unavailable: isPaused || isClosedDay || tooLongForTheDay,
            })}
        </>
      )}

      <ScSheet
        open={showCalendar}
        onClose={() => setShowCalendar(false)}
        aria-label="Pick a date"
        className="px-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setCalMonth((c) =>
                c.month === 0
                  ? { year: c.year - 1, month: 11 }
                  : { year: c.year, month: c.month - 1 }
              )
            }
            className="-ml-3 flex size-11 items-center justify-center rounded-lg text-text-secondary hover:text-text-primary"
            aria-label="Previous month"
          >
            <IconChevronLeft size={20} aria-hidden="true" />
          </button>
          <span
            aria-live="polite"
            className="text-[15px] font-medium text-text-primary"
          >
            {MONTH_NAMES[calMonth.month]} {calMonth.year}
          </span>
          <button
            type="button"
            onClick={() =>
              setCalMonth((c) =>
                c.month === 11
                  ? { year: c.year + 1, month: 0 }
                  : { year: c.year, month: c.month + 1 }
              )
            }
            className="-mr-3 flex size-11 items-center justify-center rounded-lg text-text-secondary hover:text-text-primary"
            aria-label="Next month"
          >
            <IconChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        <div aria-hidden="true" className="mb-1 grid grid-cols-7 text-center">
          {DAY_NAMES.map((d) => (
            <span key={d} className="text-[12px] text-text-muted">
              {d[0]}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({
            length: new Date(
              Date.UTC(calMonth.year, calMonth.month, 1)
            ).getUTCDay(),
          }).map((_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({
            length: new Date(
              Date.UTC(calMonth.year, calMonth.month + 1, 0)
            ).getUTCDate(),
          }).map((_, i) => {
            const key = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
            const disabled = key < calendarMin || isDayClosed(key)
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selectedDate === key}
                disabled={disabled}
                onClick={() => {
                  setCustomDate(key)
                  selectDate(key)
                  setShowCalendar(false)
                }}
                className={cn(
                  'flex h-11 items-center justify-center rounded-full font-numeric text-[15px] transition-colors',
                  disabled
                    ? 'cursor-not-allowed text-text-muted opacity-30'
                    : key === customDate
                      ? 'bg-[#F5F5F6] font-medium text-brand-black'
                      : 'text-text-primary hover:bg-surface'
                )}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </ScSheet>
    </div>
  )
}
