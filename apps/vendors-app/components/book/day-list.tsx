import type { BookDay, BookJob, OwnJob } from '@repo/core/api/garage-book';
import { payWord, rupees, type BookFilter } from '@repo/core/garage-book';
import { msg, useT } from '@repo/core/i18n';
import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { JobSheet } from './job-sheet';
import { DoneMoment, DropIn } from './moments';
import { Empty, go, JobCard, jobLine, Seg } from './parts';

export const FILTERS = (counts: { all: number; detlio: number; own: number } | undefined) =>
  [
    { value: 'all', label: msg('All'), count: counts?.all },
    { value: 'detlio', label: 'Detlio', count: counts?.detlio },
    { value: 'own', label: msg('My own'), count: counts?.own },
  ] as const;

export function filterJobs<T extends { source: 'own' | 'detlio' }>(jobs: T[], filter: BookFilter): T[] {
  return filter === 'all' ? jobs : jobs.filter((job) => job.source === filter);
}

/** A day's jobs with the filter (the web's components/book/day-list.tsx); walk-ins saved offline show as waiting. */
export function DayList({
  day,
  extra = [],
  filter,
  onFilter,
  dropId,
  header,
  summary,
}: {
  day: BookDay;
  extra?: OwnJob[];
  filter: BookFilter;
  onFilter: (filter: BookFilter) => void;
  dropId?: string | null;
  header?: ReactNode;
  summary?: (shown: BookJob[]) => ReactNode;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState<OwnJob | null>(null);
  const endDone = useCallback(() => setDone(null), []);
  const sent = new Set(day.jobs.flatMap((job) => (job.source === 'own' ? [job.clientId] : [])));
  const jobs: BookJob[] = [...day.jobs, ...extra.filter((job) => !sent.has(job.clientId))].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const counts = { all: jobs.length, detlio: jobs.filter((j) => j.source === 'detlio').length, own: jobs.filter((j) => j.source === 'own').length };
  const shown = filterJobs(jobs, filter);
  const open = jobs.find((job): job is OwnJob => job.source === 'own' && (job.id === openId || job.clientId === openId)) ?? null;
  return (
    <>
      <View style={{ gap: 8 }}>
        {header}
        <Seg<BookFilter> label={msg('Show jobs')} value={filter} options={FILTERS(counts)} onChange={onFilter} />
      </View>
      {summary?.(shown)}
      <View style={{ gap: 8 }}>
        {shown.length === 0 ? (
          <Empty>
            {filter === 'own'
              ? t('No walk-ins. Tap + to add one.')
              : filter === 'detlio'
                ? t('No Detlio jobs this day.')
                : t('No jobs this day. Tap + to add a walk-in.')}
          </Empty>
        ) : (
          shown.map((job) =>
            job.source === 'detlio' ? (
              <JobCard key={`d-${job.id}`} job={job} onPress={() => go(`/bookings/${job.id}`)} />
            ) : (
              <DropIn key={`o-${job.clientId}`} play={dropId === job.id || dropId === job.clientId}>
                <JobCard job={job} onPress={() => setOpenId(job.pending ? job.clientId : job.id)} />
              </DropIn>
            )
          )
        )}
      </View>
      <JobSheet key={open?.id ?? 'none'} job={open} open={open !== null} onClose={() => setOpenId(null)} onDone={setDone} />
      {done ? (
        <DoneMoment
          name={done.name}
          line={`${jobLine(done)} · ${payWord(done.payment)}`}
          amount={rupees(done.totalPaise)}
          onEnd={endDone}
        />
      ) : null}
    </>
  );
}
