'use client'

import { useEffect, useState } from 'react'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { getAvailableSlots } from '@/lib/api/bookings'
import { getVendorWorkingHours } from '@/lib/api/vendors'
import { APP_TIMEZONE, cn } from '@/lib/utils'

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

interface SlotPickerProps {
  vendorId: string
  serviceId: string | null
  /** Currently selected slot, as a scheduledAt ISO string. */
  value: string | null
  onChange: (scheduledAt: string | null) => void
}

/**
 * Date-and-time slot picker: a week of quick date chips, a themed calendar
 * popup for dates further out, and the available time slots for the chosen
 * date. Emits the selected slot's scheduledAt ISO string via onChange.
 */
export function SlotPicker({ vendorId, serviceId, value, onChange }: SlotPickerProps) {
  const dateOptions = buildDateOptions()
  const calendarMin = addDaysToKey(dateOptions[dateOptions.length - 1].value, 1)

  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value)
  const [customDate, setCustomDate] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [calMonth, setCalMonth] = useState(() => {
    const [y, m] = calendarMin.split('-').map(Number)
    return { year: y, month: m - 1 }
  })
  const [slots, setSlots] = useState<Array<{ time: string; label: string; available: boolean }>>([])
  const [isClosedDay, setIsClosedDay] = useState(false)
  const [closedDays, setClosedDays] = useState<Set<number>>(new Set())

  useEffect(() => {
    getVendorWorkingHours(vendorId)
      .then((hours) =>
        setClosedDays(new Set(hours.filter((h) => h.isClosed).map((h) => h.dayOfWeek)))
      )
      .catch(() => setClosedDays(new Set()))
  }, [vendorId])

  useEffect(() => {
    if (!serviceId) return
    getAvailableSlots({ vendorId, serviceId, date: selectedDate }).then(
      ({ isClosed, slots }) => {
        setSlots(slots)
        setIsClosedDay(isClosed)
      }
    )
  }, [vendorId, serviceId, selectedDate])

  const selectDate = (date: string) => {
    setSelectedDate(date)
    onChange(null)
  }

  return (
    <div>
      <h2 className="mb-3 text-[15px] font-semibold text-text-primary">Select Date</h2>
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {dateOptions.map((d) => {
          const closed = closedDays.has(d.dayOfWeek)
          return (
            <button
              key={d.value}
              type="button"
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

      <h2 className="mb-3 text-[15px] font-semibold text-text-primary">Select Time</h2>
      {slots.length === 0 ? (
        <p className="text-[12px] text-text-secondary">
          {isClosedDay ? 'Vendor is closed on this day.' : 'No slots available on this date.'}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((slot) => (
            <button
              key={slot.time}
              type="button"
              disabled={!slot.available}
              onClick={() => onChange(slot.time)}
              className={cn(
                'rounded-[10px] py-3 text-[13px] font-medium transition-colors',
                !slot.available
                  ? 'cursor-not-allowed bg-surface text-text-muted opacity-50'
                  : value === slot.time
                    ? 'bg-brand-white font-semibold text-brand-black'
                    : 'bg-surface text-text-primary'
              )}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}

      {showCalendar && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6"
          onClick={() => setShowCalendar(false)}
        >
          <div
            className="w-full max-w-[340px] rounded-[20px] border border-border bg-brand-black p-4"
            onClick={(e) => e.stopPropagation()}
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
          </div>
        </div>
      )}
    </div>
  )
}
