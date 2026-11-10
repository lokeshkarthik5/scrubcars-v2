'use client'

import Link from 'next/link'
import type { OpeningDay } from '@repo/core/opening-hours'
import type { Booking } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { ClosedCard, Dot, HATCH } from '@/components/calendar-parts'
import {
  HOUR_PX,
  KIND_LABELS,
  answerLine,
  blockLabel,
  closedDay,
  dayButtonLabel,
  dayHours,
  dayOfMonth,
  daySummary,
  freeGaps,
  hourLabel,
  minuteClock,
  nextQuarter,
  nowMinute,
  packLanes,
  shortClock,
  stripNote,
  timelineFor,
  weekdayShort,
  type CalendarClosure,
  type CalendarJob,
  type CalendarKind,
  type Gap,
  type GarageRoom,
} from '@/lib/calendar'
import { shortName } from '@/lib/jobs'

/** The width of the hour labels down the left, and the gap to the lanes. */
const LABELS_PX = 44
const LANES_LEFT_PX = 50
/** Below this a lane is too narrow for a name: the timeline scrolls sideways instead. */
const MIN_LANE_PX = 64
const LANE_GAP_PX = 6

/**
 * The Day view (mockup garage-calendar B): the week's seven days to pick
 * from, then the chosen day's opening hours as a timeline, an hour to 56
 * points. At-garage jobs sit side by side in lanes, as many as the garage
 * has bays; doorstep and pickup & drop jobs in their own "On the road"
 * lane. Every block opens its job.
 */
export function CalendarDay({
  day,
  today,
  now,
  week,
  bookings,
  jobsByDay,
  hours,
  closures,
  room,
  onPick,
}: {
  day: string
  today: string
  now: number
  week: string[]
  /** The whole list, for what holds the garage's room (the Free boxes). */
  bookings: readonly Booking[]
  jobsByDay: Map<string, CalendarJob[]>
  hours: readonly OpeningDay[]
  closures: readonly CalendarClosure[]
  room: GarageRoom
  onPick: (day: string) => void
}) {
  const jobs = jobsByDay.get(day) ?? []
  const closed = closedDay(day, hours, closures)

  return (
    <>
      <div className="grid grid-cols-7 gap-1">
        {week.map((d) => (
          <StripDay
            key={d}
            day={d}
            today={today}
            selected={d === day}
            jobs={jobsByDay.get(d)}
            closed={closedDay(d, hours, closures) !== null}
            onPick={onPick}
          />
        ))}
      </div>

      {closed && <ClosedCard closed={closed} />}
      {(!closed || jobs.length > 0) && (
        <Timeline
          day={day}
          today={today}
          now={now}
          bookings={bookings}
          jobs={jobs}
          hours={hours}
          room={room}
          closed={closed !== null}
        />
      )}
    </>
  )
}

function StripDay({
  day,
  today,
  selected,
  jobs,
  closed,
  onPick,
}: {
  day: string
  today: string
  selected: boolean
  jobs: CalendarJob[] | undefined
  closed: boolean
  onPick: (day: string) => void
}) {
  const summary = daySummary(jobs)
  const note = stripNote(day, today, summary, closed)
  const isToday = day === today
  return (
    <button
      type="button"
      aria-label={dayButtonLabel(day, { today, summary, closed, long: true })}
      aria-pressed={selected}
      onClick={() => onPick(day)}
      style={closed && !selected ? HATCH : undefined}
      className={cn(
        'flex h-[66px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[14px] border',
        selected
          ? 'bg-surface-elevated'
          : closed
            ? 'bg-brand-black'
            : 'bg-surface',
        isToday ? 'border-brand-red' : 'border-border',
        closed && !selected ? 'text-dim' : 'text-text-primary'
      )}
    >
      <span
        className={cn(
          'text-[11px]',
          isToday
            ? 'font-semibold text-tone-new-text'
            : closed
              ? undefined
              : 'text-text-muted'
        )}
      >
        {isToday ? 'Today' : weekdayShort(day)}
      </span>
      <span
        className={cn(
          'font-numeric text-[18px]',
          isToday || selected ? 'font-bold' : 'font-semibold'
        )}
      >
        {dayOfMonth(day)}
      </span>
      <span className="flex h-4 items-center gap-1 text-[11px]">
        {note?.kind === 'closed' && 'Closed'}
        {note?.kind === 'done' && (
          <span className="text-tone-done-text">
            <span className="font-numeric">{note.count}</span> done
          </span>
        )}
        {note?.kind === 'today' && (
          <span className="text-text-primary">
            <span className="font-numeric">{note.count}</span>{' '}
            {note.count === 1 ? 'job' : 'jobs'}
          </span>
        )}
        {note?.kind === 'count' && (
          <>
            <Dot kind={note.tone} />
            <span className="font-numeric text-text-secondary">
              {note.count}
            </span>
          </>
        )}
      </span>
    </button>
  )
}

/** Each state's block, as the mockup draws it. Written out so Tailwind finds them. */
const BLOCK_TONE: Record<CalendarKind, { box: string; status: string }> = {
  done: {
    box: 'border-tone-done-dot/35 bg-tone-done-dot/10',
    status: 'text-tone-done-text',
  },
  working: {
    box: 'border-tone-progress-text/60 bg-tone-progress-dot/20',
    status: 'font-semibold text-tone-progress-text',
  },
  accepted: {
    box: 'border-tone-progress-text/30 bg-tone-progress-dot/10',
    status: 'text-tone-progress-text',
  },
  answer: {
    box: 'border-dashed border-brand-red bg-tone-new-tint',
    status: 'font-semibold text-tone-new-text',
  },
}

function Timeline({
  day,
  today,
  now,
  bookings,
  jobs,
  hours: weekly,
  room,
  closed,
}: {
  day: string
  today: string
  now: number
  bookings: readonly Booking[]
  jobs: CalendarJob[]
  hours: readonly OpeningDay[]
  room: GarageRoom
  closed: boolean
}) {
  const { bays } = room
  const hours = dayHours(day, weekly)
  const line = timelineFor(hours, jobs)
  const garage = packLanes(
    jobs.filter((job) => !job.onTheRoad),
    bays
  )
  const road = packLanes(
    jobs.filter((job) => job.onTheRoad),
    1
  )
  const lanes = [...garage, ...road]
  const px = (minutes: number) => ((minutes - line.startMin) * HOUR_PX) / 60
  const height = px(line.endMin)
  const bayCount = bays && bays > 0 ? Math.floor(bays) : 1
  // Free time is offered only where customers can book it: an open day
  // with its own hours, from now on today, and never on a day gone by; and
  // only where the whole garage has a bay to spare (freeGaps).
  const offerFree = !closed && hours.known && day >= today
  const free = offerFree
    ? freeGaps({
        lanes: garage,
        bookings,
        day,
        hours,
        fromMin: day === today ? nextQuarter(now) : 0,
        room,
      })
    : []
  const nowAt = day === today ? nowMinute(now) : null
  const minWidth =
    LANES_LEFT_PX +
    lanes.length * MIN_LANE_PX +
    (lanes.length - 1) * LANE_GAP_PX
  const columns = `repeat(${lanes.length}, minmax(0, 1fr))`

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div style={{ minWidth }}>
        <div
          className="grid pb-2 pt-0.5 text-[12px] font-semibold text-text-secondary"
          style={{
            gridTemplateColumns: `${LABELS_PX}px ${columns}`,
            columnGap: LANE_GAP_PX,
          }}
        >
          <span />
          {/* Detlio doesn't put bookings in bays, so the lanes say none. */}
          <span
            className="text-center"
            style={{ gridColumn: `span ${garage.length}` }}
          >
            At the garage{' '}
            <span className="font-normal text-text-muted">
              · <span className="font-numeric">{bayCount}</span>{' '}
              {bayCount === 1 ? 'bay' : 'bays'}
            </span>
          </span>
          <span
            className="text-center"
            style={{ gridColumn: `span ${road.length}` }}
          >
            On the road
          </span>
        </div>

        <div className="relative" style={{ height }}>
          {line.hours.map((mark, i) => (
            <div key={mark}>
              <div
                aria-hidden="true"
                className="absolute inset-x-0 h-px bg-line"
                style={{ top: px(mark) }}
              />
              <span
                aria-hidden="true"
                className="absolute left-0 w-10 bg-brand-black font-numeric text-[11px] text-text-muted"
                style={{ top: px(mark) - 7 }}
              >
                {hourLabel(mark, i === 0)}
              </span>
            </div>
          ))}

          {hours.known && !closed && hours.closeMin < line.endMin && (
            <div
              className="absolute right-0 flex items-center justify-center rounded-[8px] text-[11px] text-dim"
              style={{
                ...HATCH,
                left: LANES_LEFT_PX,
                top: px(hours.closeMin),
                height: px(line.endMin) - px(hours.closeMin),
              }}
            >
              Closes {minuteClock(hours.closeMin)}
            </div>
          )}

          <div
            className="absolute inset-y-0 right-0 grid"
            style={{
              left: LANES_LEFT_PX,
              gridTemplateColumns: columns,
              columnGap: LANE_GAP_PX,
            }}
          >
            {lanes.map((lane, i) => (
              <div key={i} className="relative">
                {/* Road lanes come after the garage's, so have no list here. */}
                {(free[i] ?? []).map((gap) => (
                  <FreeBox
                    key={gap.startMin}
                    gap={gap}
                    top={px(gap.startMin)}
                  />
                ))}
                {lane.map((job, j) => {
                  const next = lane[j + 1]?.startMin
                  return (
                    <Block
                      key={job.booking.id}
                      job={job}
                      now={now}
                      top={px(job.startMin) + 1}
                      trueHeight={px(job.endMin) - px(job.startMin) - 2}
                      room={
                        next === undefined
                          ? Infinity
                          : px(next) - px(job.startMin) - 4
                      }
                    />
                  )
                })}
              </div>
            ))}
          </div>

          {nowAt !== null && nowAt >= line.startMin && nowAt <= line.endMin && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 z-20"
              style={{ top: px(nowAt) }}
            >
              <div
                className="absolute right-0 h-0.5 rounded-full bg-brand-red"
                style={{ left: 40, top: -1 }}
              />
              <div
                className="absolute size-2.5 rounded-full bg-brand-red"
                style={{ left: 34, top: -5 }}
              />
              <span
                className="absolute left-0 bg-brand-black pr-0.5 font-numeric text-[10px] font-bold text-tone-new-text"
                style={{ top: -7 }}
              >
                {shortClock(nowAt)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * One job on the timeline. Its height is its length; a short one is drawn
 * at least 44 points tall to be easy to tap, unless the next job in its lane
 * starts sooner than that.
 */
function Block({
  job,
  now,
  top,
  trueHeight,
  room,
}: {
  job: CalendarJob
  now: number
  top: number
  trueHeight: number
  room: number
}) {
  const b = job.booking
  const height = Math.max(trueHeight, Math.min(44, room))
  const tone = BLOCK_TONE[job.kind]
  const status =
    job.kind === 'answer' ? answerLine(b, now) : KIND_LABELS[job.kind]
  const service = b.items[0]?.name ?? b.serviceSummary
  return (
    <Link
      href={`/bookings/${b.id}`}
      aria-label={blockLabel(job, now)}
      className={cn(
        'absolute inset-x-0 z-10 flex flex-col gap-0.5 overflow-hidden rounded-[10px] border px-[7px] py-[5px] text-left',
        tone.box
      )}
      style={{ top, height }}
    >
      <span className="truncate text-[12px] font-semibold text-text-primary">
        {shortName(b.customerName)}
      </span>
      {height >= 96 && (
        <>
          <span className="truncate text-[11px] text-text-secondary">
            {service}
          </span>
          {b.vehicle && (
            <span className="truncate text-[11px] text-text-secondary">
              {b.vehicle.make} {b.vehicle.model}
            </span>
          )}
          <span className="font-numeric text-[11px] text-text-muted">
            {shortClock(job.startMin)} – {shortClock(job.endMin)}
          </span>
        </>
      )}
      <span
        className={cn(
          'truncate text-[11px]',
          height >= 96 && 'mt-auto',
          tone.status
        )}
      >
        {status}
      </span>
      {height >= 56 && height < 96 && (
        <span className="truncate text-[11px] text-text-secondary">
          {service}
        </span>
      )}
    </Link>
  )
}

/** A stretch of free time in a lane: "Free 1:00 – 3:30". */
function FreeBox({ gap, top }: { gap: Gap; top: number }) {
  const height = ((gap.endMin - gap.startMin) * HOUR_PX) / 60 - 2
  return (
    <div
      className="absolute inset-x-0 flex flex-col items-center justify-center gap-0.5 rounded-[10px] border border-dashed border-white/15 text-[11px] text-text-muted"
      style={{ top: top + 1, height }}
    >
      <span className="font-semibold text-text-secondary">Free</span>
      <span className="font-numeric">
        {shortClock(gap.startMin)} – {shortClock(gap.endMin)}
      </span>
    </div>
  )
}
