'use client'

import { useId } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { StatsCollectedBar } from '@repo/core/api/admin'
import {
  barsToLabel,
  dayLabel,
  LABEL_EVERY_BAR_UP_TO,
  rangeLabel,
  rupees,
  shortRupees,
} from '@/lib/statistics'

/**
 * The Statistics charts, on recharts. Only the Statistics page loads this
 * file, through next/dynamic, so no other admin page carries the library.
 *
 * One light data colour on the dark card, never red (red is what to press):
 * the period on screen in light graphite, the period before in a quiet grey,
 * hairline grid one step off the card. Hex rather than tokens because the
 * SVG is drawn by the library, which takes colours, not class names; each is
 * named after the token or the approved mockup's value it stands for.
 */
const INK = '#E4E4E7' // the one data colour
const INK_DIM = 'rgba(228, 228, 231, 0.34)' // a part week
const PREVIOUS = '#5C5C68' // the period before
const GRID = '#24242B' // hairlines, one step off the card
const MUTED = '#9A9AA3' // --color-text-muted
const SECONDARY = '#B0B0B0' // --color-text-secondary
const PRIMARY = '#FAFAFA' // --color-text-primary
const SURFACE = '#141416' // --color-surface
const BASELINE = '#3A3A44'

// next/font sets these on <html> (app/layout.tsx); figures in Space Grotesk.
const NUMERIC_FONT = 'var(--font-space-grotesk), var(--font-inter), sans-serif'
const TEXT_FONT = 'var(--font-inter), sans-serif'

/** A round top for the y-axis: 1, 2 or 5 times a power of ten, doubled. */
function niceMax(max: number): number {
  if (max <= 0) return 2
  const step = [1, 2, 5]
    .flatMap((m) => [1, 10, 100, 1000, 10_000].map((p) => m * p))
    .sort((a, b) => a - b)
    .find((s) => s * 2 >= max)
  return (step ?? Math.ceil(max / 2)) * 2
}

/** About five evenly spread labels, always the first and the last. */
function spreadTicks<T>(values: T[], count = 5): T[] {
  if (values.length <= count) return values
  const picked = new Set<number>()
  for (let i = 0; i < count; i++) picked.add(Math.round((i * (values.length - 1)) / (count - 1)))
  return [...picked].map((i) => values[i])
}

/** The card the tooltip floats in: graphite, figures in Space Grotesk. */
function TooltipCard({ title, lines }: { title: string; lines: Array<[string, string]> }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-[12px] shadow-lg">
      <p className="font-medium text-text-primary">{title}</p>
      {lines.map(([label, value]) => (
        <p key={label} className="text-text-secondary">
          {label} <span className="font-numeric text-text-primary">{value}</span>
        </p>
      ))}
    </div>
  )
}

interface PerDayPoint {
  label: string
  bookings: number
  previous: number | null
  previousLabel: string | null
}

/**
 * Bookings per day, this period against the one before (aligned day by day
 * from the first), with the last day's figure on its dot.
 */
export function BookingsPerDayChart({
  current,
  previous,
}: {
  current: Array<{ date: string; bookings: number }>
  previous: Array<{ date: string; bookings: number }> | null
}) {
  const gradientId = useId().replace(/:/g, '')
  const data: PerDayPoint[] = current.map((day, i) => ({
    label: dayLabel(day.date),
    bookings: day.bookings,
    previous: previous?.[i]?.bookings ?? null,
    previousLabel: previous?.[i] ? dayLabel(previous[i].date) : null,
  }))
  const top = niceMax(Math.max(0, ...data.map((d) => Math.max(d.bookings, d.previous ?? 0))))
  const last = data[data.length - 1]

  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart
        data={data}
        margin={{ top: 18, right: 10, bottom: 0, left: -8 }}
        accessibilityLayer={false}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F4F4F5" stopOpacity={0.16} />
            <stop offset="1" stopColor="#F4F4F5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          ticks={spreadTicks(data.map((d) => d.label))}
          interval={0}
          tickLine={false}
          axisLine={false}
          tick={{ fill: MUTED, fontSize: 10.5, fontFamily: TEXT_FONT }}
          tickMargin={8}
        />
        <YAxis
          domain={[0, top]}
          ticks={[0, top / 2, top]}
          allowDecimals={false}
          width={36}
          tickLine={false}
          axisLine={false}
          tick={{ fill: MUTED, fontSize: 10, fontFamily: NUMERIC_FONT }}
        />
        <Tooltip
          cursor={{ stroke: BASELINE }}
          content={({ active, payload }) => {
            const point = (payload?.[0]?.payload ?? null) as PerDayPoint | null
            if (!active || !point) return null
            const lines: Array<[string, string]> = [['Bookings', String(point.bookings)]]
            if (point.previous !== null && point.previousLabel) {
              lines.push([`${point.previousLabel}, the period before`, String(point.previous)])
            }
            return <TooltipCard title={point.label} lines={lines} />
          }}
        />
        {previous && (
          <Line
            type="monotone"
            dataKey="previous"
            stroke={PREVIOUS}
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
        <Area
          type="monotone"
          dataKey="bookings"
          stroke={INK}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, fill: INK, stroke: SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {last && (
          <ReferenceDot
            x={last.label}
            y={last.bookings}
            r={4}
            fill={INK}
            stroke={SURFACE}
            strokeWidth={2}
            label={{
              value: last.bookings,
              position: 'top',
              offset: 8,
              fill: PRIMARY,
              fontSize: 11,
              fontWeight: 500,
              fontFamily: NUMERIC_FONT,
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/**
 * Collected after refunds per week (or month), each bar labelled with its
 * amount while they fit; past seven bars, only the first, the last and the
 * highest are, with about five dates under them. A bar the period only
 * partly covers is dimmer, so a short week is not read as a slow one.
 */
export function CollectedChart({
  bars,
  unit,
}: {
  bars: StatsCollectedBar[]
  unit: 'week' | 'month'
}) {
  const data = bars.map((bar) => ({
    ...bar,
    label: unit === 'month' ? dayLabel(bar.start).split(' ')[1] : dayLabel(bar.start),
  }))
  const top = Math.max(1, ...data.map((d) => d.collected)) * 1.04
  const labelled = barsToLabel(data.map((d) => d.collected))
  const crowded = data.length > LABEL_EVERY_BAR_UP_TO

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart
        data={data}
        margin={{ top: 22, right: 4, bottom: 0, left: 4 }}
        accessibilityLayer={false}
      >
        <XAxis
          dataKey="label"
          ticks={crowded ? spreadTicks(data.map((d) => d.label)) : undefined}
          interval={0}
          tickLine={false}
          axisLine={{ stroke: BASELINE }}
          tick={{ fill: MUTED, fontSize: 10.5, fontFamily: TEXT_FONT }}
          tickMargin={8}
        />
        <YAxis hide domain={[0, top]} />
        <Tooltip
          cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
          content={({ active, payload }) => {
            const bar = (payload?.[0]?.payload ?? null) as StatsCollectedBar | null
            if (!active || !bar) return null
            return (
              <TooltipCard
                title={rangeLabel({ from: bar.start, to: bar.end })}
                lines={[['Collected', rupees(bar.collected)]]}
              />
            )
          }}
        />
        <Bar dataKey="collected" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((bar) => (
            <Cell key={bar.start} fill={bar.full ? INK : INK_DIM} />
          ))}
          <LabelList
            dataKey="collected"
            content={({ x, y, width, value, index }) =>
              labelled.has(Number(index)) ? (
                <text
                  x={Number(x) + Number(width) / 2}
                  y={Number(y) - 8}
                  textAnchor="middle"
                  // A part week's amount is quieter, like its bar.
                  fill={data[Number(index)]?.full ? PRIMARY : SECONDARY}
                  fontSize={11}
                  fontWeight={500}
                  fontFamily={NUMERIC_FONT}
                >
                  {shortRupees(Number(value))}
                </text>
              ) : null
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

interface NewRepeatPoint {
  label: string
  start: string
  end: string
  full: boolean
  new: number
  repeat: number
}

/**
 * Paid bookings per week, a customer's first ever (quiet) under the ones by
 * customers coming back (light), stacked. A week the period only partly
 * covers keeps its colours: its total says what it is, and the tooltip its
 * dates.
 */
export function NewRepeatChart({
  weeks,
}: {
  weeks: Array<{ start: string; end: string; full: boolean; new: number; repeat: number }>
}) {
  const data: NewRepeatPoint[] = weeks.map((week) => ({ ...week, label: dayLabel(week.start) }))
  const top = niceMax(Math.max(0, ...data.map((d) => d.new + d.repeat)))
  const crowded = data.length > LABEL_EVERY_BAR_UP_TO

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: -8 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          ticks={crowded ? spreadTicks(data.map((d) => d.label)) : undefined}
          interval={0}
          tickLine={false}
          axisLine={{ stroke: BASELINE }}
          tick={{ fill: MUTED, fontSize: 10.5, fontFamily: TEXT_FONT }}
          tickMargin={8}
        />
        <YAxis
          domain={[0, top]}
          ticks={[0, top / 2, top]}
          allowDecimals={false}
          width={36}
          tickLine={false}
          axisLine={false}
          tick={{ fill: MUTED, fontSize: 10, fontFamily: NUMERIC_FONT }}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
          content={({ active, payload }) => {
            const week = (payload?.[0]?.payload ?? null) as NewRepeatPoint | null
            if (!active || !week) return null
            return (
              <TooltipCard
                title={rangeLabel({ from: week.start, to: week.end })}
                lines={[
                  ['Returning customers', String(week.repeat)],
                  ['First booking', String(week.new)],
                ]}
              />
            )
          }}
        />
        <Bar dataKey="new" stackId="bookings" fill={PREVIOUS} maxBarSize={24} isAnimationActive={false} />
        <Bar
          dataKey="repeat"
          stackId="bookings"
          fill={INK}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
