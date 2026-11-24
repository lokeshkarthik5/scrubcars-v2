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
import { IconCamera, IconCar } from '@repo/native-ui/icons';
import { HubCard } from '@repo/native-ui/primitives';
import { CarLine, HubTag, type TagTone } from './hub/parts';
import { listServicesLine } from '@/lib/add-on-lines';
import { T } from '@repo/native-ui/text';
import { msg, useT } from '@repo/core/i18n';

/**
 * JobRow (apps/vendors/components/job-row.tsx), in the Home look (mockup garage-hub 2):
 * one hub card per job, the time large and light with am/pm small, its status tag, the
 * customer, the car with its plate, what and where, and on Today the job's one next step.
 * The job under way keeps its blue edge and the red button.
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
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const deferred = useDeferredStatus(b.id);
  const who = b.customerName || t('the customer');
  const step = showStep && !deferred ? nextStep(b) : null;
  const startsIn = b.status === 'confirmed' ? new Date(b.scheduledAtIso).getTime() - now : null;
  const [clock, meridiem] = formatClock(b.scheduledAtIso).split(' ');
  const dayOff = b.status === 'completed' || b.status === 'cancelled' || b.status === 'rescheduled';
  const open = () => router.push(`/bookings/${b.id}` as Href);
  const stepTint = emphasis ? colors.white : colors.textPrimary;

  return (
    <Pressable accessibilityLabel={t('Job for {who}', { who })} onPress={open}>
      <HubCard style={styles.card}>
        {emphasis ? <View style={styles.edge} /> : null}
        <View style={styles.top}>
          <View style={styles.clock}>
            <T num size={showStep ? 38 : 30} weight={300} lh={showStep ? 40 : 32} tracking={-0.035}>
              {clock}
            </T>
            <T num size={14} lh={18} color={colors.dim}>
              {meridiem}
            </T>
          </View>
          <RowChip booking={b} now={now} startsIn={startsIn} deferred={deferred} />
        </View>
        <T size={18} lh={24} numberOfLines={1} style={styles.name}>
          {shortName(b.customerName)}
        </T>
        {b.vehicle ? (
          <View style={styles.line}>
            <CarLine vehicle={b.vehicle} />
          </View>
        ) : null}
        <T size={13} lh={18} color={colors.dim} numberOfLines={1} style={styles.line}>
          {`${listServicesLine(b)} · ${t(BOOKING_TYPE_LABELS[b.bookingType])}`}
        </T>
        {dayOff && b.status !== 'completed' ? (
          <T size={13} lh={18} color={colors.textSecondary} style={styles.line}>
            {t(cancelledLabel(b))}
          </T>
        ) : null}

        {step ? (
          <View style={styles.step}>
            {step.kind === 'start' || step.kind === 'complete' ? (
              <ScButton
                variant={emphasis ? 'main' : 'quiet'}
                size={emphasis ? 'lg' : 'md'}
                accessibilityLabel={t('{step} for {who}', { step: t(nextStepLabel(step)), who })}
                onPress={() => changeStatusWithUndo(b.id, step.kind === 'start' ? 'in_progress' : 'completed')}
              >
                {t(nextStepLabel(step))}
              </ScButton>
            ) : step.kind === 'wait' ? (
              <T size={14} color={colors.textSecondary}>
                {t(step.text)}
              </T>
            ) : (
              <ScButton
                variant={emphasis ? 'main' : 'quiet'}
                size={emphasis ? 'lg' : 'md'}
                accessibilityLabel={t('{step} for {who}', { step: t(nextStepLabel(step)), who })}
                onPress={open}
              >
                {step.kind === 'photos' ? <IconCamera size={20} color={stepTint} /> : null}
                {step.kind === 'pickup' ? <IconCar size={20} color={stepTint} /> : null}
                <Label color={stepTint}>{t(nextStepLabel(step))}</Label>
              </ScButton>
            )}
          </View>
        ) : null}
      </HubCard>
    </Pressable>
  );
}

/** The status chip's tone as the hub's outline tag: blue under way, green accepted or done. */
const TAG_TONE: Record<ReturnType<typeof bookingStatusTone>, TagTone> = {
  new: 'red',
  progress: 'blue',
  done: 'green',
  attention: 'amber',
  late: 'red',
  closed: 'quiet',
};

const DEFERRED_CHIP: Record<NonNullable<ReturnType<typeof useDeferredStatus>>, string> = {
  confirmed: msg('Accepted'),
  in_progress: msg('In progress'),
  completed: msg('Done'),
  picked_up: msg('Picked up'),
  at_garage: msg('At garage'),
  out_for_delivery: msg('Out for delivery'),
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
  const t = useT();
  if (deferred) {
    return (
      <HubTag dot tone={deferred === 'completed' ? 'green' : 'blue'}>
        {t(DEFERRED_CHIP[deferred])}
      </HubTag>
    );
  }
  // An accepted job about to start says when, the way a garage plans its next hour.
  if (startsIn !== null && startsIn > 0 && startsIn <= 3 * 60 * 60 * 1000) {
    return <HubTag>{formatRelative(b.scheduledAtIso, now)}</HubTag>;
  }
  // Accepted reads green as on the mockup; the job under way is the blue one.
  const tone = b.status === 'confirmed' ? 'green' : TAG_TONE[bookingStatusTone(b.status)];
  return (
    <HubTag tone={tone} dot={tone === 'blue'}>
      {t(statusLabel(b))}
    </HubTag>
  );
}

const useStyles = createStyles((colors) => ({
  card: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18, overflow: 'hidden' },
  // The job under way keeps its blue edge (mockup garage-hub 2).
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.tones.progress.dot },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  clock: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 1 },
  name: { marginTop: 10 },
  line: { marginTop: 4 },
  step: { marginTop: 14 },
}));
