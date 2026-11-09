import { deleteMyCarPhoto } from '@repo/core/api/job-records';
import { useT } from '@repo/core/i18n';
import { angleLabel, angleSlots, extraPhotos, PHOTO_ANGLE_LABELS, type PhotoAngle, photosOf } from '@repo/core/job-photo-standards';
import { formatStepTime } from '@repo/core/job-records';
import type { Booking, JobPhoto } from '@repo/core/types';
import { IconCamera } from '@repo/native-ui/icons';
import { ScCard, Spinner } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ShutterImage } from '@/components/moments/shutter';

import { errorText } from '@/lib/error-text';
import { pickPhoto, uploadCarPhoto } from '@/lib/photo-upload';

import { PhotoViewer } from './photo-viewer';

/** CarConditionCard (apps/users/components/car-condition-card.tsx). */
export function CarConditionCard({ booking, onChanged }: { booking: Booking; onChanged: () => Promise<void> | void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const windows = booking.conditionPhotos;
  const [uploading, setUploading] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ photo: JobPhoto; url: string; name: string; canRemove: boolean } | null>(null);
  const [removing, setRemoving] = useState(false);
  // The slots a photo was just added to, which play the shutter once (moment 4).
  const [shot, setShot] = useState<ReadonlySet<string>>(() => new Set());
  if (!windows) return null;
  const stages = (['before', 'after'] as const).filter((stage) => windows[stage].open || photosOf(booking.jobPhotos, 'customer', stage).length > 0);
  if (stages.length === 0) return null;

  const upload = async (stage: JobPhoto['stage'], angle: PhotoAngle | undefined) => {
    const uri = await pickPhoto();
    if (!uri) return;
    setUploading(`${stage}:${angle ?? 'extra'}`);
    try {
      await uploadCarPhoto(booking.id, stage, uri, angle);
      setShot((keys) => new Set(keys).add(`${stage}:${angle ?? 'extra'}`));
      await onChanged();
    } catch (error) {
      toast.error(errorText(error, t('Your photo did not upload. Please try again.')));
    } finally {
      setUploading(null);
    }
  };

  const remove = async (photo: JobPhoto) => {
    setRemoving(true);
    try {
      await deleteMyCarPhoto(booking.id, photo.id);
      setViewing(null);
      await onChanged();
    } catch (error) {
      toast.error(errorText(error, t("Couldn't remove this photo")));
    } finally {
      setRemoving(false);
    }
  };

  const intro = windows.before.open
    ? t('Optional: add up to {max} photos of your car before the work starts, close up on any scratches or dents. The garage sees them too, and they stay with this booking.', { max: windows.max })
    : windows.after.open
      ? windows.after.closesAt
        ? t('Your car is done. Add up to {max} photos of how it came back, until {time}.', { max: windows.max, time: formatStepTime(windows.after.closesAt) })
        : t('Your car is done. Add up to {max} photos of how it came back.', { max: windows.max })
      : t('Your photos of your car, kept with this booking.');

  return (
    <ScCard style={styles.card}>
      <View>
        <T size={14} weight={600} lh={20}>
          {t("Your car's condition")}
        </T>
        <T size={12} lh={16} color={colors.textSecondary} style={styles.sub}>
          {intro}
        </T>
      </View>
      {stages.map((stage) => {
        const open = windows[stage].open;
        const mine = photosOf(booking.jobPhotos, 'customer', stage);
        const room = open ? windows.max - mine.length : 0;
        const slots = angleSlots(booking.jobPhotos, 'customer', stage);
        const extras = extraPhotos(booking.jobPhotos, 'customer', stage);
        const thumb = (photo: JobPhoto, name: string, key?: string) => (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('View {name}', { name })} onPress={() => setViewing({ photo, url: photo.url, name, canRemove: open })}>
            <ShutterImage uri={photo.url} play={key !== undefined && shot.has(key)} style={styles.thumb} />
          </Pressable>
        );
        return (
          <View key={stage} style={styles.stage}>
            <View style={styles.stageHead}>
              <T size={11} weight={500} lh={15} uppercase tracking={0.05} color={colors.textSecondary}>
                {stage === 'before' ? t('Before the work') : t('After the work')}
              </T>
              <T num size={11} lh={15} color={colors.textMuted}>
                {`${mine.length}/${windows.max}`}
              </T>
            </View>
            <View style={styles.slots}>
              {slots.map(({ angle, photo }) => {
                const label = t(PHOTO_ANGLE_LABELS[angle]);
                if (photo) {
                  return (
                    <View key={angle} style={styles.slot}>
                      {thumb(photo, stage === 'before' ? t('your {angle} photo, before the work', { angle: label.toLowerCase() }) : t('your {angle} photo, after the work', { angle: label.toLowerCase() }), `${stage}:${angle}`)}
                      <T size={10} lh={14} color={colors.textSecondary}>
                        {label}
                      </T>
                    </View>
                  );
                }
                if (room <= 0) return null;
                const key = `${stage}:${angle}`;
                return (
                  <View key={angle} style={styles.slot}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={stage === 'before' ? t('Add a {angle} photo of your car, before the work', { angle: label.toLowerCase() }) : t('Add a {angle} photo of your car, after the work', { angle: label.toLowerCase() })}
                      disabled={uploading !== null}
                      onPress={() => void upload(stage, angle)}
                      style={[styles.add, uploading !== null && styles.dim]}
                    >
                      {uploading === key ? <Spinner size={18} /> : <IconCamera size={18} color={colors.textSecondary} />}
                    </Pressable>
                    <T size={10} lh={14} color={colors.textMuted}>
                      {label}
                    </T>
                  </View>
                );
              })}
              {extras.map((photo, i) => (
                <View key={photo.id} style={styles.slot}>
                  {thumb(photo, stage === 'before' ? t('your extra photo {number}, before the work', { number: i + 1 }) : t('your extra photo {number}, after the work', { number: i + 1 }))}
                  <T size={10} lh={14} color={colors.textSecondary}>
                    {angleLabel(photo.angle)}
                  </T>
                </View>
              ))}
            </View>
          </View>
        );
      })}
      <PhotoViewer
        photo={viewing ? { url: viewing.url, name: viewing.name } : null}
        onClose={() => setViewing(null)}
        onRemove={viewing?.canRemove ? () => void remove(viewing.photo) : undefined}
        removing={removing}
      />
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 12 },
  sub: { marginTop: 2 },
  stage: { gap: 6 },
  stageHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Five to a row: Front, Back, Left side, Right side, Interior (moment 4).
  slot: { width: '18%', alignItems: 'center', gap: 2 },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  add: { width: '100%', aspectRatio: 1, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
}));
