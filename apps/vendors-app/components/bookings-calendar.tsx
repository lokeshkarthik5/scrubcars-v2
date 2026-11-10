import type { Booking } from '@repo/core/types';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CalendarDay } from '@/components/calendar-day';
import { ClosedCard, Dot, Hatch } from '@/components/calendar-parts';
import { JobRow } from '@/components/job-row';
import { devicePrefs } from '@/lib/device-prefs';
import {
  CALENDAR_VIEW_KEY,
  type CalendarView,
  type DaySummary,
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
} from '@/lib/jobs';
import { useGarageCalendar } from '@/lib/use-garage-calendar';
import { IconChevronLeft, IconChevronRight } from '@repo/native-ui/icons';
import { GraphiteSwitch } from '@repo/native-ui/finish';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

const VIEW_LABELS: Record<CalendarView, string> = { month: 'Month', day: 'Day' };

/**
 * BookingsCalendar (apps/vendors/components/bookings-calendar.tsx): Month, a grid
 * of dots per day with the chosen day's jobs under it, and Day, the week strip
 * over a timeline. The last Month / Day choice is kept on this phone.
 */
export function BookingsCalendar({ bookings, now }: { bookings: readonly Booking[]; now: number }) {
  const colors = useColors();
  const styles = useStyles();
  const today = istDateKey(now);
  const [view, setView] = useState<CalendarView>(() => calendarViewFrom(devicePrefs.getItem(CALENDAR_VIEW_KEY)));
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(() => monthOf(today));

  const jobsByDay = useMemo(() => calendarJobs(bookings, now), [bookings, now]);
  const bounds = useMemo(() => monthBounds(jobsByDay.keys(), today), [jobsByDay, today]);
  const grid = useMemo(() => monthGrid(month), [month]);
  const { hours, closures, room } = useGarageCalendar(grid[0]);

  const pickView = useCallback((next: CalendarView) => {
    setView(next);
    devicePrefs.setItem(CALENDAR_VIEW_KEY, next);
  }, []);

  const pickDay = useCallback((day: string) => {
    setSelected(day);
    setMonth(monthOf(day));
  }, []);

  const moveMonth = (by: number) => {
    const next = shiftMonth(month, by);
    setMonth(next);
    setSelected(monthOf(today) === next ? today : firstOfMonth(next));
  };

  const jobs = jobsByDay.get(selected) ?? [];
  const closed = closedDay(selected, hours, closures);

  const viewSwitch = (
    <View style={styles.switch}>
      {/* The small graphite switch, two 59-point halves as the web's: the month stays on one line. */}
      <GraphiteSwitch<CalendarView>
        accessibilityLabel="Calendar view"
        size="sm"
        value={view}
        onChange={pickView}
        style={styles.switchTrack}
        options={(['month', 'day'] as const).map((key) => ({ value: key, label: VIEW_LABELS[key] }))}
      />
    </View>
  );

  return (
    <View accessibilityLabel="Calendar" style={styles.section}>
      {view === 'month' ? (
        <View style={styles.head}>
          <View style={styles.monthNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              accessibilityState={{ disabled: month <= bounds.first }}
              disabled={month <= bounds.first}
              onPress={() => moveMonth(-1)}
              style={[styles.arrow, month <= bounds.first && styles.off]}
            >
              <IconChevronLeft size={20} color={colors.textSecondary} />
            </Pressable>
            <T accessibilityRole="header" size={17} weight={600} align="center" numberOfLines={1} style={styles.monthTitle}>
              {monthTitle(month)}
            </T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              accessibilityState={{ disabled: month >= bounds.last }}
              disabled={month >= bounds.last}
              onPress={() => moveMonth(1)}
              style={[styles.arrow, month >= bounds.last && styles.off]}
            >
              <IconChevronRight size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          {viewSwitch}
        </View>
      ) : (
        <View style={styles.head}>
          <View style={styles.dayTitle}>
            <T accessibilityRole="header" size={18} weight={600}>
              {dayHeading(selected, today)}
            </T>
            <T size={13} color={colors.textSecondary}>
              {daySubtitle(jobs.length, dayHours(selected, hours), closed)}
            </T>
          </View>
          {viewSwitch}
        </View>
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

          <View style={styles.listHead}>
            <T accessibilityRole="header" size={17} weight={600}>
              {dayHeading(selected, today)}
            </T>
            {jobs.length > 0 ? (
              <T num size={14} color={colors.textSecondary}>
                {jobsCount(jobs.length)}
              </T>
            ) : null}
          </View>
          {closed ? <ClosedCard closed={closed} /> : null}
          {jobs.length === 0 && !closed ? (
            <View style={styles.empty}>
              <T size={14} color={colors.textSecondary} align="center">
                {selected < today ? 'Nothing booked on this day.' : 'Nothing booked on this day yet.'}
              </T>
            </View>
          ) : null}
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
    </View>
  );
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
  month: string;
  grid: string[];
  today: string;
  selected: string;
  bounds: { first: string; last: string };
  onPick: (day: string) => void;
  summaryOf: (day: string) => DaySummary;
  closedOn: (day: string) => boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  const rows = Array.from({ length: 6 }, (_, r) => grid.slice(r * 7, r * 7 + 7));
  return (
    <View style={styles.grid}>
      <LinearGradient colors={[colors.cardTop, colors.cardBottom]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {GRID_WEEKDAYS.map((w) => (
          <T key={w} size={12} weight={500} color={colors.textMuted} align="center" style={styles.weekday}>
            {w}
          </T>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map((day) => {
            const inMonth = monthOf(day) === month;
            const reachable = monthOf(day) >= bounds.first && monthOf(day) <= bounds.last;
            const summary = summaryOf(day);
            const closed = closedOn(day);
            const isToday = day === today;
            const isSelected = day === selected;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={dayButtonLabel(day, { today, summary, closed })}
                accessibilityState={{ selected: isSelected, disabled: !reachable }}
                disabled={!reachable}
                onPress={() => onPick(day)}
                style={[
                  styles.cell,
                  isSelected ? styles.cellSelected : isToday ? styles.cellToday : null,
                ]}
              >
                {closed && !isSelected ? <Hatch /> : null}
                <T
                  num
                  size={15}
                  lh={18}
                  weight={isToday || isSelected ? 700 : 500}
                  color={
                    !inMonth
                      ? colors.outlineSoft
                      : closed
                        ? colors.dim
                        : isToday
                          ? colors.tones.new.text
                          : colors.textPrimary
                  }
                >
                  {dayOfMonth(day)}
                </T>
                <View style={styles.dots}>
                  {inMonth ? dayDots(summary).map((kind) => <Dot key={kind} kind={kind} />) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** What the dots and the hatching mean, under the grid. */
function Legend() {
  const colors = useColors();
  const styles = useStyles();
  const item = (key: string, mark: ReactNode, words: string) => (
    <View key={key} style={styles.legendItem}>
      {mark}
      <T size={12} color={colors.textSecondary}>
        {words}
      </T>
    </View>
  );
  return (
    <View style={styles.legend}>
      {item('answer', <Dot kind="answer" size={7} />, 'To answer')}
      {item('accepted', <Dot kind="accepted" size={7} />, 'Accepted')}
      {item('done', <Dot kind="done" size={7} />, 'Done')}
      {item(
        'closed',
        <View style={styles.legendHatch}>
          <Hatch />
        </View>,
        'Closed'
      )}
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  section: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  monthNav: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  // 36 wide (44 tall) so the month stays on one line beside the switch.
  arrow: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.3 },
  monthTitle: { flexShrink: 1 },
  dayTitle: { flex: 1, minWidth: 0, gap: 2, paddingLeft: 4 },
  switch: { flexShrink: 0 },
  switchTrack: { width: 124 },
  grid: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 4,
  },
  row: { flexDirection: 'row', gap: 2 },
  weekday: { flex: 1, paddingVertical: 4 },
  cell: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    overflow: 'hidden',
  },
  cellSelected: { backgroundColor: colors.surfaceElevated, borderColor: colors.outlineSoft },
  cellToday: { borderColor: colors.red },
  dots: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendHatch: { width: 12, height: 9, borderRadius: 3, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  listHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 4, paddingHorizontal: 2 },
  empty: {
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
}));
