import { useBookDay } from '@repo/core/api/hooks/use-garage-book';
import { istDateKey, rupees, rupeesShort, showClosingCard, type BookFilter } from '@repo/core/garage-book';
import type { Booking } from '@repo/core/types';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Odometer } from '@repo/native-ui/finish';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';

import { useWaitingWalkIns } from '@/lib/book-offline';

import { DayList } from './day-list';
import { ClosingCard } from './moments';
import { Tile } from './parts';
import { RequestCard } from './request-card';

/** Home with Garage Book on (B1; the web's components/book/book-home.tsx). */
export function BookHome({ pending, now, onChanged }: { pending: Booking[]; now: number; onChanged: () => void }) {
  const [filter, setFilter] = useState<BookFilter>('all');
  const { added } = useLocalSearchParams<{ added?: string }>();
  const day = useBookDay(undefined);
  const waiting = useWaitingWalkIns(istDateKey(new Date(now)));
  const data = day.data;
  return (
    <>
      {pending[0] ? <RequestCard booking={pending[0]} now={now} more={pending.length - 1} onChanged={onChanged} /> : null}
      {data ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Tile label="Today's jobs" value={data.counts.all + waiting.length} sub={`${data.counts.detlio} Detlio · ${data.counts.own + waiting.length} your own`} />
            {data.taken ? (
              <Tile
                label="Taken today"
                value={<Odometer value={rupees(data.taken.totalPaise) ?? '₹0'} numeric={data.taken.totalPaise} size={24} lh={30} />}
                sub={`${rupeesShort(data.taken.ownPaise)} own · ${rupeesShort(data.taken.detlioPaise)} Detlio`}
              />
            ) : (
              <Tile
                label="Done today"
                value={data.jobs.filter((job) => (job.source === 'own' ? job.status === 'done' : job.status === 'completed')).length}
                sub="Detlio and your own"
              />
            )}
          </View>
          {showClosingCard(data, new Date(now)) ? <ClosingCard day={data} /> : null}
          <DayList
            day={data}
            extra={waiting}
            filter={filter}
            onFilter={setFilter}
            dropId={added ?? null}
            header={
              <T accessibilityRole="header" variant="t2">
                Today
              </T>
            }
          />
        </>
      ) : day.isError ? (
        <LoadError what="today's jobs" onRetry={() => void day.refetch()} />
      ) : (
        <SkeletonList count={3} height={80} />
      )}
    </>
  );
}
