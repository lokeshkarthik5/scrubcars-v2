'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconCalendarEvent } from '@tabler/icons-react'
import { useBookDay } from '@repo/core/api/hooks/use-garage-book'
import { dayLabel, dayStrip, istDateKey, rupees, type BookFilter } from '@repo/core/garage-book'
import { cn } from '@repo/core/utils'
import { RedLight } from '@repo/ui/finish/red-light'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { DayList } from '@/components/book/day-list'
import { BookScreen, LoadFailed, Overline, raised } from '@/components/book/parts'

/**
 * Jobs (S2): a day strip, the All / Detlio / My own filter, and every job of
 * the day with its status. A walk-in opens its sheet, where Mark done plays
 * moment 3; a Detlio job opens its booking page. Every Detlio booking (New,
 * Upcoming, Completed, Cancelled) is still one tap away.
 */
function JobsScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const today = istDateKey(new Date())
  const date = params.get('date') ?? today
  const [filter, setFilter] = useState<BookFilter>('all')
  const day = useBookDay(date === today ? undefined : date)
  const data = day.data

  return (
    <BookScreen>
      <div className="flex items-center justify-between">
        <h1 className="text-title font-semibold text-text-primary">Jobs</h1>
        <Link href="/bookings" className={cn(raised, 'flex h-10 items-center gap-1.5 rounded-small px-3 text-t4 font-semibold text-text-primary')}>
          <IconCalendarEvent size={18} aria-hidden />
          Detlio bookings
        </Link>
      </div>

      <div role="group" aria-label="Day" className="flex gap-1.5">
        {dayStrip(today).map((d) => {
          const on = d.key === date
          return (
            <button
              key={d.key}
              type="button"
              aria-pressed={on}
              aria-label={dayLabel(d.key)}
              onClick={() => router.replace(d.key === today ? '/book/jobs' : `/book/jobs?date=${d.key}`)}
              className={cn(raised, 'flex h-[58px] flex-1 flex-col items-center justify-center gap-px rounded-inner', on ? 'text-text-primary' : 'text-[#A8A8B2]')}
            >
              <span className="text-t5 font-medium">{d.weekday}</span>
              <span className="font-numeric text-[17px] font-semibold">{d.day}</span>
              <RedLight state={on ? 'on' : 'dim'} className="mt-[3px] w-[18px]" />
            </button>
          )
        })}
      </div>

      {data ? (
        <DayList
          day={data}
          filter={filter}
          onFilter={setFilter}
          summary={(shown) => {
            const total = shown.reduce<number | null>((sum, job) => {
              const paise = job.source === 'own' ? job.totalPaise : job.amount !== undefined ? Math.round(Number(job.amount) * 100) : undefined
              return paise === undefined || sum === null ? null : sum + paise
            }, 0)
            return (
              <div className="flex items-baseline justify-between">
                <Overline>
                  {dayLabel(date)} · {shown.length} {shown.length === 1 ? 'job' : 'jobs'}
                </Overline>
                {total !== null && shown.length > 0 && <span className="font-numeric text-t4 font-semibold text-[#A8A8B2]">{rupees(total)}</span>}
              </div>
            )
          }}
        />
      ) : day.isError ? (
        <LoadFailed what="the jobs" onRetry={() => void day.refetch()} />
      ) : (
        <SkeletonList count={4} itemClassName="h-20" />
      )}

    </BookScreen>
  )
}

export default function JobsPage() {
  return (
    <Suspense fallback={null}>
      <JobsScreen />
    </Suspense>
  )
}
