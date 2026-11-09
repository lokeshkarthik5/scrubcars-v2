import { useNow } from '@repo/core/hooks/use-now';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, type ScrollView, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { GarageStatus } from '@/components/garage-status';
import {
  IconAlarm,
  IconCalendarCheck,
  IconCalendarEvent,
  IconChevronRight,
  IconCircleCheck,
  IconInbox,
} from '@repo/native-ui/icons';
import { JobRow } from '@/components/job-row';
import { NewBookingCard } from '@/components/new-booking-card';
import { CountBadge, EmptyState, LoadError, ScSegmented, SkeletonList } from '@repo/native-ui/primitives';
import { PushBanner } from '@/components/push-banner';
import { T } from '@repo/native-ui/text';
import {
  calendarDate,
  doneJobs,
  laterDays,
  LIST_TABS,
  type ListTab,
  sortByUrgency,
  tabFromQuery,
  todayView,
  waitingSummary,
} from '@/lib/jobs';
import { createStyles, useColors } from '@repo/native-ui/theme';
import type { Tokens } from '@repo/native-ui/tokens';
import { useVendorBookings } from '@/lib/use-vendor-bookings';
import { fill, msg, useT, useTn } from '@repo/core/i18n';

const TAB_LABELS: Record<ListTab, string> = {
  today: msg('Today'),
  new: msg('New'),
  later: msg('Later'),
  done: msg('Done'),
};

const emptyStates = (colors: Tokens): Record<ListTab, { icon: ReactNode; title: string; subtitle: string }> => ({
  today: {
    icon: <IconCalendarCheck size={28} stroke={1.5} color={colors.textMuted} />,
    title: msg('Nothing on today'),
    subtitle: msg('Jobs you accept for today show here, in time order.'),
  },
  new: {
    icon: <IconInbox size={28} stroke={1.5} color={colors.textMuted} />,
    title: msg('No new bookings'),
    subtitle: msg('New requests from customers show up here for you to accept.'),
  },
  later: {
    icon: <IconCalendarEvent size={28} stroke={1.5} color={colors.textMuted} />,
    title: msg('Nothing later'),
    subtitle: msg('Jobs you accept for another day wait here.'),
  },
  done: {
    icon: <IconCircleCheck size={28} stroke={1.5} color={colors.textMuted} />,
    title: msg('Nothing done yet'),
    subtitle: msg('Finished jobs, and bookings that were cancelled, are kept here.'),
  },
});

/** apps/vendors/app/bookings/page.tsx, in its order. */
function BookingsScreen() {
  const t = useT();
  const tn = useTn();
  const colors = useColors();
  const styles = useStyles();
  const params = useLocalSearchParams<{ tab?: string; job?: string }>();
  // The list follows ?tab= whenever it changes (a link or a notification while
  // it is open), including the server's old names; a tap sets it at once.
  const queryTab = tabFromQuery(params.tab ?? null) ?? 'today';
  const [tab, setTab] = useState<ListTab>(queryTab);
  const [seenQueryTab, setSeenQueryTab] = useState(queryTab);
  if (queryTab !== seenQueryTab) {
    setSeenQueryTab(queryTab);
    setTab(queryTab);
  }
  const { bookings, loaded, failed, retrying, reload } = useVendorBookings();
  const now = useNow(10_000);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const listTop = useRef(0);
  const cardTops = useRef(new Map<string, number>());
  const [laidOut, setLaidOut] = useState(0);

  // A notification for an accepted job opens that job's page; one for a new
  // booking opens New, scrolled to it. Once per job named.
  const handledJob = useRef<string | null>(null);
  const jobId = params.job;
  useEffect(() => {
    if (!jobId || handledJob.current === jobId) return;
    const job = bookings.find((b) => b.id === jobId);
    if (job && job.status !== 'pending') {
      handledJob.current = jobId;
      router.replace(`/bookings/${jobId}` as Href);
      return;
    }
    const top = cardTops.current.get(jobId);
    if (top === undefined) return;
    handledJob.current = jobId;
    scroll.current?.scrollTo({ y: listTop.current + top - 16, animated: false });
  }, [bookings, jobId, tab, laidOut]);

  const pending = useMemo(
    () =>
      sortByUrgency(
        bookings.filter((b) => b.status === 'pending'),
        now
      ),
    [bookings, now]
  );
  const waiting = useMemo(() => waitingSummary(pending, now), [pending, now]);
  const today = useMemo(() => todayView(bookings, now), [bookings, now]);
  const later = useMemo(() => laterDays(bookings, now), [bookings, now]);
  const done = useMemo(() => doneJobs(bookings), [bookings]);

  const unknown = failed && bookings.length === 0;
  const counts: Record<ListTab, number> = {
    today: today.working.length + today.next.length,
    new: waiting.count,
    later: later.reduce((sum, group) => sum + group.jobs.length, 0),
    done: done.length,
  };

  const pickTab = useCallback((next: ListTab) => {
    setTab(next);
    router.setParams({ tab: next });
  }, []);

  const isEmpty =
    tab === 'today'
      ? counts.today === 0
      : tab === 'new'
        ? pending.length === 0
        : tab === 'later'
          ? counts.later === 0
          : counts.done === 0;

  return (
    <AppShell showBrand brandRight={<GarageStatus />} gap={16} scrollRef={scroll}>
      <PushBanner />

      <ScSegmented
        accessibilityLabel={t('Bookings')}
        value={tab}
        onChange={pickTab}
        options={LIST_TABS.map((key) => ({
          value: key,
          label:
            key === 'new' && !unknown && waiting.count > 0 ? (
              <>
                <T size={16} weight={500} color={tab === key ? colors.textPrimary : colors.textSecondary}>
                  {t(TAB_LABELS[key])}
                </T>
                <CountBadge count={waiting.count} small />
              </>
            ) : (
              t(TAB_LABELS[key])
            ),
        }))}
      />

      {tab !== 'new' && waiting.count > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => pickTab('new')} style={styles.strip}>
          <IconAlarm size={22} color={colors.red} />
          <T size={16} lh={22} style={styles.flex}>
            {tn(waiting.count, '{count} booking to answer', '{count} bookings to answer')}
            {waiting.soonestMs !== null ? (
              <>
                {' · '}
                {fill(waiting.count > 1 ? t('{time} left on one') : t('{time} left'), {
                  time: (
                    <T num size={16} weight={600} lh={22} color={colors.warning}>
                      {`${Math.max(1, Math.ceil(waiting.soonestMs / 60_000))} min`}
                    </T>
                  ),
                })}
              </>
            ) : null}
          </T>
          <IconChevronRight size={20} color={colors.textSecondary} />
        </Pressable>
      ) : null}

      <View
        style={styles.list}
        onLayout={(event) => {
          listTop.current = event.nativeEvent.layout.y;
        }}
      >
        {!loaded && bookings.length === 0 ? (
          <SkeletonList count={3} height={112} />
        ) : unknown ? (
          <LoadError what={t('your bookings')} onRetry={reload} retrying={retrying} />
        ) : isEmpty ? (
          <>
            <EmptyState
              icon={emptyStates(colors)[tab].icon}
              title={t(emptyStates(colors)[tab].title)}
              subtitle={t(emptyStates(colors)[tab].subtitle)}
            />
            {tab === 'today' && today.tomorrow > 0 ? (
              <TomorrowRow count={today.tomorrow} onOpen={() => pickTab('later')} />
            ) : null}
          </>
        ) : tab === 'today' ? (
          <>
            {today.working.length > 0 ? (
              <View style={styles.list}>
                <View style={styles.nowHead}>
                  <T accessibilityRole="header" size={17} weight={600}>
                    {t('Now')}
                  </T>
                  <T num size={14} color={colors.textSecondary}>
                    {calendarDate(now)}
                  </T>
                </View>
                {today.working.map((b) => (
                  <JobRow key={b.id} booking={b} now={now} showStep emphasis />
                ))}
              </View>
            ) : null}
            {today.next.length > 0 ? (
              <View style={styles.list}>
                <T accessibilityRole="header" size={17} weight={600}>
                  {t('Next')}
                </T>
                {today.next.map((b) => (
                  <JobRow key={b.id} booking={b} now={now} showStep />
                ))}
              </View>
            ) : null}
            {today.tomorrow > 0 ? <TomorrowRow count={today.tomorrow} onOpen={() => pickTab('later')} /> : null}
          </>
        ) : tab === 'new' ? (
          pending.map((b) => (
            <NewBookingCard
              key={b.id}
              booking={b}
              now={now}
              onChanged={reload}
              onLayout={(event) => {
                cardTops.current.set(b.id, event.nativeEvent.layout.y);
                setLaidOut((n) => n + 1);
              }}
            />
          ))
        ) : tab === 'later' ? (
          later.map((group) => (
            <View key={group.day} accessibilityLabel={t(group.day)} style={styles.list}>
              <T accessibilityRole="header" size={17} weight={600}>
                {t(group.day)}
              </T>
              {group.jobs.map((b) => (
                <JobRow key={b.id} booking={b} now={now} />
              ))}
            </View>
          ))
        ) : (
          done.map((b) => <JobRow key={b.id} booking={b} now={now} />)
        )}
      </View>
    </AppShell>
  );
}

/** Tomorrow, folded into one row that opens Later. */
function TomorrowRow({ count, onOpen }: { count: number; onOpen: () => void }) {
  const tn = useTn();
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.tomorrow}>
      <T size={17}>
        {fill(tn(count, 'Tomorrow · {num} job', 'Tomorrow · {num} jobs'), {
          num: (
            <T num size={17}>
              {count}
            </T>
          ),
        })}
      </T>
      <IconChevronRight size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

export default garageScreen(BookingsScreen);

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  strip: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.redBorder,
    backgroundColor: colors.redWash,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  list: { gap: 12 },
  nowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  tomorrow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
}));
