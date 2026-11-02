import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { formatClock, formatRelative } from '@repo/core/format';
import { bookingStatusTone } from '@repo/core/status-tone';
import type { Booking } from '@repo/core/types';
import { type Href, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { changeStatusWithUndo, useDeferredStatus } from '@/lib/deferred-status';
import { cancelledLabel, nextStep, nextStepLabel, shortName, statusLabel } from '@/lib/jobs';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { Label, ScButton } from '@repo/native-ui/button';
import { IconCamera, IconCar, IconChevronRight } from '@repo/native-ui/icons';
import { StatusChip } from '@repo/native-ui/primitives';
import { listServicesLine } from '@/lib/add-on-lines';
import { T } from '@repo/native-ui/text';

/**
 * JobRow (apps/vendors/components/job-row.tsx): one short row per job, the time big
 * down the left edge. On Today it also carries the job's one next step.
 */
export function JobRow({
  booking: b,
  now,
  showStep = false,
  emphasis = false,
}: {
  booking: Booking;
  now: number;
  showStep?: boolean;
  emphasis?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  const deferred = useDeferredStatus(b.id);
  const who = b.customerName || 'the customer';
  const step = showStep && !deferred ? nextStep(b) : null;
  const startsIn = b.status === 'confirmed' ? new Date(b.scheduledAtIso).getTime() - now : null;
  const [clock, meridiem] = formatClock(b.scheduledAtIso).split(' ');
  const dayOff = b.status === 'completed' || b.status === 'cancelled' || b.status === 'rescheduled';
  const open = () => router.push(`/bookings/${b.id}` as Href);
  const stepTint = emphasis ? colors.white : colors.textPrimary;

  return (
    <Pressable
      accessibilityLabel={`Job for ${who}`}
      onPress={open}
      style={[styles.row, emphasis ? styles.emphasis : styles.plain]}
    >
      {emphasis ? <View style={styles.edge} /> : null}
      <View style={styles.top}>
        <View style={styles.clock}>
          <T num size={24} weight={700} lh={24} tracking={-0.025}>
            {clock}
          </T>
          <T num size={14} lh={14} color={colors.textSecondary} style={styles.meridiem}>
            {meridiem}
          </T>
        </View>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <T size={17} weight={600} numberOfLines={1} style={styles.shrink}>
              {shortName(b.customerName)}
            </T>
            <RowChip booking={b} now={now} startsIn={startsIn} deferred={deferred} />
          </View>
          {b.vehicle ? (
            <T size={15} color={colors.textSecondary} numberOfLines={1}>
              {`${b.vehicle.make} ${b.vehicle.model} · `}
              <T num size={15} tracking={0.025} color={colors.textSecondary}>
                {b.vehicle.plate}
              </T>
            </T>
          ) : null}
          <T size={15} color={colors.textSecondary} numberOfLines={1}>
            {`${listServicesLine(b)} · ${BOOKING_TYPE_LABELS[b.bookingType]}`}
          </T>
          {dayOff && b.status !== 'completed' ? (
            <T size={14} color={colors.textSecondary} style={styles.label}>
              {cancelledLabel(b)}
            </T>
          ) : null}
        </View>
        {!step ? (
          <View style={styles.chevron}>
            <IconChevronRight size={20} color={colors.textMuted} />
          </View>
        ) : null}
      </View>

      {step ? (
        <View style={styles.step}>
          {step.kind === 'start' || step.kind === 'complete' ? (
            <ScButton
              variant={emphasis ? 'main' : 'outline'}
              size={emphasis ? 'lg' : 'md'}
              accessibilityLabel={`${nextStepLabel(step)} for ${who}`}
              onPress={() => changeStatusWithUndo(b.id, step.kind === 'start' ? 'in_progress' : 'completed')}
            >
              {nextStepLabel(step)}
            </ScButton>
          ) : step.kind === 'wait' ? (
            <T size={14} color={colors.textSecondary}>
              {step.text}
            </T>
          ) : (
            <ScButton
              variant={emphasis ? 'main' : 'outline'}
              size={emphasis ? 'lg' : 'md'}
              accessibilityLabel={`${nextStepLabel(step)} for ${who}`}
              onPress={open}
            >
              {step.kind === 'photos' ? <IconCamera size={20} color={stepTint} /> : null}
              {step.kind === 'pickup' ? <IconCar size={20} color={stepTint} /> : null}
              <Label color={stepTint}>{nextStepLabel(step)}</Label>
            </ScButton>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const DEFERRED_CHIP: Record<NonNullable<ReturnType<typeof useDeferredStatus>>, string> = {
  confirmed: 'Accepted',
  in_progress: 'In progress',
  completed: 'Done',
  picked_up: 'Picked up',
  at_garage: 'At garage',
  out_for_delivery: 'Out for delivery',
};

function RowChip({
  booking: b,
  now,
  startsIn,
  deferred,
}: {
  booking: Booking;
  now: number;
  startsIn: number | null;
  deferred: ReturnType<typeof useDeferredStatus>;
}) {
  const styles = useStyles();
  if (deferred) {
    return <StatusChip tone={deferred === 'completed' ? 'done' : 'progress'}>{DEFERRED_CHIP[deferred]}</StatusChip>;
  }
  // An accepted job about to start says when, the way a garage plans its next hour.
  if (startsIn !== null && startsIn > 0 && startsIn <= 3 * 60 * 60 * 1000) {
    return (
      <View style={styles.relative}>
        <T num size={13} weight={500} lh={18}>
          {formatRelative(b.scheduledAtIso, now)}
        </T>
      </View>
    );
  }
  return <StatusChip tone={bookingStatusTone(b.status)}>{statusLabel(b)}</StatusChip>;
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  row: {
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: colors.surface,
    padding: 16,
    overflow: 'hidden',
  },
  plain: { borderColor: colors.border },
  emphasis: { borderColor: colors.progressBorder },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.tones.progress.dot },
  top: { flexDirection: 'row', gap: 16 },
  clock: { width: 64 },
  meridiem: { marginTop: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  label: { marginTop: 4 },
  chevron: { alignSelf: 'center', marginTop: 4 },
  step: { marginTop: 12 },
  relative: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineChip,
    paddingHorizontal: 10,
    paddingVertical: 2,
    flexShrink: 0,
  },
}));
