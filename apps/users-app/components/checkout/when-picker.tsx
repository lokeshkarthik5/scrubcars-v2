import { useAvailableSlots, useVendorClosures, useVendorWorkingHours } from '@repo/core/api/hooks/use-slots';
import { BOOKING_DAYS_AHEAD, meetsNotice, noticeSentence } from '@repo/core/booking-types';
import { formatClock } from '@repo/core/format';
import { useNow } from '@repo/core/hooks/use-now';
import { useT } from '@repo/core/i18n';
import type { BookingType } from '@repo/core/types';
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight } from '@repo/native-ui/icons';
import { Rise } from '@repo/native-ui/motion';
import { Skeleton } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { PickButton } from './pick-button';

import {
  addDaysToKey,
  dateChipOf,
  DAYS,
  firstOpenDayAfter,
  istToday,
  MONTHS,
  type SlotDayState,
  slotTaken,
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
  title,
  renderDayExtra,
  onTaken,
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
  /** The chosen time is no longer on its day's list (a card's Next free time, just taken). */
  onTaken?: (scheduledAt: string) => void;
}) {
  const t = useT();
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

  // A time chosen before the day's list was known, gone from it once it is: let it go.
  // Read against the day's whole list, not the notice-filtered one: a time that has only
  // become too soon is the lapse path's to clear, with its own reason, and nobody took it.
  const dayTimes = selectedDate && slotsQuery.isSuccess && !slotsLoading ? (slotsQuery.data?.slots ?? []).map((slot) => slot.time) : null;
  const taken = Boolean(onTaken) && slotTaken(value, selectedDate, dayTimes);
  useEffect(() => {
    if (!taken || !value) return;
    onChange(null);
    onTaken?.(value);
  }, [taken, value, onChange, onTaken]);

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
    // Today/weekday over the date, graphite with the red light once picked (§6, bk-pick).
    return (
      <PickButton
        key={date}
        on={on && !closed}
        disabled={closed}
        accessibilityLabel={accessible}
        onPress={() => selectDate(date)}
        style={styles.day}
      >
        <T variant="t5" color={closed ? colors.textMuted : on ? colors.textSecondary : colors.dim}>
          {label}
        </T>
        <T num size={17} weight={600} lh={22} color={closed ? colors.textMuted : colors.textPrimary}>
          {sub}
        </T>
      </PickButton>
    );
  };

  const daysInMonth = new Date(Date.UTC(calMonth.year, calMonth.month + 1, 0)).getUTCDate();
  const pad = new Date(Date.UTC(calMonth.year, calMonth.month, 1)).getUTCDay();

  return (
    <View>
      <T variant="t2" style={styles.title}>
        {title ?? t('When?')}
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.days} contentContainerStyle={styles.daysRow}>
        {!daysKnown
          ? week.map((d) => (
              <View key={d.value} style={styles.dayGhost}>
                <Skeleton height={60} radius={16} />
              </View>
            ))
          : week.map((d, i) =>
              chip(d.value, i === 0 ? t('Today') : d.dayName, String(d.day), `${i === 0 ? `${t('Today')}, ` : ''}${d.dayName} ${d.day} ${d.monthName}${i === 1 ? `, ${t('tomorrow')}` : ''}`)
            )}
        {customDate
          ? chip(
              customDate,
              dateChipOf(customDate).dayName,
              String(dateChipOf(customDate).day),
              `${dateChipOf(customDate).dayName} ${dateChipOf(customDate).day} ${dateChipOf(customDate).monthName}`
            )
          : null}
        <PickButton
          on={false}
          accessibilityLabel={t('Pick a later date')}
          onPress={() => {
            const [y, m] = (customDate ?? calendarMin).split('-').map(Number);
            setCalMonth({ year: y, month: m - 1 });
            setShowCalendar(true);
          }}
          style={styles.day}
        >
          <T variant="t5" color={colors.dim}>
            {t('More')}
          </T>
          <IconCalendar size={18} color={colors.textPrimary} />
        </PickButton>
      </ScrollView>

      {selectedDate ? (
        <>
          <T size={13} lh={18} color={colors.dim} style={styles.note}>
            {autoPick ? `${t('Earliest first.')} ` : ''}
            {noticeSentence(bookingType, { atLeast: false })}
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
                  ? t("This garage isn't taking changes right now. Your booking stays at its current time, or you can cancel it.")
                  : t("This garage isn't taking new bookings right now.")
                : isHoliday
                  ? t('The garage is closed for a holiday on this day. Pick another day.')
                  : isClosedDay
                    ? t('The garage is closed on this day. Pick another day.')
                    : tooLongForTheDay
                      ? t("These services need more time than this garage's day allows. Remove one, or pick another day.")
                      : allBooked
                        ? t('All times on this day are booked. Pick another day.')
                        : t('No times left on this day. {notice} Pick another day.', { notice: noticeSentence(bookingType) })}
            </T>
          ) : (
            <>
              <View style={styles.grid}>
                {/* The times slide in, one after another, each time the day changes. */}
                {shown.map((time, i) => {
                  const on = value === time;
                  return (
                    <Rise key={`${selectedDate}-${time}`} index={i} style={styles.cell}>
                      <PickButton on={on} accessibilityLabel={formatClock(time)} onPress={() => onChange(time)} style={styles.time}>
                        <T num variant="t3" weight={600} color={colors.textPrimary}>
                          {formatClock(time)}
                        </T>
                      </PickButton>
                    </Rise>
                  );
                })}
              </View>
              {collapse ? (
                <PickButton on={false} onPress={() => setShowLater(true)} style={styles.more}>
                  <T variant="t4" weight={600}>
                    {t('Show afternoon and evening')}
                  </T>
                  <IconChevronDown size={15} color={colors.textPrimary} />
                </PickButton>
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

      <ScSheet horizontalPadding={16} open={showCalendar} onClose={() => setShowCalendar(false)} accessibilityLabel={t('Pick a date')}>
        <View style={styles.calHead}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Previous month')}
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
            accessibilityLabel={t('Next month')}
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
  day: { minHeight: 60, minWidth: 54, gap: 2 },
  dayGhost: { width: 54 },
  dayClosed: { borderColor: 'transparent', backgroundColor: c.fillFaint, opacity: 0.5 },
  dayOn: { borderColor: 'transparent', backgroundColor: c.chosenBg },
  dayIdle: { borderColor: c.line, backgroundColor: c.fillSoft },
  note: { marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.8%' },
  time: { minHeight: 48 },
  more: { alignSelf: 'center', marginTop: 8, minHeight: 44, flexDirection: 'row', gap: 4, paddingHorizontal: 14 },
  calHead: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calArrow: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  calWeek: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  calDay: { height: 44, width: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  calOff: { opacity: 0.3 },
}));
