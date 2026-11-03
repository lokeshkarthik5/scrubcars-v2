import { useAvailableSlots, useVendorClosures, useVendorWorkingHours } from '@repo/core/api/hooks/use-slots';
import { BOOKING_DAYS_AHEAD, meetsNotice, noticeSentence } from '@repo/core/booking-types';
import { formatClock } from '@repo/core/format';
import { useNow } from '@repo/core/hooks/use-now';
import type { BookingType } from '@repo/core/types';
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight } from '@repo/native-ui/icons';
import { Skeleton } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  addDaysToKey,
  dateChipOf,
  DAYS,
  firstOpenDayAfter,
  istToday,
  MONTHS,
  type SlotDayState,
  splitByMorning,
  weekOf,
} from '@/lib/when-picker';

const AUTO_PICK_DAYS = BOOKING_DAYS_AHEAD;

/** WhenPicker (apps/users/components/checkout/when-picker.tsx). */
export function WhenPicker({
  vendorId,
  serviceIds,
  value,
  onChange,
  bookingType,
  onLapse,
  autoPick = false,
  rescheduleOf,
  initialDate = null,
  title = 'When?',
  renderDayExtra,
}: {
  vendorId: string;
  serviceIds: string[];
  value: string | null;
  onChange: (scheduledAt: string | null) => void;
  bookingType: BookingType;
  onLapse?: (scheduledAt: string) => void;
  autoPick?: boolean;
  rescheduleOf?: string;
  initialDate?: string | null;
  title?: string;
  renderDayExtra?: (state: SlotDayState) => ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  const now = useNow();
  const today = istToday(now);
  const week = weekOf(today, BOOKING_DAYS_AHEAD);
  const calendarMin = addDaysToKey(week[week.length - 1].value, 1);
  const linkedDate = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && initialDate >= today ? initialDate : null;
  const [chosenDate, setChosenDate] = useState<string | null>(linkedDate ?? (autoPick ? null : today));
  const [autoDate, setAutoDate] = useState<string | null>(null);
  const [autoTries, setAutoTries] = useState(0);
  const [customDate, setCustomDate] = useState<string | null>(linkedDate && linkedDate >= calendarMin ? linkedDate : null);
  const [showLater, setShowLater] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const [y, m] = calendarMin.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  const workingHours = useVendorWorkingHours(vendorId);
  const closures = useVendorClosures(vendorId);
  const closedDays = useMemo(
    () => new Set((workingHours.data ?? []).filter((h) => h.isClosed).map((h) => h.dayOfWeek)),
    [workingHours.data]
  );
  const holidays = useMemo(() => new Set(closures.data ?? []), [closures.data]);
  const isDayClosed = (date: string) => closedDays.has(dateChipOf(date).dayOfWeek) || holidays.has(date);
  const daysKnown = !workingHours.isPending && !closures.isPending;

  if (autoPick && !chosenDate && autoDate === null && daysKnown) {
    const first = firstOpenDayAfter(today, -1, isDayClosed, AUTO_PICK_DAYS);
    if (first) setAutoDate(first);
  }

  const selectedDate = chosenDate ?? autoDate;
  const slotsQuery = useAvailableSlots({ vendorId, serviceIds, date: selectedDate, bookingType, rescheduleOf });
  const slots = (slotsQuery.data?.slots ?? []).filter((slot) => meetsNotice(slot.time, bookingType, now));
  const isClosedDay = slotsQuery.data?.isClosed ?? false;
  const isHoliday = slotsQuery.data?.closedReason === 'holiday';
  const isPaused = slotsQuery.data?.paused ?? false;
  const allBooked = slotsQuery.data?.allBooked ?? false;
  const tooLongForTheDay = !isClosedDay && !isPaused && slotsQuery.isSuccess && !slotsQuery.data.fitsInDay;
  const slotsLoading = serviceIds.length === 0 || (Boolean(selectedDate) && slotsQuery.isPending);

  if (!chosenDate && autoDate && slotsQuery.isSuccess && slots.length === 0 && !isPaused && !tooLongForTheDay && autoTries < AUTO_PICK_DAYS) {
    const next = firstOpenDayAfter(autoDate, 0, isDayClosed, AUTO_PICK_DAYS);
    if (next && next <= week[week.length - 1].value) {
      setAutoDate(next);
      setAutoTries(autoTries + 1);
    }
  }

  useEffect(() => {
    if (value && !meetsNotice(value, bookingType, now)) {
      onChange(null);
      onLapse?.(value);
    }
  }, [value, bookingType, now, onChange, onLapse]);

  const selectDate = (date: string) => {
    setChosenDate(date);
    setShowLater(false);
    onChange(null);
  };

  const { morning, later } = splitByMorning(slots.map((slot) => slot.time));
  const collapse = morning.length > 0 && later.length > 0 && !showLater && !(value && later.includes(value));
  const shown = collapse ? morning : slots.map((slot) => slot.time);

  const chip = (date: string, label: string, sub: string, accessible: string) => {
    const closed = isDayClosed(date);
    const on = selectedDate === date;
    return (
      <Pressable
        key={date}
        accessibilityRole="button"
        accessibilityLabel={accessible}
        accessibilityState={{ selected: on, disabled: closed }}
        disabled={closed}
        onPress={() => selectDate(date)}
        style={[styles.day, closed ? styles.dayClosed : on ? styles.dayOn : styles.dayIdle]}
      >
        <T size={12} lh={16} color={on && !closed ? colors.chosenText : closed ? colors.textMuted : colors.dim}>
          {label}
        </T>
        <T num size={17} weight={500} lh={22} color={closed ? colors.textMuted : on ? colors.chosenText : colors.textPrimary}>
          {sub}
        </T>
      </Pressable>
    );
  };

  const daysInMonth = new Date(Date.UTC(calMonth.year, calMonth.month + 1, 0)).getUTCDate();
  const pad = new Date(Date.UTC(calMonth.year, calMonth.month, 1)).getUTCDay();

  return (
    <View>
      <T size={17} weight={500} lh={24} style={styles.title}>
        {title}
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.days} contentContainerStyle={styles.daysRow}>
        {!daysKnown
          ? week.map((d) => (
              <View key={d.value} style={styles.dayGhost}>
                <Skeleton height={60} radius={16} />
              </View>
            ))
          : week.map((d, i) =>
              chip(d.value, i === 0 ? 'Today' : d.dayName, String(d.day), `${i === 0 ? 'Today, ' : ''}${d.dayName} ${d.day} ${d.monthName}${i === 1 ? ', tomorrow' : ''}`)
            )}
        {customDate
          ? chip(
              customDate,
              dateChipOf(customDate).dayName,
              String(dateChipOf(customDate).day),
              `${dateChipOf(customDate).dayName} ${dateChipOf(customDate).day} ${dateChipOf(customDate).monthName}`
            )
          : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick a later date"
          onPress={() => {
            const [y, m] = (customDate ?? calendarMin).split('-').map(Number);
            setCalMonth({ year: y, month: m - 1 });
            setShowCalendar(true);
          }}
          style={[styles.day, styles.dayIdle]}
        >
          <T size={12} lh={16} color={colors.dim}>
            More
          </T>
          <IconCalendar size={18} stroke={1.5} color={colors.textPrimary} />
        </Pressable>
      </ScrollView>

      {selectedDate ? (
        <>
          <T size={13} lh={18} color={colors.dim} style={styles.note}>
            {autoPick ? 'Earliest first. ' : ''}
            {noticeSentence(bookingType).replace(' at least', '')}
          </T>
          {slotsLoading ? (
            <View style={styles.grid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.cell}>
                  <Skeleton height={48} radius={14} />
                </View>
              ))}
            </View>
          ) : slots.length === 0 ? (
            <T size={13} lh={18} color={colors.textSecondary}>
              {isPaused
                ? rescheduleOf
                  ? "This garage isn't taking changes right now. Your booking stays at its current time, or you can cancel it."
                  : "This garage isn't taking new bookings right now."
                : isHoliday
                  ? 'The garage is closed for a holiday on this day. Pick another day.'
                  : isClosedDay
                    ? 'The garage is closed on this day. Pick another day.'
                    : tooLongForTheDay
                      ? "These services need more time than this garage's day allows. Remove one, or pick another day."
                      : allBooked
                        ? 'All times on this day are booked. Pick another day.'
                        : `No times left on this day. ${noticeSentence(bookingType)} Pick another day.`}
            </T>
          ) : (
            <>
              <View style={styles.grid}>
                {shown.map((time) => {
                  const on = value === time;
                  return (
                    <Pressable
                      key={time}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => onChange(time)}
                      style={[styles.cell, styles.time, on ? styles.dayOn : styles.dayIdle]}
                    >
                      <T num size={15} weight={on ? 500 : 400} lh={20} color={on ? colors.chosenText : colors.textPrimary}>
                        {formatClock(time)}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
              {collapse ? (
                <Pressable accessibilityRole="button" onPress={() => setShowLater(true)} style={styles.more}>
                  <T size={13} lh={18}>
                    Show afternoon and evening
                  </T>
                  <IconChevronDown size={15} stroke={1.5} color={colors.textPrimary} />
                </Pressable>
              ) : null}
            </>
          )}
          {!slotsLoading && slotsQuery.isSuccess
            ? renderDayExtra?.({
                date: selectedDate,
                slots: slots.map((slot) => slot.time),
                allBooked,
                unavailable: isPaused || isClosedDay || tooLongForTheDay,
              })
            : null}
        </>
      ) : null}

      <ScSheet horizontalPadding={16} open={showCalendar} onClose={() => setShowCalendar(false)} accessibilityLabel="Pick a date">
        <View style={styles.calHead}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => setCalMonth((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}
            style={styles.calArrow}
          >
            <IconChevronLeft size={20} color={colors.textSecondary} />
          </Pressable>
          <T size={15} weight={500} lh={20}>
            {`${MONTHS[calMonth.month]} ${calMonth.year}`}
          </T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => setCalMonth((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}
            style={styles.calArrow}
          >
            <IconChevronRight size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.calWeek}>
          {DAYS.map((d) => (
            <View key={d} style={styles.calCell}>
              <T size={12} lh={16} color={colors.textMuted} align="center">
                {d[0]}
              </T>
            </View>
          ))}
        </View>
        <View style={styles.calWeek}>
          {Array.from({ length: pad }).map((_, i) => (
            <View key={`pad-${i}`} style={styles.calCell} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const key = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
            const disabled = key < calendarMin || isDayClosed(key);
            const on = key === customDate;
            return (
              <View key={key} style={styles.calCell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedDate === key, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    setCustomDate(key);
                    selectDate(key);
                    setShowCalendar(false);
                  }}
                  style={[styles.calDay, on && styles.dayOn, disabled && styles.calOff]}
                >
                  <T num size={15} weight={on ? 500 : 400} lh={20} color={on ? colors.chosenText : disabled ? colors.textMuted : colors.textPrimary}>
                    {String(i + 1)}
                  </T>
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScSheet>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  title: { marginBottom: 12 },
  days: { marginHorizontal: -16, marginBottom: 12 },
  daysRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  day: { minHeight: 60, minWidth: 54, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayGhost: { width: 54 },
  dayClosed: { borderColor: 'transparent', backgroundColor: c.fillFaint, opacity: 0.5 },
  dayOn: { borderColor: 'transparent', backgroundColor: c.chosenBg },
  dayIdle: { borderColor: c.line, backgroundColor: c.fillSoft },
  note: { marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.8%' },
  time: { minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  more: { alignSelf: 'center', marginTop: 4, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 },
  calHead: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calArrow: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  calWeek: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  calDay: { height: 44, width: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  calOff: { opacity: 0.3 },
}));
