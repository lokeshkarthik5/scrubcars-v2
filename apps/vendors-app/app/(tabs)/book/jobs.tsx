import { useBookDay } from '@repo/core/api/hooks/use-garage-book';
import { dayLabel, dayStrip, istDateKey, rupees, type BookFilter } from '@repo/core/garage-book';
import { useT, useTn } from '@repo/core/i18n';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Raised, RedLight } from '@repo/native-ui/finish';
import { IconCalendarEvent } from '@repo/native-ui/icons';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { DayList } from '@/components/book/day-list';
import { go, Overline, RaisedButton } from '@/components/book/parts';
import { useWaitingWalkIns } from '@/lib/book-offline';

/** Jobs (S2; the web's app/book/jobs/page.tsx): a day strip, the filter, every job of the day. */
function JobsScreen() {
  const t = useT();
  const tn = useTn();
  const styles = useStyles();
  const colors = useColors();
  const today = istDateKey(new Date());
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<BookFilter>('all');
  const day = useBookDay(date === today ? undefined : date);
  const waiting = useWaitingWalkIns(date);
  const data = day.data;
  return (
    <BookScreen>
      <View style={styles.head}>
        <T accessibilityRole="header" variant="title">
          {t('Jobs')}
        </T>
        <RaisedButton label={t('Detlio bookings')} height={40} radius={12} icon={<IconCalendarEvent size={18} />} onPress={() => go('/bookings')} />
      </View>
      <View accessibilityLabel={t('Day')} style={styles.strip}>
        {dayStrip(today).map((d) => {
          const on = d.key === date;
          return (
            <Pressable key={d.key} accessibilityRole="button" accessibilityLabel={dayLabel(d.key)} accessibilityState={{ selected: on }} onPress={() => setDate(d.key)} style={styles.flex}>
              <Raised radius={14} innerStyle={styles.day}>
                <T size={11} weight={500} color={on ? colors.textPrimary : colors.textSecondary}>
                  {d.weekday}
                </T>
                <T num size={17} weight={600} color={on ? colors.textPrimary : colors.textSecondary}>
                  {String(d.day)}
                </T>
                <RedLight state={on ? 'on' : 'dim'} width={18} style={styles.dayLight} />
              </Raised>
            </Pressable>
          );
        })}
      </View>
      {data ? (
        <DayList
          day={data}
          extra={waiting}
          filter={filter}
          onFilter={setFilter}
          summary={(shown) => {
            const total = shown.reduce<number | null>((sum, job) => {
              const paise = job.source === 'own' ? job.totalPaise : job.amount !== undefined ? Math.round(Number(job.amount) * 100) : undefined;
              return paise === undefined || sum === null ? null : sum + paise;
            }, 0);
            return (
              <View style={styles.summary}>
                <Overline>{`${dayLabel(date)} · ${tn(shown.length, '{count} job', '{count} jobs')}`}</Overline>
                {total !== null && shown.length > 0 ? (
                  <T num size={13} weight={600} color={colors.textSecondary}>
                    {rupees(total) ?? ''}
                  </T>
                ) : null}
              </View>
            );
          }}
        />
      ) : day.isError ? (
        <LoadError what={t('the jobs')} onRetry={() => void day.refetch()} />
      ) : (
        <SkeletonList count={4} height={80} />
      )}
    </BookScreen>
  );
}

export default garageScreen(JobsScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  strip: { flexDirection: 'row', gap: 6 },
  day: { height: 58, alignItems: 'center', justifyContent: 'center', gap: 1 },
  dayLight: { marginTop: 3 },
  summary: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
}));
