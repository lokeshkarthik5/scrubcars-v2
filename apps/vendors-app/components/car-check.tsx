import { markWasThere } from '@repo/core/api/condition-check';
import { markLabel, newMarksForGarage, photoById } from '@repo/core/condition-check';
import { formatClock } from '@repo/core/format';
import type { Booking, ConditionMark } from '@repo/core/types';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { carCheckSummaryLine } from '@/lib/condition-view';
import { errorText } from '@/lib/error-text';
import { firstName } from '@/lib/jobs';
import { ScButton } from '@repo/native-ui/button';
import { IconAlertTriangle, IconCircleCheck, IconMessageCircle } from '@repo/native-ui/icons';
import { MarkedPhoto, PhotoChip } from '@repo/native-ui/marked-photo';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useT } from '@repo/core/i18n';

/**
 * CarCheckSummary (apps/vendors/components/car-check.tsx): under the walk-round's
 * tiles on the job screen (0075), where the before check stands. Not sent: how
 * many marks Detlio found (or that it is still looking) and Check the marks, which
 * opens the screen that sends it. Sent: when, and the customer's answer — "Looks
 * right", or their "Something's wrong" note, which the garage reads here.
 */
export function CarCheckSummary({ booking: b }: { booking: Booking }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const check = b.conditionCheck;
  if (!check) return null;
  const who = firstName(b.customerName);
  const open = () => router.push(`/bookings/${b.id}/condition` as Href);

  if (!check.sentAt) {
    const line = carCheckSummaryLine(check, who);
    if (line === null) return null;
    return (
      <View style={styles.block}>
        <View accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.line}>
          {check.unread.length > 0 ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
          <T size={15} style={styles.flex}>
            {line}
          </T>
        </View>
        <ScButton variant="outline" size="lg" onPress={open}>
          {t('Check the marks')}
        </ScButton>
      </View>
    );
  }

  return (
    <View style={[styles.block, styles.blockSent]}>
      <View style={styles.line}>
        <IconCircleCheck size={18} color={colors.success} />
        <T size={15} style={styles.flex}>
          {t('Car check sent to {who} at {time}', { who, time: formatClock(check.sentAt) })}
        </T>
      </View>
      {check.answer?.kind === 'looks_right' ? (
        <T size={14} color={colors.textSecondary}>
          {t('{who} said it looks right.', { who })}
        </T>
      ) : null}
      {check.answer?.kind === 'something_wrong' ? (
        <View style={styles.note}>
          <View style={styles.noteHead}>
            <IconMessageCircle size={16} color={colors.warning} />
            <T size={14} weight={500} color={colors.warning}>
              {t("{who} says something's wrong", { who })}
            </T>
          </View>
          <T size={15} style={styles.noteText}>{`“${check.answer.note ?? ''}”`}</T>
        </View>
      ) : null}
      {!check.answer ? (
        <T size={14} color={colors.textSecondary}>
          {t("{who} hasn't answered yet. The job can go ahead.", { who })}
        </T>
      ) : null}
      <View style={styles.start}>
        <ScButton variant="text" size="md" fullWidth={false} paddingX={0} onPress={open}>
          {t('See the marks')}
        </ScButton>
      </View>
    </View>
  );
}

/**
 * The garage's "It was there" on the first possible new mark it has not answered,
 * shared by the warning card and the docked bar's button row.
 */
export function useWasThere(b: Booking, onAnswered: () => void) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const marks = newMarksForGarage(b.conditionCheck);
  const mark: ConditionMark | undefined = marks[0];
  const answer = async () => {
    if (!mark) return;
    setBusy(true);
    try {
      await markWasThere(b.id, mark.id);
      onAnswered();
    } catch (error) {
      toast.error(errorText(error, t('Could not save that. Try again.')));
    } finally {
      setBusy(false);
    }
  };
  return { mark, more: Math.max(0, marks.length - 1), busy, answer };
}

export type WasThereState = ReturnType<typeof useWasThere>;

/** "It was there", for the warning's mark. */
export function WasThereButton({ state }: { state: WasThereState }) {
  const t = useT();
  if (!state.mark) return null;
  return (
    <ScButton
      variant="outline"
      size="lg"
      disabled={state.busy}
      accessibilityLabel={t('It was there: {label}', { label: markLabel(state.mark) })}
      onPress={() => void state.answer()}
    >
      {state.busy ? t('Saving...') : t('It was there')}
    </ScButton>
  );
}

/**
 * Above Complete job (and pickup & drop's last steps), once an after photo shows a
 * possible new mark (condition-check mockup 4): the two photos side by side, and
 * what to do. It warns; it never blocks. With `button`, "It was there" sits in the
 * card (pickup & drop); otherwise the docked bar puts it beside Complete job.
 */
export function NewMarkWarning({
  booking: b,
  state,
  button = false,
}: {
  booking: Booking;
  state: WasThereState;
  button?: boolean;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const mark = state.mark;
  if (!mark) return null;
  const after = photoById(b.jobPhotos, mark.photoId);
  const before = photoById(b.jobPhotos, mark.beforePhotoId);
  const title = t('Possible new mark – {part}', { part: mark.part });

  return (
    <View accessibilityLabel={title} style={styles.warning}>
      <View style={styles.line}>
        <IconAlertTriangle size={18} color={colors.warning} />
        <T size={16} weight={600} color={colors.warning} style={styles.flex}>
          {title}
        </T>
      </View>
      <View style={styles.pair}>
        <View style={styles.half}>
          {before ? (
            <MarkedPhoto uri={before.url} accessibilityLabel={t('Before')} marks={[]} radius={12}>
              <PhotoChip small>{t('Before')}</PhotoChip>
            </MarkedPhoto>
          ) : null}
        </View>
        <View style={styles.half}>
          {after ? (
            <MarkedPhoto
              uri={after.url}
              accessibilityLabel={t('After')}
              marks={[{ id: mark.id, box: mark.box, label: markLabel(mark) }]}
              labels={false}
              radius={12}
            >
              <PhotoChip small>{t('After')}</PhotoChip>
            </MarkedPhoto>
          ) : null}
        </View>
      </View>
      <T size={14}>{t("It wasn't in the before photos. Check it now: the customer will see it.")}</T>
      {state.more > 0 ? (
        <T size={13} color={colors.textSecondary}>
          {t('{count} more possible marks after this one.', { count: state.more })}
        </T>
      ) : null}
      {button ? <WasThereButton state={state} /> : null}
    </View>
  );
}

/** The docked bar's warning, the web's DockedStep: only while the job is under way. */
export function useNewMarkWarning(b: Booking, onChanged: () => void): WasThereState | null {
  const wasThere = useWasThere(b, onChanged);
  return b.status === 'in_progress' && wasThere.mark ? wasThere : null;
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  block: { marginTop: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  blockSent: { gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteText: { marginTop: 4 },
  start: { alignSelf: 'flex-start' },
  warning: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningMuted,
    padding: 12,
  },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
}));
