import { msg, useT } from '@repo/core/i18n';
import { formatStepTime } from '@repo/core/job-records';
import { pickupCodeCard, pickupTimeline, type PickupTimelineBooking } from '@repo/core/pickup';
import type { Booking } from '@repo/core/types';
import { IconCheck, IconKey } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { View } from 'react-native';

type StepState = 'done' | 'current' | 'upcoming';

/** One row of a timeline: the mark, the line down to the next, and the words. */
function Step({ state, last, label, caption, time }: { state: StepState; last: boolean; label: string; caption: string; time?: string }) {
  const colors = useColors();
  const styles = useStyles();
  const done = state === 'done';
  const active = state !== 'upcoming';
  return (
    <View style={styles.step} accessibilityState={{ selected: state === 'current' }}>
      <View style={styles.markCol}>
        <View style={[styles.mark, done ? styles.markDone : state === 'current' ? styles.markNow : styles.markLater]}>
          {done ? <IconCheck size={13} stroke={3} color={colors.chosenText} /> : null}
          {state === 'current' ? <View style={styles.pulse} /> : null}
        </View>
        {!last ? <View style={[styles.line, done ? styles.lineDone : styles.lineLater]} /> : null}
      </View>
      <View style={last ? undefined : styles.stepBody}>
        <T size={14} weight={600} lh={18} color={active ? colors.textPrimary : colors.textMuted}>
          {label}
        </T>
        <T size={12} lh={16} color={active ? colors.textSecondary : colors.textMuted} style={styles.mt2}>
          {caption}
        </T>
        {time ? (
          <T num size={11} lh={15} color={colors.textMuted} style={styles.mt2}>
            {time}
          </T>
        ) : null}
      </View>
    </View>
  );
}

export type StepKey = 'requested' | 'confirmed' | 'in_progress' | 'completed';

const STEPS: { key: StepKey; label: Partial<Record<StepState, string>> & { upcoming: string }; caption: Record<StepState, string> }[] = [
  { key: 'requested', label: { upcoming: msg('Requested') }, caption: { done: msg('Sent to the garage'), current: msg('Sent to the garage'), upcoming: msg('Sent to the garage') } },
  {
    key: 'confirmed',
    label: { current: msg('Waiting for garage'), upcoming: msg('Accepted') },
    caption: { done: msg('Your slot is reserved'), current: msg('Shows here as soon as the garage accepts'), upcoming: msg('The garage accepts your slot') },
  },
  {
    key: 'in_progress',
    label: { upcoming: msg('In progress') },
    caption: { done: msg('Work started on your car'), current: msg('Work has started on your car'), upcoming: msg('Starts at your booked time') },
  },
  { key: 'completed', label: { upcoming: msg('Done') }, caption: { done: msg('Your car is ready'), current: msg('Your car is ready'), upcoming: msg('Marked here when the work is done') } },
];

const PROGRESS: Record<string, { doneThrough: number; current: number | null }> = {
  pending: { doneThrough: 0, current: 1 },
  confirmed: { doneThrough: 1, current: null },
  in_progress: { doneThrough: 1, current: 2 },
  completed: { doneThrough: 3, current: null },
};

/** StatusStepper (packages/ui/src/sc/status-stepper.tsx). */
export function StatusStepper({ status, times }: { status: string; times?: Partial<Record<StepKey, string>> }) {
  const t = useT();
  const progress = PROGRESS[status] ?? PROGRESS.pending;
  return (
    <View accessibilityLabel={t('Booking progress')}>
      {STEPS.map((step, i) => {
        const state: StepState = i <= progress.doneThrough ? 'done' : i === progress.current ? 'current' : 'upcoming';
        return (
          <Step
            key={step.key}
            state={state}
            last={i === STEPS.length - 1}
            label={t(step.label[state] ?? step.label.upcoming)}
            caption={t(step.caption[state])}
            time={state !== 'upcoming' ? times?.[step.key] : undefined}
          />
        );
      })}
    </View>
  );
}

/** PickupTimeline (apps/users/components/pickup-progress.tsx). */
export function PickupTimeline({ booking, now }: { booking: PickupTimelineBooking; now: number }) {
  const t = useT();
  const steps = pickupTimeline(booking);
  if (!steps) return null;
  return (
    <View accessibilityLabel={t('Pickup progress')}>
      {steps.map((step, i) => (
        <Step key={step.key} state={step.state} last={i === steps.length - 1} label={step.label} caption={step.caption} time={step.at ? formatStepTime(step.at, now) : undefined} />
      ))}
    </View>
  );
}

/** PickupCodeCard: the code is on screen and nowhere else, never logged. */
export function PickupCodeCard({ booking }: { booking: Pick<Booking, 'status' | 'pickup'> }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const card = pickupCodeCard(booking);
  if (!card) return null;
  return (
    <ScCard style={styles.code}>
      <View style={styles.codeHead}>
        <IconKey size={16} color={colors.textSecondary} />
        <T size={14} weight={600} lh={20}>
          {card.title}
        </T>
      </View>
      <T size={13} lh={18} color={colors.textSecondary}>
        {card.line}
      </T>
      <T num size={36} weight={700} lh={40} tracking={0.3}>
        {card.code}
      </T>
      <T size={11} lh={15} color={colors.textMuted}>
        {card.kind === 'pickup'
          ? t('Share it only when you hand over your car. The garage enters it to mark your car picked up.')
          : t('Share it only once you have your car back. The garage enters it to finish the job.')}
      </T>
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  step: { flexDirection: 'row', gap: 12 },
  markCol: { alignItems: 'center' },
  mark: { height: 22, width: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markDone: { borderColor: c.chosenBg, backgroundColor: c.chosenBg },
  markNow: { borderColor: c.chosenBg },
  markLater: { borderColor: c.textMuted },
  pulse: { height: 8, width: 8, borderRadius: 4, backgroundColor: c.chosenBg },
  line: { marginVertical: 4, minHeight: 22, width: 1, flex: 1 },
  lineDone: { backgroundColor: c.outlineStrong },
  lineLater: { backgroundColor: c.border },
  stepBody: { paddingBottom: 16, flexShrink: 1 },
  mt2: { marginTop: 2 },
  code: { gap: 8, padding: 16 },
  codeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
