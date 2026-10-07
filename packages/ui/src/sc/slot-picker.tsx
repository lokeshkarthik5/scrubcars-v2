'use client'

import { useEffect, useMemo, useState } from 'react'
import { useNow } from '@repo/core/hooks/use-now'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { ScSheet } from '@repo/ui/sc/modal'
import {
  useAvailableSlots,
  useVendorClosures,
  useVendorWorkingHours,
} from '@repo/core/api/hooks/use-slots'
import { meetsNotice, noticeSentence } from '@repo/core/booking-types'
import type { BookingType } from '@repo/core/types'
import { APP_TIMEZONE, cn } from '@repo/core/utils'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function buildDateOptions(count = 7) {
  // Anchor "today" to IST so the calendar days match the server's slot dates,
  // regardless of the customer's device timezone. Date-only arithmetic in UTC
  // is safe (no DST) and getUTC* keeps the day-of-week aligned with the server.
  const istToday = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
  const [y, m, d0] = istToday.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, d0 + i))
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return {
      value: `${yyyy}-${mm}-${dd}`,
      dayOfWeek: d.getUTCDay(),
      dayName: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAY_NAMES[d.getUTCDay()],
      date: `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`,
    }
  })
}

// Formats a YYYY-MM-DD value into the same chip labels used above, for a date
// picked from the calendar (which may fall outside the visible week).
function formatDateChip(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return {
    dayName: DAY_NAMES[dt.getUTCDay()],
    date: `${dt.getUTCDate()} ${MONTH_NAMES[dt.getUTCMonth()]}`,
  }
}

// UTC date-only arithmetic on a YYYY-MM-DD key (no DST edge cases).
function addDaysToKey(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Same box as a date chip, so the row doesn't resize when the data lands. */
function DateChipSkeleton() {
  return <span className="h-[62px] w-[52px] shrink-0 rounded-[12px] shimmer" />
}

/** Same box as a time button, in the same three-column grid. */
function TimeGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="h-[42px] rounded-[10px] shimmer" />
      ))}
    </div>
  )
}

interface SlotPickerProps {
  vendorId: string
  /**
   * The services being booked together. Slots are computed for their combined
   * duration, so this is the whole selection, not just the first one.
   */
  serviceIds: string[]
  /** Currently selected slot, as a scheduledAt ISO string. */
  value: string | null
  onChange: (scheduledAt: string | null) => void
  /**
   * At the garage or doorstep: doorstep needs 3 hours' notice, at-garage 2,
   * so the times on offer depend on it.
   */
  bookingType: BookingType
  /**
   * Called when a chosen time is let go because it no longer has enough
   * notice, so the screen can say so rather than silently undo the choice.
   */
  onLapse?: (scheduledAt: string) => void
  /**
   * Reveal the time slots only once a date has been picked, and start with no
   * date selected.
   *
   * Off by default: the reschedule sheet wants the whole picker at once,
   * because the customer already has a booking and is comparing times. The
   * booking flow opts in so a first-time customer is asked one thing at a time.
   */
  progressive?: boolean
  /**
   * The booking being moved, when this picker is the reschedule sheet. Its own
   * time does not count against the garage, so the times around it stay on
   * offer, and the words for a paused garage fit a booking the customer
   * already has rather than a new one.
   */
  rescheduleOf?: string
}

/**
 * Date-and-time slot picker: a week of quick date chips, a themed calendar
 * popup for dates further out, and the available time slots for the chosen
 * date. Emits the selected slot's scheduledAt ISO string via onChange.
 */
export function SlotPicker({
  vendorId,
  serviceIds,
  value,
  onChange,
  bookingType,
  onLapse,
  progressive = false,
  rescheduleOf,
}: SlotPickerProps) {
  // Ticks each minute: a picker left open keeps offering a slot only while it
  // still has enough notice.
  const now = useNow()
  const dateOptions = buildDateOptions()
  const calendarMin = addDaysToKey(dateOptions[dateOptions.length - 1].value, 1)

  const [selectedDate, setSelectedDate] = useState<string | null>(
    progressive ? null : dateOptions[0].value
  )
  const [customDate, setCustomDate] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [calMonth, setCalMonth] = useState(() => {
    const [y, m] = calendarMin.split('-').map(Number)
    return { year: y, month: m - 1 }
  })
  const workingHours = useVendorWorkingHours(vendorId)
  const closures = useVendorClosures(vendorId)
  const slotsQuery = useAvailableSlots({
    vendorId,
    serviceIds,
    date: selectedDate,
    bookingType,
    rescheduleOf,
  })

  const closedDays = useMemo(
    () =>
      new Set(
        (workingHours.data ?? [])
          .filter((h) => h.isClosed)
          .map((h) => h.dayOfWeek)
      ),
    [workingHours.data]
  )
  // The garage's holidays, greyed out exactly like its weekly off days. A
  // failed fetch leaves none greyed: the slot list for that day still says
  // it is closed, so the worst case is one extra tap.
  const holidays = useMemo(() => new Set(closures.data ?? []), [closures.data])
  const isDayClosed = (date: string, dayOfWeek: number) =>
    closedDays.has(dayOfWeek) || holidays.has(date)

  // The server already leaves out times without enough notice; filtering
  // again here drops the ones that run out while the picker sits open.
  const slots = (slotsQuery.data?.slots ?? []).filter((slot) =>
    meetsNotice(slot.time, bookingType, now)
  )
  const isClosedDay = slotsQuery.data?.isClosed ?? false
  const isHoliday = slotsQuery.data?.closedReason === 'holiday'
  const isPaused = slotsQuery.data?.paused ?? false
  // Every time with enough notice is taken. Only said when that is the whole
  // story: an evening emptied by the notice rule reads differently.
  const allBooked = slotsQuery.data?.allBooked ?? false

  // A chosen time that no longer has enough notice — the clock moved on, or
  // the customer switched to doorstep, which needs more — is let go rather
  // than carried into a checkout the server would refuse.
  useEffect(() => {
    if (value && !meetsNotice(value, bookingType, now)) {
      onChange(null)
      onLapse?.(value)
    }
  }, [value, bookingType, now, onChange, onLapse])

  // An open day whose *whole* schedule offers nothing means the combined
  // duration does not fit between opening and closing — not that the day
  // filled up, and telling the customer to try again later would send them
  // round a loop that cannot end. `fitsInDay` is checked before past and
  // booked-up times are filtered, so neither trips it.
  const tooLongForTheDay =
    !isClosedDay && !isPaused && slotsQuery.isSuccess && !slotsQuery.data.fitsInDay

  // Until the answer is in, say nothing. Rendering the empty state off an
  // empty-by-default array is what made the picker flash "No slots available"
  // before every fetch — a false negative the customer sees more often than
  // the real one. A disabled query (no service yet) counts as loading too.
  const slotsLoading = serviceIds.length === 0 || slotsQuery.isPending

  const selectDate = (date: string) => {
    setSelectedDate(date)
    onChange(null)
  }

  return (
    <div>
      <h2 className="mb-3 text-[15px] font-semibold text-text-primary">Select Date</h2>
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Held back until the closed days are known: rendering the chips
            first means days pop from selectable to disabled under the
            customer's thumb. */}
        {workingHours.isPending || closures.isPending
          ? dateOptions.map((d) => <DateChipSkeleton key={d.value} />)
          : dateOptions.map((d) => {
          const closed = isDayClosed(d.value, d.dayOfWeek)
          return (
            <button
              key={d.value}
              type="button"
              // Selection is otherwise expressed only through background
              // classes, which leaves it invisible to assistive tech and to
              // anything asserting on state.
              aria-pressed={selectedDate === d.value}
              disabled={closed}
              onClick={() => selectDate(d.value)}
              className={cn(
                'flex h-[62px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[12px] transition-colors',
                closed
                  ? 'cursor-not-allowed bg-surface text-text-muted opacity-50'
                  : selectedDate === d.value
                    ? 'bg-brand-white text-brand-black'
                    : 'bg-surface text-text-primary'
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-medium uppercase',
                  selectedDate === d.value && !closed ? 'text-brand-black/60' : 'text-text-secondary'
                )}
              >
                {d.dayName}
              </span>
              {/* Dates and times are figures, so they take the brand's
                  numeric face; the day names around them stay Inter. */}
              <span className="font-numeric text-[16px] font-bold">{d.date.split(' ')[0]}</span>
            </button>
              )
            })}

        {customDate && (
          <button
            type="button"
            aria-pressed={selectedDate === customDate}
            onClick={() => selectDate(customDate)}
            className={cn(
              'flex h-[62px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[12px] transition-colors',
              selectedDate === customDate
                ? 'bg-brand-white text-brand-black'
                : 'bg-surface text-text-primary'
            )}
          >
            <span
              className={cn(
                'text-[10px] font-medium uppercase',
                selectedDate === customDate ? 'text-brand-black/60' : 'text-text-secondary'
              )}
            >
              {formatDateChip(customDate).dayName}
            </span>
            <span className="font-numeric text-[16px] font-bold">
              {formatDateChip(customDate).date.split(' ')[0]}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            const anchor = customDate ?? calendarMin
            const [y, m] = anchor.split('-').map(Number)
            setCalMonth({ year: y, month: m - 1 })
            setShowCalendar(true)
          }}
          className="flex h-[62px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[12px] bg-surface text-text-secondary transition-colors hover:text-text-primary"
          title="Pick another date"
        >
          <IconCalendar size={19} stroke={1.5} />
          <span className="text-[9px] font-medium">More</span>
        </button>
      </div>

      {selectedDate && (
        <>
          <h2 className="text-[15px] font-semibold text-text-primary">Select Time</h2>
          <p className="mb-3 mt-0.5 text-[12px] text-text-secondary">{noticeSentence(bookingType)}</p>
          {slotsLoading ? (
            <TimeGridSkeleton />
          ) : slots.length === 0 ? (
            <p className="text-[12px] text-text-secondary">
              {isPaused
                ? rescheduleOf
                  ? "This garage isn't taking changes right now. Your booking stays at its current time, or you can cancel it."
                  : "This garage isn't taking new bookings right now."
                : isHoliday
                  ? 'The garage is closed for a holiday on this day. Pick another day.'
                  : isClosedDay
                    ? 'Vendor is closed on this day.'
                    : tooLongForTheDay
                      ? "These services need more time than this garage's day allows. Remove one, or pick another day."
                      : allBooked
                        ? 'All times on this day are booked. Pick another day.'
                        : `No times left on this day. ${noticeSentence(bookingType)} Pick another day.`}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  aria-pressed={value === slot.time}
                  onClick={() => onChange(slot.time)}
                  className={cn(
                    'rounded-[10px] py-3 font-numeric text-[13px] font-medium transition-colors',
                    value === slot.time
                      ? 'bg-brand-white font-bold text-brand-black'
                      : 'bg-surface text-text-primary'
                  )}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* A sheet, like every other overlay in the app. It also inherits the
          things this hand-rolled dialog never had: Escape to dismiss, a scroll
          lock on the page behind, and enter/exit animations. */}
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
            className="rounded-lg p-1 text-text-secondary hover:text-text-primary"
            aria-label="Previous month"
          >
            <IconChevronLeft size={20} />
          </button>
          <span className="text-sm font-semibold text-text-primary">
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
            className="rounded-lg p-1 text-text-secondary hover:text-text-primary"
            aria-label="Next month"
          >
            <IconChevronRight size={20} />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center">
          {DAY_NAMES.map((d) => (
            <span key={d} className="text-[10px] font-medium text-text-muted">
              {d[0]}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({
            length: new Date(Date.UTC(calMonth.year, calMonth.month, 1)).getUTCDay(),
          }).map((_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({
            length: new Date(Date.UTC(calMonth.year, calMonth.month + 1, 0)).getUTCDate(),
          }).map((_, i) => {
            const day = i + 1
            const key = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayOfWeek = new Date(Date.UTC(calMonth.year, calMonth.month, day)).getUTCDay()
            const disabled = key < calendarMin || isDayClosed(key, dayOfWeek)
            const selected = key === customDate
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
                  'flex h-9 items-center justify-center rounded-lg font-numeric text-[13px] font-medium transition-colors',
                  disabled
                    ? 'cursor-not-allowed text-text-muted opacity-30'
                    : selected
                      ? 'bg-brand-white font-bold text-brand-black'
                      : 'text-text-primary hover:bg-surface'
                )}
              >
                {day}
              </button>
            )
      })}
    </div>
      </ScSheet>
    </div>
  )
}
