import {
  addConditionMark,
  removeConditionMark,
  restoreConditionMark,
  sendConditionCheck,
} from '@repo/core/api/condition-check';
import {
  CAR_CHECK_ANGLE_LABELS,
  DAMAGE_KINDS,
  DAMAGE_KIND_LABELS,
  type DamageKind,
  MARK_PART_MAX,
  markLabel,
} from '@repo/core/condition-check';
import { formatClock } from '@repo/core/format';
import type { Booking, ConditionMark, JobPhoto } from '@repo/core/types';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { checkTheMarksLine, marksOnSlots, selectedSlot, takenBeforeSlots } from '@/lib/condition-view';
import { errorText } from '@/lib/error-text';
import { firstName } from '@/lib/jobs';
import { Label, ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconArrowLeft, IconPlus } from '@repo/native-ui/icons';
import { ScInput } from '@repo/native-ui/inputs';
import { MarkedPhoto, PhotoChip } from '@repo/native-ui/marked-photo';
import { EmptyState } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useT } from '@repo/core/i18n';

/** Back to the job's screen (the web's Link to /bookings/[id], named "Go back"). */
export function BackToJob({ id }: { id: string }) {
  const t = useT();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Go back')}
      onPress={() => backToJob(id)}
      style={styles.round}
    >
      <IconArrowLeft size={22} />
    </Pressable>
  );
}

/** The job's screen: the one it came from, or (opened from a link) a fresh one. */
function backToJob(id: string) {
  if (router.canGoBack()) router.back();
  else router.replace(`/bookings/${id}` as Href);
}

/**
 * CheckTheMarks (apps/vendors/components/check-the-marks.tsx, condition-check
 * mockup 2): the walk-round's before photos with Detlio's marks circled, a list of
 * every mark with Remove (and Undo), "Add a mark Detlio missed", and "Send to
 * customer". Once sent it only shows: the photos and marks are the record.
 */
export function CheckTheMarks({ booking: b, onChanged }: { booking: Booking; onChanged: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const check = b.conditionCheck!;
  const who = firstName(b.customerName);
  const car = b.vehicle?.model ?? t('car');
  const slots = takenBeforeSlots(b.jobPhotos);
  const marks = marksOnSlots(check, slots);
  const kept = marks.filter((mark) => !mark.removed);
  const sent = check.sentAt !== null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedSlot(slots, kept, selectedId);
  const [busyMark, setBusyMark] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [adding, setAdding] = useState(false);

  const toggle = async (mark: ConditionMark) => {
    setBusyMark(mark.id);
    try {
      if (mark.removed) await restoreConditionMark(b.id, mark.id);
      else await removeConditionMark(b.id, mark.id);
      onChanged();
    } catch (error) {
      toast.error(errorText(error, t('Could not save that. Try again.')));
    } finally {
      setBusyMark(null);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      await sendConditionCheck(b.id);
      toast.success(t('Car check sent to {who}', { who }));
      onChanged();
      backToJob(b.id);
    } catch (error) {
      toast.error(errorText(error, t('Could not send the car check. Try again.')));
      onChanged();
    } finally {
      setSending(false);
    }
  };

  const missing = check.gate?.missing ?? 0;

  const footer = sent ? undefined : (
    <View style={styles.dock}>
      {missing > 0 ? (
        <T size={15} color={colors.warning}>
          {missing === 1
            ? t('Take 1 more car check photo first.')
            : t('Take {count} more car check photos first.', { count: missing })}
        </T>
      ) : null}
      <ScButton variant="main" size="lg" disabled={!check.canSend || sending} onPress={() => void send()}>
        {sending ? t('Sending…') : t('Send to customer')}
      </ScButton>
    </View>
  );

  return (
    <AppShell hasNav={false} gap={16} footer={footer}>
      <View style={styles.header}>
        <BackToJob id={b.id} />
        <T accessibilityRole="header" size={22} weight={600} lh={28} style={styles.flex}>
          {t('Check the marks')}
        </T>
      </View>

      <T accessibilityLiveRegion="polite" size={16} color={colors.textSecondary}>
        {checkTheMarksLine(check, kept.length, {
          who,
          car,
          sentTime: check.sentAt ? formatClock(check.sentAt) : null,
        })}
      </T>

      {selected ? (
        <>
          <MarkedPhoto
            uri={selected.photo.url}
            accessibilityLabel={t(CAR_CHECK_ANGLE_LABELS[selected.angle])}
            marks={kept
              .filter((mark) => mark.photoId === selected.photo.id)
              .map((mark) => ({ id: mark.id, box: mark.box, label: markLabel(mark) }))}
          >
            <PhotoChip>{t(CAR_CHECK_ANGLE_LABELS[selected.angle])}</PhotoChip>
          </MarkedPhoto>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={t('Car check photos')}
            contentContainerStyle={styles.strip}
          >
            {slots.map(({ angle, photo }) => {
              const count = kept.filter((mark) => mark.photoId === photo.id).length;
              const label = t(CAR_CHECK_ANGLE_LABELS[angle]);
              const on = photo.id === selected.photo.id;
              return (
                <Pressable
                  key={photo.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={
                    count === 1
                      ? t('{angle} photo, 1 mark', { angle: label })
                      : t('{angle} photo, {count} marks', { angle: label, count })
                  }
                  onPress={() => setSelectedId(photo.id)}
                  style={[styles.thumb, on ? styles.thumbOn : styles.thumbIdle]}
                >
                  <Image source={{ uri: photo.url }} style={styles.fill} />
                  {count > 0 ? (
                    <View style={styles.count}>
                      <T num size={11} weight={600} lh={14} color={colors.white}>
                        {String(count)}
                      </T>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : (
        <EmptyState title={t('No car check photos yet')} subtitle={t('Take them on the job page first.')} />
      )}

      {marks.length > 0 ? (
        <View accessibilityLabel={t('Marks')}>
          {marks.map((mark, i) => {
            const label = markLabel(mark);
            return (
              <View key={mark.id} style={[styles.markRow, i > 0 && styles.markDivider]}>
                <View style={[styles.ring, { borderColor: mark.removed ? colors.textMuted : colors.red }]} />
                <Pressable accessibilityRole="button" onPress={() => setSelectedId(mark.photoId)} style={styles.flex}>
                  <T
                    size={16}
                    color={mark.removed ? colors.textMuted : colors.textPrimary}
                    style={mark.removed ? styles.struck : undefined}
                  >
                    {t(DAMAGE_KIND_LABELS[mark.kind])}
                  </T>
                  <T size={14} color={colors.textSecondary}>
                    {mark.part}
                    {mark.unsure ? ` · ${t("Detlio wasn't sure")}` : ''}
                    {mark.source === 'garage' ? ` · ${t('Added by you')}` : ''}
                  </T>
                </Pressable>
                {!sent ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={mark.removed ? t('Undo removing {label}', { label }) : t('Remove {label}', { label })}
                    accessibilityState={{ disabled: busyMark !== null }}
                    disabled={busyMark !== null}
                    onPress={() => void toggle(mark)}
                    style={[styles.toggle, busyMark !== null && styles.dim]}
                  >
                    {busyMark === mark.id ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                      <T size={15} style={styles.underline}>
                        {mark.removed ? t('Undo') : t('Remove')}
                      </T>
                    )}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {!sent && selected ? (
        <ScButton variant="outline" size="lg" onPress={() => setAdding(true)}>
          <IconPlus size={18} />
          <Label>{t('Add a mark Detlio missed')}</Label>
        </ScButton>
      ) : null}

      <T size={14} color={colors.textSecondary}>
        {t('Detlio can miss small scratches. The photos are the record, for you and the customer.')}
      </T>

      {selected ? (
        <AddMarkSheet
          open={adding}
          onClose={() => setAdding(false)}
          bookingId={b.id}
          photo={selected.photo}
          angleLabel={t(CAR_CHECK_ANGLE_LABELS[selected.angle])}
          onAdded={onChanged}
        />
      ) : null}
    </AppShell>
  );
}

/** "Add a mark Detlio missed" on the photo in view: what, and where on the car. */
function AddMarkSheet({
  open,
  onClose,
  bookingId,
  photo,
  angleLabel,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  photo: JobPhoto;
  angleLabel: string;
  onAdded: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [kind, setKind] = useState<DamageKind>('scratch');
  const [part, setPart] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!part.trim()) return;
    setSaving(true);
    try {
      await addConditionMark(bookingId, { photoId: photo.id, kind, part: part.trim() });
      setPart('');
      onAdded();
      onClose();
    } catch (error) {
      toast.error(errorText(error, t('Could not save that. Try again.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      accessibilityLabel={t('Add a mark Detlio missed')}
      horizontalPadding={16}
    >
      <View style={styles.sheet}>
        <View>
          <T accessibilityRole="header" size={18} weight={600}>
            {t('Add a mark Detlio missed')}
          </T>
          <T size={14} color={colors.textSecondary} style={styles.mt4}>
            {t('On the {angle} photo.', { angle: angleLabel.toLowerCase() })}
          </T>
        </View>
        <View style={styles.kinds}>
          <T size={13} weight={500} color={colors.textSecondary}>
            {t('What is it?')}
          </T>
          <View style={styles.chips}>
            {DAMAGE_KINDS.map((value) => (
              <Chip
                key={value}
                label={t(DAMAGE_KIND_LABELS[value])}
                selected={kind === value}
                onPress={() => setKind(value)}
              />
            ))}
          </View>
        </View>
        <ScInput
          label={t('Where on the car')}
          placeholder={t('e.g. rear left door')}
          maxLength={MARK_PART_MAX}
          value={part}
          onChangeText={setPart}
          returnKeyType="done"
          onSubmitEditing={() => void add()}
        />
        <ScButton variant="main" size="lg" disabled={saving || !part.trim()} onPress={() => void add()}>
          {saving ? t('Saving...') : t('Add mark')}
        </ScButton>
      </View>
    </ScSheet>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  strip: { gap: 8, paddingHorizontal: 4, paddingBottom: 4 },
  thumb: {
    height: 56,
    width: 72,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  thumbOn: { borderWidth: 2, borderColor: colors.textPrimary },
  thumbIdle: { borderWidth: 1, borderColor: colors.border },
  count: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  markDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  ring: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, flexShrink: 0 },
  struck: { textDecorationLine: 'line-through' },
  toggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, flexShrink: 0 },
  underline: { textDecorationLine: 'underline' },
  dim: { opacity: 0.5 },
  dock: { gap: 8 },
  sheet: { gap: 16, paddingBottom: 8 },
  mt4: { marginTop: 4 },
  kinds: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
