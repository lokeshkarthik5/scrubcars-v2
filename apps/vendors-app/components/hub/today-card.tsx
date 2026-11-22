import { formatClock } from '@repo/core/format';
import { useT, useTn } from '@repo/core/i18n';
import { HubCard, PressRow } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import type { Booking } from '@repo/core/types';
import { View } from 'react-native';

import { istDay, servicesLine, shortName, type TodayView } from '@/lib/jobs';

import { BigFigure, Dim, HubTag } from './parts';

/** Finished today (a cancelled job is not work done), on India's calendar. */
export function completedToday(bookings: readonly Booking[], now: number): number {
  const today = istDay(now);
  return bookings.filter(
    (b) => b.status === 'completed' && istDay(new Date(b.completedAtIso ?? b.scheduledAtIso).getTime()) === today
  ).length;
}

/**
 * Home's "Today" hero (mockup garage-hub 1): the jobs left today large and light, how many
 * are under way, a slim bar of the day's work done, and the next job. Opens Bookings › Today.
 * From the bookings Home has already loaded; `unknown` when they could not be read.
 */
export function TodayCard({
  today,
  done,
  unknown,
  loading,
  onOpen,
}: {
  today: TodayView;
  /** Jobs finished today. */
  done: number;
  unknown: boolean;
  /** The first read is still on its way: a dash, never a guessed 0. */
  loading: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const tn = useTn();
  const blank = unknown || loading;
  const colors = useColors();
  const styles = useStyles();
  const count = today.working.length + today.next.length;
  const total = count + done;
  const share = total > 0 ? done / total : 0;
  const next = today.next[0];

  return (
    <PressRow
      accessibilityLabel={
        unknown ? t("Today's jobs: unknown. Open Today") : t("Today's jobs: {count}. Open Today", { count })
      }
      onPress={onOpen}
    >
      <HubCard style={styles.card}>
        <Dim>{t('Today')}</Dim>
        <View style={styles.row}>
          <View style={styles.figure}>
            <BigFigure size={56}>{blank ? '–' : String(count)}</BigFigure>
            {!blank ? (
              <T size={16} lh={22} color={colors.dim}>
                {tn(count, 'job', 'jobs')}
              </T>
            ) : null}
          </View>
          {today.working.length > 0 ? (
            <HubTag tone="green" dot>
              {t('{count} under way', { count: today.working.length })}
            </HubTag>
          ) : null}
        </View>
        {!blank && total > 0 ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('Done')}
            accessibilityValue={{ min: 0, max: total, now: done }}
            style={styles.track}
          >
            <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
          </View>
        ) : null}
        {next ? (
          <T size={13} lh={18} color={colors.textSecondary} numberOfLines={1}>
            {t('Next: {time} · {who} · {what}', {
              time: formatClock(next.scheduledAtIso),
              who: shortName(next.customerName),
              what: servicesLine(next),
            })}
          </T>
        ) : null}
      </HubCard>
    </PressRow>
  );
}

const useStyles = createStyles((c) => ({
  card: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  track: { height: 6, borderRadius: 999, backgroundColor: c.discStrong, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: c.textPrimary },
}));
