'use client'

import { useCallback, useState } from 'react'
import type { BookDay, BookJob, OwnJob } from '@repo/core/api/garage-book'
import { rupees, type BookFilter } from '@repo/core/garage-book'
import { DoneMoment } from './done-moment'
import { JobSheet } from './job-sheet'
import { JobCard, Seg, jobLine } from './parts'

export const FILTERS = (counts: { all: number; detlio: number; own: number } | undefined) =>
  [
    { value: 'all', label: 'All', count: counts?.all },
    { value: 'detlio', label: 'Detlio', count: counts?.detlio },
    { value: 'own', label: 'My own', count: counts?.own },
  ] as const

export function filterJobs<T extends { source: 'own' | 'detlio' }>(jobs: T[], filter: BookFilter): T[] {
  return filter === 'all' ? jobs : jobs.filter((job) => job.source === filter)
}

/**
 * A day's jobs, Detlio and walk-ins in one time order, with the All /
 * Detlio / My own filter (Home's Today and Jobs). A walk-in opens its sheet,
 * where Mark done plays moment 3; a Detlio job opens its booking page. The
 * walk-in just added (`dropId`) drops into its place once (moment 2).
 */
export function DayList({
  day,
  extra = [],
  filter,
  onFilter,
  dropId,
  header,
  summary,
}: {
  day: BookDay
  /** Walk-ins saved on this device and not yet sent (native only; none on the web). */
  extra?: OwnJob[]
  filter: BookFilter
  onFilter: (filter: BookFilter) => void
  dropId?: string | null
  header?: React.ReactNode
  /** A line between the filter and the list (Jobs: the day, its count and takings). */
  summary?: (shown: BookJob[]) => React.ReactNode
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [done, setDone] = useState<OwnJob | null>(null)
  const jobs: BookJob[] = [...day.jobs, ...extra].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const shown = filterJobs(jobs, filter)
  const open = jobs.find((job): job is OwnJob => job.source === 'own' && job.id === openId) ?? null
  const endDone = useCallback(() => setDone(null), [])

  return (
    <>
      <div className="flex flex-col gap-2">
        {header}
        <Seg<BookFilter> label="Show jobs" value={filter} options={FILTERS(day.counts)} onChange={onFilter} />
      </div>
      {summary?.(shown)}
      <div className="flex flex-col gap-2">
        {shown.length === 0 ? (
          <p className="fx-edge rounded-control px-4 py-4 text-t4 text-[#A8A8B2]">
            {filter === 'own' ? 'No walk-ins. Tap + to add one.' : filter === 'detlio' ? 'No Detlio jobs this day.' : 'No jobs this day. Tap + to add a walk-in.'}
          </p>
        ) : (
          shown.map((job) =>
            job.source === 'detlio' ? (
              <JobCard key={`d-${job.id}`} job={job} href={`/bookings/${job.id}`} />
            ) : (
              <JobCard key={`o-${job.id}`} job={job} onOpen={() => setOpenId(job.id)} drop={dropId === job.id || dropId === job.clientId} />
            )
          )
        )}
      </div>
      <JobSheet key={open?.id ?? 'none'} job={open} open={open !== null} onClose={() => setOpenId(null)} onDone={setDone} />
      {done && <DoneMoment name={done.name} line={`${jobLine(done)} · ${done.payment === 'later' ? 'Pay later' : done.payment.toUpperCase()}`} amount={rupees(done.totalPaise)} onEnd={endDone} />}
    </>
  )
}
