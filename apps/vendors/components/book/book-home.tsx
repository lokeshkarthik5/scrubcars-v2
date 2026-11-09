'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Booking } from '@repo/core/types'
import { useBookDay } from '@repo/core/api/hooks/use-garage-book'
import { rupees, rupeesShort, showClosingCard, type BookFilter } from '@repo/core/garage-book'
import { Odometer } from '@repo/ui/finish/odometer'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { ClosingCard } from './closing-card'
import { DayList } from './day-list'
import { LoadFailed, Tile } from './parts'
import { RequestCard } from './request-card'

/**
 * Home with Garage Book on (B1): a new Detlio request pinned on top with its
 * answer-by ring, the day in two tiles, the closing-time card once the day
 * is done, and Today: Detlio jobs and walk-ins in one list. Everything else
 * Home had stays around it (page.tsx).
 */
export function BookHome({ pending, now, onChanged }: { pending: Booking[]; now: number; onChanged: () => void }) {
  const [filter, setFilter] = useState<BookFilter>('all')
  const added = useSearchParams().get('added')
  const day = useBookDay(undefined)
  const data = day.data

  return (
    <>
      {pending[0] && <RequestCard booking={pending[0]} now={now} more={pending.length - 1} onChanged={onChanged} />}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Today's jobs" value={data.counts.all} sub={`${data.counts.detlio} Detlio · ${data.counts.own} your own`} />
            {data.taken ? (
              <Tile
                label="Taken today"
                value={<Odometer value={rupees(data.taken.totalPaise) ?? '₹0'} numeric={data.taken.totalPaise} />}
                sub={`${rupeesShort(data.taken.ownPaise)} own · ${rupeesShort(data.taken.detlioPaise)} Detlio`}
              />
            ) : (
              <Tile label="Done today" value={data.jobs.filter((job) => (job.source === 'own' ? job.status === 'done' : job.status === 'completed')).length} sub="Detlio and your own" />
            )}
          </div>
          {showClosingCard(data, new Date(now)) && <ClosingCard day={data} />}
          <DayList day={data} filter={filter} onFilter={setFilter} dropId={added} header={<h2 className="text-t2 font-semibold text-text-primary">Today</h2>} />
        </>
      ) : day.isError ? (
        <LoadFailed what="today's jobs" onRetry={() => void day.refetch()} />
      ) : (
        <SkeletonList count={3} itemClassName="h-20" />
      )}
    </>
  )
}
