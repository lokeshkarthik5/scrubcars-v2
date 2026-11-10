'use client'

import { useCallback, useMemo, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { ScSegmented } from '@repo/ui/sc/segmented'
import type { Booking } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { JobRow } from '@/components/job-row'
import { CalendarDay } from '@/components/calendar-day'
import { ClosedCard, Dot, HATCH } from '@/components/calendar-parts'
import {
  CALENDAR_VIEW_KEY,
  GRID_WEEKDAYS,
  calendarJobs,
  calendarViewFrom,
  closedDay,
  dayButtonLabel,
  dayDots,
  dayHeading,
  dayHours,
  dayOfMonth,
  daySubtitle,
  daySummary,
  firstOfMonth,
  istDateKey,
  jobsCount,
  monthBounds,
  monthGrid,
  monthOf,
  monthTitle,
  shiftMonth,
  weekOf,
  type CalendarView,
} from '@/lib/calendar'
import { useGarageCalendar } from '@/lib/use-garage-calendar'

const VIEW_LABELS: Record<CalendarView, string> = { month: 'Month', day: 'Day' }

function rememberedView(): CalendarView {
  try {
    return calendarViewFrom(window.localStorage.getItem(CALENDAR_VIEW_KEY))
  } catch {
    return 'month'
  }
}

function rememberView(view: CalendarView) {
  try {
    window.localStorage.setItem(CALENDAR_VIEW_KEY, view)
  } catch {
    // Private mode or blocked storage: it opens on Month next time.
  }
}

/**
 * Bookings › Calendar (owner, 10 Nov 2026; mockups garage-calendar A and B):
 * Month, a grid of dots per day with the chosen day's jobs under it, and
 * Day, the week strip over a timeline of the day's opening hours. The jobs
 * are the list's own (the one poller); the hours, bays and time off come
 * from the garage's settings. Every job opens its page, as a list row does.
 * The last Month / Day choice is kept on this device.
 */
export function BookingsCalendar({
  bookings,
  now,
}: {
  bookings: readonly Booking[]
  now: number
}) {
  const today = istDateKey(now)
  const [view, setView] = useState<CalendarView>(rememberedView)
  const [selected, setSelected] = useState(today)
  const [month, setMonth] = useState(() => monthOf(today))

  const jobsByDay = useMemo(() => calendarJobs(bookings, now), [bookings, now])
  const bounds = useMemo(
    () => monthBounds(jobsByDay.keys(), today),
    [jobsByDay, today]
  )
  const grid = useMemo(() => monthGrid(month), [month])
  // Time off from the grid's first day on: every day either view can show
  // for this month (the Day view keeps `month` on its day's month).
  const { hours, closures, room } = useGarageCalendar(grid[0])

  const pickView = useCallback((next: CalendarView) => {
    setView(next)
    rememberView(next)
  }, [])

  const pickDay = useCallback((day: string) => {
    setSelected(day)
    setMonth(monthOf(day))
  }, [])

  const moveMonth = (by: number) => {
    const next = shiftMonth(month, by)
    setMonth(next)
    // Today when it is in that month, else the month's first day.
    setSelected(monthOf(today) === next ? today : firstOfMonth(next))
  }

  const jobs = jobsByDay.get(selected) ?? []
  const closed = closedDay(selected, hours, closures)

  const viewSwitch = (
    <ScSegmented
      aria-label="Calendar view"
      value={view}
      onChange={pickView}
      className="shrink-0 [&_[role=radio]]:min-h-11 [&_[role=radio]]:px-3 [&_[role=radio]]:py-0 [&_[role=radio]]:text-[14px]"
      options={(['month', 'day'] as const).map((key) => ({
        value: key,
        label: VIEW_LABELS[key],
      }))}
    />
  )

  return (
    <section aria-label="Calendar" className="flex flex-col gap-3.5">
      {view === 'month' ? (
        <div className="flex items-center justify-between gap-2">
          {/* One line on a 360px phone with the switch beside it: the
              arrows are 36 wide (44 tall) and the month never wraps. */}
          <div className="flex min-w-0 items-center">
            <button
              type="button"
              aria-label="Previous month"
              disabled={month <= bounds.first}
              onClick={() => moveMonth(-1)}
              className="flex h-11 w-9 shrink-0 items-center justify-center text-text-secondary disabled:opacity-30"
            >
              <IconChevronLeft size={20} aria-hidden="true" />
            </button>
            <h2
              aria-live="polite"
              className="whitespace-nowrap text-center text-[17px] font-semibold text-text-primary"
            >
              {monthTitle(month)}
            </h2>
            <button
              type="button"
              aria-label="Next month"
              disabled={month >= bounds.last}
              onClick={() => moveMonth(1)}
              className="flex h-11 w-9 shrink-0 items-center justify-center text-text-secondary disabled:opacity-30"
            >
              <IconChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
          {viewSwitch}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5 pl-1">
            <h2 className="text-[18px] font-semibold text-text-primary">
              {dayHeading(selected, today)}
            </h2>
            <p className="text-[13px] text-text-secondary">
              {daySubtitle(jobs.length, dayHours(selected, hours), closed)}
            </p>
          </div>
          {viewSwitch}
        </div>
      )}

      {view === 'month' ? (
        <>
          <MonthGrid
            month={month}
            grid={grid}
            today={today}
            selected={selected}
            bounds={bounds}
            onPick={pickDay}
            summaryOf={(day) => daySummary(jobsByDay.get(day))}
            closedOn={(day) => closedDay(day, hours, closures) !== null}
          />
          <Legend />

          <div className="flex items-baseline justify-between px-0.5 pt-1">
            <h3 className="text-[17px] font-semibold text-text-primary">
              {dayHeading(selected, today)}
            </h3>
            {jobs.length > 0 && (
              <span className="font-numeric text-[14px] text-text-secondary">
                {jobsCount(jobs.length)}
              </span>
            )}
          </div>
          {closed && <ClosedCard closed={closed} />}
          {jobs.length === 0 && !closed && (
            <p className="rounded-[20px] border border-dashed border-border px-4 py-[18px] text-center text-[14px] text-text-secondary">
              {selected < today
                ? 'Nothing booked on this day.'
                : 'Nothing booked on this day yet.'}
            </p>
          )}
          {jobs.map((job) => (
            <JobRow key={job.booking.id} booking={job.booking} now={now} />
          ))}
        </>
      ) : (
        <CalendarDay
          day={selected}
          today={today}
          now={now}
          week={weekOf(selected)}
          bookings={bookings}
          jobsByDay={jobsByDay}
          hours={hours}
          closures={closures}
          room={room}
          onPick={pickDay}
        />
      )}
    </section>
  )
}

function MonthGrid({
  month,
  grid,
  today,
  selected,
  bounds,
  onPick,
  summaryOf,
  closedOn,
}: {
  month: string
  grid: string[]
  today: string
  selected: string
  bounds: { first: string; last: string }
  onPick: (day: string) => void
  summaryOf: (day: string) => ReturnType<typeof daySummary>
  closedOn: (day: string) => boolean
}) {
  return (
    <div className="rounded-[20px] border border-border bg-linear-to-b from-card-top to-card-bot px-2 pb-2 pt-2.5">
      <div aria-hidden="true" className="mb-1 grid grid-cols-7">
        {GRID_WEEKDAYS.map((w) => (
          <span
            key={w}
            className="py-1 text-center text-[12px] font-medium text-text-muted"
          >
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-x-0.5 gap-y-1">
        {grid.map((day) => {
          const inMonth = monthOf(day) === month
          const reachable =
            monthOf(day) >= bounds.first && monthOf(day) <= bounds.last
          const summary = summaryOf(day)
          const closed = closedOn(day)
          const isToday = day === today
          const isSelected = day === selected
          return (
            <button
              key={day}
              type="button"
              aria-label={dayButtonLabel(day, { today, summary, closed })}
              aria-pressed={isSelected}
              disabled={!reachable}
              onClick={() => onPick(day)}
              style={closed && !isSelected ? HATCH : undefined}
              className={cn(
                'flex h-12 min-w-0 flex-col items-center justify-center gap-[5px] rounded-[12px] border',
                isSelected
                  ? 'border-white/20 bg-surface-elevated'
                  : isToday
                    ? 'border-brand-red'
                    : 'border-transparent'
              )}
            >
              <span
                className={cn(
                  'font-numeric text-[15px]',
                  isToday || isSelected ? 'font-bold' : 'font-medium',
                  !inMonth
                    ? 'text-text-muted/40'
                    : closed
                      ? 'text-dim'
                      : isToday
                        ? 'text-tone-new-text'
                        : 'text-text-primary'
                )}
              >
                {dayOfMonth(day)}
              </span>
              <span className="flex h-1.5 items-center gap-[3px]">
                {inMonth &&
                  dayDots(summary).map((kind) => (
                    <Dot key={kind} kind={kind} />
                  ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** What the dots and the hatching mean, under the grid. */
function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 px-1 text-[12px] text-text-secondary">
      <li className="flex items-center gap-1.5">
        <Dot kind="answer" className="size-[7px]" />
        To answer
      </li>
      <li className="flex items-center gap-1.5">
        <Dot kind="accepted" className="size-[7px]" />
        Accepted
      </li>
      <li className="flex items-center gap-1.5">
        <Dot kind="done" className="size-[7px]" />
        Done
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-[9px] w-3 rounded-[3px] border border-border"
          style={HATCH}
        />
        Closed
      </li>
    </ul>
  )
}
