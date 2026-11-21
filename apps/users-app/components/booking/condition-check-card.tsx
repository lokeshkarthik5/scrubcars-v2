import { answerConditionCheck, markAlreadyThere } from '@repo/core/api/condition-check';
import { bookingReference } from '@repo/core/booking-types';
import {
  CAR_CHECK_ANGLE_LABELS,
  CONDITION_NOTE_MAX,
  beforeMarks,
  markLabel,
  newMarksForCustomer,
  photoById,
} from '@repo/core/condition-check';
import { formatClock } from '@repo/core/format';
import { useT } from '@repo/core/i18n';
import type { Booking, ConditionMark } from '@repo/core/types';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconMessageReport } from '@repo/native-ui/icons';
import { ScTextarea } from '@repo/native-ui/inputs';
import { MarkedPhoto } from '@repo/native-ui/marked-photo';
import { ScCard } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { RaiseComplaintSheet } from '@/components/complaints/raise-complaint-sheet';
import {
  canAnswerConditionCheck,
  marksFoundLine,
  newMarkComplaint,
  shownBeforeSlots,
  type ShownSlot,
} from '@/lib/condition-check-view';
import { errorText } from '@/lib/error-text';

/**
 * ConditionCheckCard (apps/users/components/condition-check-card.tsx): the car
 * condition check on the customer's booking (0075), right under the status
 * (condition-check mockups 3 and 5):
 *
 *  - "Your car's condition before the job": the garage's walk-round with Detlio's
 *    marks circled, "Looks right" (recorded with who and when) and "Something's
 *    wrong" (a short note the garage and the Detlio team read; the job still goes
 *    ahead). No answer holds nothing up.
 *  - Once the job is done, "New mark found – rear bumper" for a mark the after
 *    photos show that the before ones did not: the two photos side by side, "Raise
 *    a complaint" (the complaint form, about this booking, filled in) and "It was
 *    already there". Nothing blames anyone.
 *
 * Nothing renders while the check is off for the garage or there is nothing to
 * show (the server sends null).
 */
export function ConditionCheckCard({
  booking,
  onChanged,
  onHelp,
}: {
  booking: Booking;
  /** Re-read the booking after an answer. */
  onChanged: () => Promise<void> | void;
  /** Opens Help with this booking. */
  onHelp: () => void;
}) {
  const check = booking.conditionCheck;
  if (!check) return null;
  return (
    <>
      {newMarksForCustomer(check).map((mark) => (
        <NewMarkCard key={mark.id} booking={booking} mark={mark} onChanged={onChanged} />
      ))}
      {check.sentAt ? <BeforeCheck booking={booking} onChanged={onChanged} onHelp={onHelp} /> : null}
    </>
  );
}

/** Four to a row, the web's grid-cols-4: the last row padded with empty cells. */
function inRows<T>(items: readonly T[], size: number): Array<Array<T | null>> {
  const rows: Array<Array<T | null>> = [];
  for (let i = 0; i < items.length; i += size) {
    const row: Array<T | null> = items.slice(i, i + size);
    while (row.length < size) row.push(null);
    rows.push(row);
  }
  return rows;
}

function BeforeCheck({
  booking,
  onChanged,
  onHelp,
}: {
  booking: Booking;
  onChanged: () => Promise<void> | void;
  onHelp: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const check = booking.conditionCheck!;
  const slots = shownBeforeSlots(check.photos);
  const marks = beforeMarks(check);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    slots.find((slot) => slot.photo.id === selectedId) ??
    slots.find((slot) => marks.some((mark) => mark.photoId === slot.photo.id)) ??
    slots[0];
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const car = booking.vehicle?.model ?? t('car');

  const looksRight = async () => {
    setBusy(true);
    try {
      await answerConditionCheck(booking.id, { answer: 'looks_right' });
      await onChanged();
    } catch (error) {
      toast.error(errorText(error, t("Couldn't save your answer. Try again.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScCard style={styles.card}>
      <View>
        <T accessibilityRole="header" variant="t3" weight={600}>
          {t("Your car's condition before the job")}
        </T>
        <T variant="t5" color={colors.textSecondary} style={styles.mt2}>
          {`${t('{vendorName} photographed your {car} at {time}.', {
            vendorName: booking.vendorName,
            car,
            time: formatClock(check.sentAt!),
          })} ${marksFoundLine(marks.length)}`}
        </T>
      </View>

      {selected ? (
        <MarkedPhoto
          uri={selected.photo.url}
          accessibilityLabel={t('Your car, {angle}', { angle: t(CAR_CHECK_ANGLE_LABELS[selected.angle]).toLowerCase() })}
          marks={marks
            .filter((mark) => mark.photoId === selected.photo.id)
            .map((mark) => ({ id: mark.id, box: mark.box, label: markLabel(mark) }))}
          radius={14}
        />
      ) : null}

      {marks.length > 0 ? (
        <View accessibilityLabel={t('Marks already there')} style={styles.marks}>
          {marks.map((mark) => (
            <Pressable
              key={mark.id}
              accessibilityRole="button"
              onPress={() => setSelectedId(mark.photoId)}
              style={styles.markRow}
            >
              <View style={[styles.ring, { borderColor: colors.red }]} />
              <T variant="t4" style={styles.flex}>
                {markLabel(mark)}
              </T>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View accessibilityLabel={t('Car check photos')} style={styles.grid}>
        {inRows<ShownSlot>(slots, 4).map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map((slot, i) => {
              if (!slot) return <View key={`empty-${i}`} style={styles.cell} />;
              const label = t(CAR_CHECK_ANGLE_LABELS[slot.angle]);
              const on = slot.photo.id === selected?.photo.id;
              return (
                <View key={slot.photo.id} style={styles.cell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t('Show the {angle} photo', { angle: label.toLowerCase() })}
                    onPress={() => setSelectedId(slot.photo.id)}
                    style={[styles.thumb, on ? styles.thumbOn : styles.thumbIdle]}
                  >
                    <Image source={{ uri: slot.photo.url }} style={styles.fill} />
                  </Pressable>
                  <T size={11} lh={15} color={colors.textSecondary} numberOfLines={1}>
                    {label}
                  </T>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {check.answer ? (
        <View accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.answered}>
          <IconCircleCheck size={18} color={colors.success} />
          <T variant="t4" style={styles.flex}>
            {check.answer.kind === 'looks_right'
              ? t('You said it looks right, at {time}.', { time: formatClock(check.answer.at) })
              : t('You told {vendorName} something is wrong. The Detlio team can see it too.', {
                  vendorName: booking.vendorName,
                })}
          </T>
        </View>
      ) : canAnswerConditionCheck(booking) ? (
        <View style={styles.answers}>
          <ScButton variant="hero" height={52} disabled={busy} onPress={() => void looksRight()}>
            <Label color={busy ? colors.textSecondary : colors.white}>{busy ? t('Saving...') : t('Looks right')}</Label>
          </ScButton>
          <ScButton variant="text" disabled={busy} onPress={() => setWriting(true)}>
            {t("Something's wrong")}
          </ScButton>
        </View>
      ) : null}

      <T variant="t5" align="center" color={colors.textMuted}>
        {t('Detlio can miss small scratches. The photos are kept with this booking as the record.')}
      </T>

      <SomethingWrongSheet
        open={writing}
        onClose={() => setWriting(false)}
        booking={booking}
        onSent={onChanged}
        onHelp={() => {
          setWriting(false);
          onHelp();
        }}
      />
    </ScCard>
  );
}

/** "Something's wrong": a short note for the garage (and the team), then Send. */
function SomethingWrongSheet({
  open,
  onClose,
  booking,
  onSent,
  onHelp,
}: {
  open: boolean;
  onClose: () => void;
  booking: Booking;
  onSent: () => Promise<void> | void;
  onHelp: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!note.trim()) return;
    setSending(true);
    setError('');
    try {
      await answerConditionCheck(booking.id, { answer: 'something_wrong', note: note.trim() });
      setNote('');
      onClose();
      await onSent();
    } catch (err) {
      setError(errorText(err, t("Couldn't send it. Check your connection and try again.")));
    } finally {
      setSending(false);
    }
  };

  return (
    <ScSheet
      horizontalPadding={16}
      open={open}
      onClose={onClose}
      dismissible={!sending}
      accessibilityLabel={t("Something's wrong")}
    >
      <View style={styles.sheet}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <T size={16} weight={600} lh={22}>
              {t("Something's wrong")}
            </T>
            <T variant="t5" color={colors.textSecondary} style={styles.mt4}>
              {t(
                'Tell {vendorName} what is not right in the photos. The Detlio team sees it too, and the job can still go ahead.',
                { vendorName: booking.vendorName }
              )}
            </T>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Close')}
            disabled={sending}
            onPress={onClose}
            style={[styles.close, sending && styles.dim]}
          >
            <IconCircleX size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScTextarea
          label={t("What's wrong?")}
          rows={4}
          maxLength={CONDITION_NOTE_MAX}
          placeholder={t('e.g. The dent on the bonnet was not there')}
          value={note}
          onChangeText={(text) => {
            setNote(text);
            setError('');
          }}
        />
        {error ? (
          <T accessibilityRole="alert" variant="t5" color={colors.error}>
            {error}
          </T>
        ) : null}
        <ScButton variant="main" height={44} disabled={sending || !note.trim()} onPress={() => void send()}>
          {sending ? t('Sending…') : t('Send to the garage')}
        </ScButton>
        <ScButton variant="text" onPress={onHelp}>
          {t('Help with this booking')}
        </ScButton>
      </View>
    </ScSheet>
  );
}

function NewMarkCard({
  booking,
  mark,
  onChanged,
}: {
  booking: Booking;
  mark: ConditionMark;
  onChanged: () => Promise<void> | void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const photos = booking.conditionCheck!.photos;
  const after = photoById(photos, mark.photoId);
  const before = photoById(photos, mark.beforePhotoId);
  const [busy, setBusy] = useState(false);
  const [complaining, setComplaining] = useState(false);
  const title = t('New mark found – {part}', { part: mark.part });

  const alreadyThere = async () => {
    setBusy(true);
    try {
      await markAlreadyThere(booking.id, mark.id);
      await onChanged();
    } catch (error) {
      toast.error(errorText(error, t("Couldn't save your answer. Try again.")));
    } finally {
      setBusy(false);
    }
  };

  const chip = (text: string) => (
    <View pointerEvents="none" style={styles.chip}>
      <T num size={11} weight={500} lh={15} color={colors.white}>
        {text}
      </T>
    </View>
  );

  return (
    <ScCard accessibilityLabel={title} style={[styles.card, styles.warningCard]}>
      <View style={styles.titleRow}>
        <IconAlertTriangle size={18} color={colors.warning} />
        <T accessibilityRole="header" variant="t3" weight={600} color={colors.warning} style={styles.flex}>
          {title}
        </T>
      </View>
      <View style={styles.pair}>
        <View style={styles.flex}>
          {before ? (
            <MarkedPhoto uri={before.url} accessibilityLabel={t('Before the job')} marks={[]} radius={12}>
              {chip(t('Before · {time}', { time: formatClock(before.createdAt) }))}
            </MarkedPhoto>
          ) : null}
        </View>
        <View style={styles.flex}>
          {after ? (
            <MarkedPhoto
              uri={after.url}
              accessibilityLabel={t('After the job')}
              marks={[{ id: mark.id, box: mark.box, label: markLabel(mark) }]}
              labels={false}
              radius={12}
            >
              {chip(t('After · {time}', { time: formatClock(after.createdAt) }))}
            </MarkedPhoto>
          ) : null}
        </View>
      </View>
      <T variant="t4" color={colors.textSecondary}>
        {t(
          "It isn't in the photos from before the job. It may be nothing (light, water, dirt). If it is damage, tell us and the Detlio team will look into it with the garage."
        )}
      </T>
      <ScButton variant="outline" height={44} onPress={() => setComplaining(true)}>
        <IconMessageReport size={18} />
        <Label>{t('Raise a complaint')}</Label>
      </ScButton>
      <ScButton variant="text" disabled={busy} onPress={() => void alreadyThere()}>
        {busy ? t('Saving...') : t('It was already there')}
      </ScButton>

      <RaiseComplaintSheet
        open={complaining}
        onClose={() => setComplaining(false)}
        booking={{ id: booking.id, reference: `#${bookingReference(booking.id)}`, vendorName: booking.vendorName }}
        prefill={newMarkComplaint(mark)}
      />
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 12 },
  warningCard: { borderWidth: 1, borderColor: c.warningBorder, backgroundColor: c.warningMuted },
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  mt2: { marginTop: 2 },
  mt4: { marginTop: 4 },
  marks: { gap: 4 },
  markRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, flexShrink: 0 },
  grid: { gap: 6 },
  gridRow: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  thumb: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden', borderRadius: 8, backgroundColor: c.surface },
  thumbOn: { borderWidth: 2, borderColor: c.textPrimary },
  thumbIdle: { borderWidth: 1, borderColor: c.line },
  answered: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  answers: { gap: 4 },
  sheet: { gap: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  close: { marginRight: -8, marginTop: -4, height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  chip: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,11,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
}));
