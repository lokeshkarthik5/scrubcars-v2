import { getProposalSlots, suggestTimes, withdrawTimeProposal } from '@repo/core/api/bookings';
import { formatClock, formatWhen } from '@repo/core/format';
import { bookingDayLabel, istDateKey } from '@repo/core/home-display';
import type { Booking } from '@repo/core/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, type StyleProp, View, type ViewStyle } from 'react-native';

import { createStyles, useColors } from '@repo/native-ui/theme';

import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconCalendarQuestion } from '@repo/native-ui/icons';
import { ScTextarea } from '@repo/native-ui/inputs';
import { Spinner } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { fill, useT } from '@repo/core/i18n';

/** Mirrors the server (lib/time-proposals.ts) so the sheet refuses first. */
const MAX_TIMES = 3;
const NOTE_MAX = 200;
const DAYS_AHEAD = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const timeLabel = (iso: string) => formatWhen(iso);

function dayKeys(from: Date): string[] {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => istDateKey(new Date(from.getTime() + i * DAY_MS)));
}

/** "Sat 17 Oct" from an IST day key (noon IST, so the label never slips a day). */
const dayChipLabel = (key: string) => bookingDayLabel(`${key}T06:30:00.000Z`);

/** SuggestTimes (apps/vendors/components/suggest-times.tsx): the button, or what was offered. */
export function SuggestTimes({
  booking,
  onChanged,
  style,
}: {
  booking: Booking;
  onChanged: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const proposal = booking.timeProposal?.status === 'open' ? booking.timeProposal : null;
  const ranOut = booking.status === 'pending' && booking.timeProposal?.status === 'expired';
  const who = booking.customerName ?? t('the customer');
  const [open, setOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const handleWithdraw = async () => {
    if (withdrawing) return;
    setWithdrawing(true);
    try {
      await withdrawTimeProposal(booking.id);
      toast.success(t('Suggested times withdrawn. Accept or reject the booking as usual.'));
    } catch (error) {
      toast.error(errorText(error, t('Could not withdraw the times')));
    } finally {
      setWithdrawing(false);
      onChanged();
    }
  };

  if (proposal) {
    return (
      <View style={[styles.waiting, style]}>
        <View style={styles.waitingHead}>
          <IconCalendarQuestion size={18} stroke={1.5} />
          <T size={15} weight={500} style={styles.flex}>{t('Waiting for {who} to pick a time', { who })}</T>
        </View>
        <View style={styles.options}>
          {proposal.options.map((option) => (
            <T key={option} num size={15} color={colors.textSecondary}>
              {timeLabel(option)}
            </T>
          ))}
        </View>
        <T size={13} color={colors.textSecondary}>
          {t("If {who} doesn't pick one by {time}, the booking is cancelled and refunded in full.", {
            who,
            time: timeLabel(proposal.expiresAt),
          })}
        </T>
        <ScButton
          variant="outline"
          disabled={withdrawing}
          onPress={handleWithdraw}
          accessibilityLabel={t('Withdraw suggested times for {who}', { who })}
        >
          {withdrawing ? t('Withdrawing…') : t('Withdraw times')}
        </ScButton>
      </View>
    );
  }

  if (ranOut) {
    return (
      <T size={15} color={colors.textSecondary}>
        {t("{who} didn't pick one of your times in time, so this booking is being cancelled and refunded.", { who })}
      </T>
    );
  }

  if (!booking.canSuggestTimes) return null;

  return (
    <>
      <ScButton
        variant="outline"
        onPress={() => setOpen(true)}
        accessibilityLabel={t('Other time: suggest another time for {who}', { who })}
        style={style}
      >
        {t('Other time')}
      </ScButton>
      {open ? (
        <SuggestTimesSheet
          booking={booking}
          onClose={() => setOpen(false)}
          onSent={() => {
            setOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function SuggestTimesSheet({
  booking,
  onClose,
  onSent,
}: {
  booking: Booking;
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const who = booking.customerName ?? t('the customer');
  const [days] = useState(() => {
    const booked = new Date(booking.scheduledAtIso);
    return dayKeys(booked.getTime() > Date.now() ? booked : new Date());
  });
  const [day, setDay] = useState(days[0]);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const times = useQuery({
    queryKey: ['proposal-slots', booking.id, day],
    queryFn: () => getProposalSlots(booking.id, day),
    // Always the garage's room as it is now.
    staleTime: 0,
    retry: false,
  });
  const slots = times.data?.slots ?? null;
  const dayNote = times.error
    ? times.error instanceof Error
      ? times.error.message
      : t('Could not load the times')
    : !times.data
      ? null
      : times.data.paused
        ? t("You've paused new bookings, so there are no times to offer.")
        : times.data.isClosed
          ? t('Closed this day.')
          : times.data.slots.length === 0
            ? times.data.allBooked
              ? t('Every time this day is booked up.')
              : t('No times left this day.')
            : null;

  const toggle = (time: string) =>
    setPicked((current) =>
      current.includes(time)
        ? current.filter((t) => t !== time)
        : current.length >= MAX_TIMES
          ? current
          : [...current, time]
    );

  const handleSend = async () => {
    if (picked.length === 0 || sending) return;
    setSending(true);
    try {
      await suggestTimes(booking.id, picked, note.trim() || undefined);
      toast.success(t('Times sent. {who} picks one in the Detlio app.', { who }));
      onSent();
    } catch (error) {
      toast.error(errorText(error, t('Could not send the times')));
    } finally {
      setSending(false);
    }
  };

  return (
    <ScSheet
      open
      onClose={onClose}
      dismissible={!sending}
      accessibilityLabel={t('Suggest another time for {who}', { who })}
      horizontalPadding={16}
    >
      <T accessibilityRole="header" size={16} weight={600}>
        {t('Suggest another time')}
      </T>
      <T size={14} color={colors.textSecondary} style={styles.mt1}>
        {t("Can't do {time}? Pick up to {max} times you can do. {who} picks one in the app and it's booked straight away.", {
          time: timeLabel(booking.scheduledAtIso),
          max: MAX_TIMES,
          who,
        })}
      </T>

      <Eyebrow>{t('Day')}</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow} style={styles.mt2}>
        {days.map((key) => (
          <Chip key={key} label={dayChipLabel(key)} selected={key === day} onPress={() => setDay(key)} />
        ))}
      </ScrollView>

      <Eyebrow>{t('Time')}</Eyebrow>
      <View style={styles.timeRow}>
        {slots === null && !dayNote ? (
          <Spinner />
        ) : dayNote ? (
          <T size={12} color={colors.textSecondary}>
            {dayNote}
          </T>
        ) : (
          (slots ?? []).map((slot) => (
            <Chip
              key={slot.time}
              label={formatClock(slot.time)}
              selected={picked.includes(slot.time)}
              disabled={!picked.includes(slot.time) && picked.length >= MAX_TIMES}
              onPress={() => toggle(slot.time)}
            />
          ))
        )}
      </View>

      {picked.length > 0 ? (
        <View>
          <T size={11} weight={500} tracking={0.025} uppercase color={colors.textSecondary} style={styles.mt4}>
            {fill(t('Offering {count} of {max}', { max: MAX_TIMES }), {
              count: (
                <T num size={11} weight={500} color={colors.textSecondary}>
                  {picked.length}
                </T>
              ),
            })}
          </T>
          <View style={styles.offered}>
            {[...picked].sort().map((time) => (
              <T key={time} num size={13}>
                {timeLabel(time)}
              </T>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.mt4}>
        <ScTextarea
          label={t('Note for the customer (optional)')}
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          onChangeText={setNote}
        />
      </View>

      <T size={13} color={colors.textSecondary} style={styles.mt3}>
        {t("If {who} doesn't answer in time (at most 12 hours), the booking is cancelled and refunded in full.", { who })}
      </T>

      <View style={styles.actions}>
        <View style={styles.flex}>
          <ScButton variant="outline" size="lg" disabled={sending} onPress={onClose}>
            {t('Cancel')}
          </ScButton>
        </View>
        <View style={styles.flex}>
          <ScButton
            variant="main"
            size="lg"
            disabled={picked.length === 0 || sending}
            disabledReason={picked.length === 0 && !sending ? t('Pick at least one time') : undefined}
            onPress={handleSend}
          >
            {sending ? t('Sending…') : picked.length > 1 ? t('Send {count} times', { count: picked.length }) : t('Send time')}
          </ScButton>
        </View>
      </View>
    </ScSheet>
  );
}

function Eyebrow({ children }: { children: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <T size={11} weight={500} tracking={0.025} uppercase color={colors.textSecondary} style={styles.mt4}>
      {children}
    </T>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  waiting: { gap: 8 },
  waitingHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  options: { gap: 2 },
  mt1: { marginTop: 4 },
  mt2: { marginTop: 8, flexGrow: 0 },
  mt3: { marginTop: 12 },
  mt4: { marginTop: 16 },
  dayRow: { gap: 8, paddingBottom: 4 },
  timeRow: { marginTop: 8, minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
  offered: { marginTop: 4, gap: 2 },
  actions: { marginTop: 20, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
}));
