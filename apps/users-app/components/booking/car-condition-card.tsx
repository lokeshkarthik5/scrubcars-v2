import { deleteMyCarPhoto } from '@repo/core/api/job-records';
import { angleLabel, angleSlots, extraPhotos, PHOTO_ANGLE_LABELS, type PhotoAngle, photosOf } from '@repo/core/job-photo-standards';
import { formatStepTime } from '@repo/core/job-records';
import type { Booking, JobPhoto } from '@repo/core/types';
import { IconCamera } from '@repo/native-ui/icons';
import { ScCard, Spinner } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { errorText } from '@/lib/error-text';
import { pickPhoto, uploadCarPhoto } from '@/lib/photo-upload';

import { PhotoViewer } from './photo-viewer';

/** CarConditionCard (apps/users/components/car-condition-card.tsx). */
export function CarConditionCard({ booking, onChanged }: { booking: Booking; onChanged: () => Promise<void> | void }) {
  const colors = useColors();
  const styles = useStyles();
  const windows = booking.conditionPhotos;
  const [uploading, setUploading] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ photo: JobPhoto; url: string; name: string; canRemove: boolean } | null>(null);
  const [removing, setRemoving] = useState(false);
  if (!windows) return null;
  const stages = (['before', 'after'] as const).filter((stage) => windows[stage].open || photosOf(booking.jobPhotos, 'customer', stage).length > 0);
  if (stages.length === 0) return null;

  const upload = async (stage: JobPhoto['stage'], angle: PhotoAngle | undefined) => {
    const uri = await pickPhoto();
    if (!uri) return;
    setUploading(`${stage}:${angle ?? 'extra'}`);
    try {
      await uploadCarPhoto(booking.id, stage, uri, angle);
      await onChanged();
    } catch (error) {
      toast.error(errorText(error, 'Your photo did not upload. Please try again.'));
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
      toast.error(errorText(error, "Couldn't remove this photo"));
    } finally {
      setRemoving(false);
    }
  };

  const intro = windows.before.open
    ? `Optional: add up to ${windows.max} photos of your car before the work starts, close up on any scratches or dents. The garage sees them too, and they stay with this booking.`
    : windows.after.open
      ? `Your car is done. Add up to ${windows.max} photos of how it came back${windows.after.closesAt ? `, until ${formatStepTime(windows.after.closesAt)}` : ''}.`
      : 'Your photos of your car, kept with this booking.';

  return (
    <ScCard style={styles.card}>
      <View>
        <T size={14} weight={600} lh={20}>
          {"Your car's condition"}
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
        const thumb = (photo: JobPhoto, name: string) => (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel={`View ${name}`} onPress={() => setViewing({ photo, url: photo.url, name, canRemove: open })}>
            <Image source={{ uri: photo.url }} style={styles.thumb} />
          </Pressable>
        );
        return (
          <View key={stage} style={styles.stage}>
            <View style={styles.stageHead}>
              <T size={11} weight={500} lh={15} uppercase tracking={0.05} color={colors.textSecondary}>
                {stage === 'before' ? 'Before the work' : 'After the work'}
              </T>
              <T num size={11} lh={15} color={colors.textMuted}>
                {`${mine.length}/${windows.max}`}
              </T>
            </View>
            <View style={styles.slots}>
              {slots.map(({ angle, photo }) => {
                const label = PHOTO_ANGLE_LABELS[angle];
                if (photo) {
                  return (
                    <View key={angle} style={styles.slot}>
                      {thumb(photo, `your ${label.toLowerCase()} photo, ${stage} the work`)}
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
                      accessibilityLabel={`Add a ${label.toLowerCase()} photo of your car, ${stage} the work`}
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
                  {thumb(photo, `your extra photo ${i + 1}, ${stage} the work`)}
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
  slot: { width: 64, alignItems: 'center', gap: 2 },
  thumb: { height: 64, width: 64, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  add: { height: 64, width: 64, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
}));
