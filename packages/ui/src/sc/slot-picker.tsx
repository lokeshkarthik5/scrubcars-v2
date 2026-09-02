'use client'

import { useMemo, useState } from 'react'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { ScSheet } from '@repo/ui/sc/modal'
import {
  useAvailableSlots,
  useVendorWorkingHours,
} from '@repo/core/api/hooks/use-slots'
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
   * Reveal the time slots only once a date has been picked, and start with no
   * date selected.
   *
   * Off by default: the reschedule sheet wants the whole picker at once,
   * because the customer already has a booking and is comparing times. The
   * booking flow opts in so a first-time customer is asked one thing at a time.
   */
  progressive?: boolean
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
  progressive = false,
}: SlotPickerProps) {
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
  const slotsQuery = useAvailableSlots({ vendorId, serviceIds, date: selectedDate })

  const closedDays = useMemo(
    () =>
      new Set(
        (workingHours.data ?? [])
          .filter((h) => h.isClosed)
          .map((h) => h.dayOfWeek)
      ),
    [workingHours.data]
  )

  const slots = slotsQuery.data?.slots ?? []
  const isClosedDay = slotsQuery.data?.isClosed ?? false

  // An open day whose *whole* schedule offers nothing means the combined
  // duration does not fit between opening and closing — not that the day
  // filled up. Capacity is unlimited, so "no slots left" is never the reason,
  // and telling the customer to try again later would send them round a loop
  // that cannot end. `fitsInDay` is checked before past times are filtered,
  // so an evening with nothing left today does not trip it.
  const tooLongForTheDay =
    !isClosedDay && slotsQuery.isSuccess && !slotsQuery.data.fitsInDay

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
        {workingHours.isPending
          ? dateOptions.map((d) => <DateChipSkeleton key={d.value} />)
          : dateOptions.map((d) => {
          const closed = closedDays.has(d.dayOfWeek)
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
              <span className="text-[16px] font-semibold">{d.date.split(' ')[0]}</span>
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
            <span className="text-[16px] font-semibold">
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
          className="flex h-[62px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[12px] bg-surface text-text-secondary transition-colors hover:text-brand-red"
          title="Pick another date"
        >
          <IconCalendar size={19} stroke={1.5} />
          <span className="text-[9px] font-medium">More</span>
        </button>
      </div>

      {selectedDate && (
        <>
          <h2 className="mb-3 text-[15px] font-semibold text-text-primary">
            Select Time
          </h2>
          {slotsLoading ? (
            <TimeGridSkeleton />
          ) : slots.length === 0 ? (
            <p className="text-[12px] text-text-secondary">
              {isClosedDay
                ? 'Vendor is closed on this day.'
                : tooLongForTheDay
                  ? "These services need more time than this garage's day allows. Remove one, or pick another day."
                  : 'No slots available on this date.'}
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
                    'rounded-[10px] py-3 text-[13px] font-medium transition-colors',
                    value === slot.time
                      ? 'bg-brand-white font-semibold text-brand-black'
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
            className="rounded-lg p-1 text-text-secondary hover:text-brand-red"
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
            className="rounded-lg p-1 text-text-secondary hover:text-brand-red"
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
            const disabled = key < calendarMin
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
                  'flex h-9 items-center justify-center rounded-lg text-[13px] transition-colors',
                  disabled
                    ? 'cursor-not-allowed text-text-muted opacity-30'
                    : selected
                      ? 'bg-brand-red font-semibold text-brand-white'
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
