import {
  angleLabel,
  angleSlots,
  extraPhotos,
  MIN_GARAGE_PHOTOS,
  PHOTO_ANGLE_LABELS,
  type PhotoAngle,
  photosOf,
} from '@repo/core/job-photo-standards';
import { MAX_JOB_PHOTOS_PER_STAGE } from '@repo/core/job-records';
import type { Booking, JobPhoto } from '@repo/core/types';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Pressable, View } from 'react-native';

import { deleteJobPhoto, uploadJobPhoto } from '@/lib/job-records-api';
import { prepareForUpload } from '@/lib/photo-prepare';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { ScButton } from '@repo/native-ui/button';
import { CameraCapture } from './camera-capture';
import { IconCamera, IconCameraPlus, IconCheck } from '@repo/native-ui/icons';
import { AFTER_SHEET_MS, ScModal, ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { msg, useT } from '@repo/core/i18n';

const LABELS: Record<JobPhoto['stage'], string> = { before: msg('Before photos'), after: msg('After photos') };

const REQUIRED_HINTS: Record<JobPhoto['stage'], string> = {
  before: msg('Walk round the car before you start: at least {count} photos, any marks up close.'),
  after: msg('The finished work, before the car goes back: at least {count} photos.'),
};

const HINTS: Record<JobPhoto['stage'], string> = {
  before: msg('Optional. The car as it came in, if anything is already marked.'),
  after: msg('Optional. The finished work, before the car goes back.'),
};

const PICKUP_HINTS: Record<JobPhoto['stage'], string> = {
  before: msg(
    'Recommended: the car as you collect it, every side and any marks. They are your record of how it was handed over.'
  ),
  after: msg('Optional. The finished work, before the car goes back.'),
};

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type Viewing = { photo: JobPhoto; name: string; own: boolean };
type Slot = PhotoAngle | 'extra';

/** The library, for an angle (one photo) or More (several, up to the room left). */
async function fromLibrary(limit: number): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    exif: false,
  });
  return result.canceled ? [] : result.assets.map((asset) => asset.uri);
}

/**
 * JobPhotos (apps/vendors/components/job-photos.tsx): one stage of a job's photos as
 * a guided checklist. A tile opens the camera with the angle guide; a simulator has
 * no camera, so there it opens the library. Every photo is re-encoded by
 * photo-prepare.ts before it leaves the phone.
 */
export function JobPhotos({
  booking,
  stage,
  onChanged,
  readOnly = false,
}: {
  booking: Booking;
  stage: JobPhoto['stage'];
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [uploading, setUploading] = useState<Slot | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [camera, setCamera] = useState<Slot | null>(null);
  const [choosingMore, setChoosingMore] = useState(false);
  // Sized to the photo, as the web's <img> is, up to 60% of the screen.
  const [viewerRatio, setViewerRatio] = useState(4 / 3);

  const standard = booking.photoStandard;
  const required = Boolean(standard?.required && !standard.waived);
  const own = photosOf(booking.jobPhotos, 'garage', stage);
  const slots = angleSlots(booking.jobPhotos, 'garage', stage);
  const extras = extraPhotos(booking.jobPhotos, 'garage', stage);
  const customers = photosOf(booking.jobPhotos, 'customer', stage);
  const room = readOnly ? 0 : MAX_JOB_PHOTOS_PER_STAGE - own.length;
  const who = booking.customerName ?? t('this customer');
  const before = stage === 'before';
  const counter = required
    ? t('{done} of {count}', { done: Math.min(own.length, MIN_GARAGE_PHOTOS), count: MIN_GARAGE_PHOTOS })
    : `${own.length}/${MAX_JOB_PHOTOS_PER_STAGE}`;
  const hint = required
    ? t(REQUIRED_HINTS[stage], { count: MIN_GARAGE_PHOTOS })
    : t((booking.bookingType === 'pickup' ? PICKUP_HINTS : HINTS)[stage]);
  // The photo's name in a sentence: "left side before photo for Ravi".
  const angleName = (angle: PhotoAngle) => t(PHOTO_ANGLE_LABELS[angle]).toLowerCase();
  const photoName = (angle: PhotoAngle) =>
    before
      ? t('{angle} before photo for {who}', { angle: angleName(angle), who })
      : t('{angle} after photo for {who}', { angle: angleName(angle), who });
  const addName = (angle: PhotoAngle) =>
    before
      ? t('Add {angle} before photo for {who}', { angle: angleName(angle), who })
      : t('Add {angle} after photo for {who}', { angle: angleName(angle), who });

  const upload = async (uris: string[], slot: Slot) => {
    if (uris.length === 0) return;
    setUploading(slot);
    try {
      for (const uri of uris) {
        try {
          const prepared = await prepareForUpload(uri);
          await uploadJobPhoto(booking.id, stage, prepared.bytes, slot === 'extra' ? undefined : slot);
        } catch (error) {
          toast.error(errorText(error, t('Upload failed')));
        }
      }
    } finally {
      setUploading(null);
      onChanged();
    }
  };

  const tap = (slot: Slot) => {
    if (uploading !== null) return;
    if (slot === 'extra' && Device.isDevice) {
      setChoosingMore(true);
    } else if (Device.isDevice) {
      setCamera(slot);
    } else {
      void fromLibrary(slot === 'extra' ? Math.max(0, room) : 1).then((uris) => upload(uris, slot));
    }
  };

  const closeViewer = () => {
    setViewing(null);
    setConfirming(false);
  };

  const handleRemove = async (photoId: string) => {
    setRemovingId(photoId);
    try {
      await deleteJobPhoto(booking.id, photoId);
      closeViewer();
      onChanged();
    } catch (error) {
      toast.error(errorText(error, t('Could not remove this photo')));
    } finally {
      setRemovingId(null);
    }
  };

  if (readOnly && own.length === 0 && customers.length === 0) return null;

  const thumb = (photo: JobPhoto, name: string, isOwn: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('View {photo}', { photo: name })}
      onPress={() => setViewing({ photo, name, own: isOwn })}
      style={styles.thumb}
    >
      <Image source={{ uri: photo.url }} style={styles.fill} />
    </Pressable>
  );

  const big = slots.slice(0, 2);
  const small = slots.slice(2);
  const nextAngle = readOnly ? null : (big.find((slot) => !slot.photo)?.angle ?? null);
  const shortLabel = (angle: PhotoAngle) =>
    angle === 'interior'
      ? t('Inside')
      : angle === 'left'
        ? t('Left')
        : angle === 'right'
          ? t('Right')
          : t(PHOTO_ANGLE_LABELS[angle]);
  const busyAny = uploading !== null;

  return (
    <View style={styles.column}>
      <View style={styles.head}>
        <T accessibilityRole="header" size={20} weight={600}>
          {t(LABELS[stage])}
        </T>
        <View style={[styles.pill, required && own.length >= MIN_GARAGE_PHOTOS && styles.pillDone]}>
          <T
            num
            size={14}
            weight={500}
            lh={18}
            color={required && own.length >= MIN_GARAGE_PHOTOS ? colors.success : colors.textPrimary}
          >
            {counter}
          </T>
        </View>
      </View>
      {own.length === 0 && !readOnly ? (
        <T size={14} color={colors.textSecondary}>
          {hint}
        </T>
      ) : null}
      {!required && !readOnly && own.length < MIN_GARAGE_PHOTOS ? (
        <T size={13} color={colors.textSecondary}>
          {t('Photos protect you if a customer complains, and count toward Gold.')}
        </T>
      ) : null}
      {readOnly && own.length > 0 ? (
        <T size={13} color={colors.textSecondary}>
          {before ? t('Closed once the job was completed.') : t('Closed an hour after the job was completed.')}
        </T>
      ) : null}

      <View style={styles.bigRow}>
        {big.map(({ angle, photo }) => {
          const label = t(PHOTO_ANGLE_LABELS[angle]);
          if (photo) {
            const name = photoName(angle);
            return (
              <View key={angle} style={styles.bigCell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('View {photo}', { photo: name })}
                  onPress={() => setViewing({ photo, name, own: true })}
                  style={styles.bigPhoto}
                >
                  <Image source={{ uri: photo.url }} style={styles.fill} />
                </Pressable>
                <View style={styles.check}>
                  <IconCheck size={16} stroke={3} color={colors.chosenText} />
                </View>
                <View style={styles.angleTag} pointerEvents="none">
                  <T size={14} weight={500} lh={18} color={colors.white}>
                    {label}
                  </T>
                </View>
              </View>
            );
          }
          if (room <= 0) return <View key={angle} style={styles.bigCell} />;
          const isNext = angle === nextAngle;
          return (
            <Pressable
              key={angle}
              accessibilityRole="button"
              accessibilityLabel={addName(angle)}
              disabled={busyAny}
              onPress={() => tap(angle)}
              style={[styles.bigCell, styles.bigTile, isNext ? styles.bigNext : styles.bigIdle, busyAny && styles.dim]}
            >
              {uploading === angle ? (
                <ActivityIndicator color={colors.textPrimary} accessibilityLabel={t('Uploading')} />
              ) : (
                <IconCamera size={30} color={isNext ? colors.textPrimary : colors.textSecondary} />
              )}
              <T size={16} weight={600} color={isNext ? colors.textPrimary : colors.textSecondary}>
                {label}
              </T>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.smallRow}>
        {small.map(({ angle, photo }) => {
          if (photo) {
            const label = t(PHOTO_ANGLE_LABELS[angle]);
            return (
              <View key={angle} style={styles.thumbCell}>
                <View>
                  {thumb(photo, photoName(angle), true)}
                  <View style={styles.smallCheck}>
                    <IconCheck size={12} stroke={3} color={colors.chosenText} />
                  </View>
                </View>
                <T size={13} color={colors.textSecondary}>
                  {label}
                </T>
              </View>
            );
          }
          if (room <= 0) return null;
          return (
            <Pressable
              key={angle}
              accessibilityRole="button"
              accessibilityLabel={addName(angle)}
              disabled={busyAny}
              onPress={() => tap(angle)}
              style={[styles.smallChip, busyAny && styles.dim]}
            >
              {uploading === angle ? <ActivityIndicator size="small" color={colors.textPrimary} /> : <T size={16}>+</T>}
              <T size={16}>{shortLabel(angle)}</T>
            </Pressable>
          );
        })}

        {extras.map((photo, i) => (
          <View key={photo.id} style={styles.thumbCell}>
            {thumb(
              photo,
              before
                ? t('extra before photo {n} for {who}', { n: i + 1, who })
                : t('extra after photo {n} for {who}', { n: i + 1, who }),
              true
            )}
            <T size={13} color={colors.textSecondary}>
              {t('Extra')}
            </T>
          </View>
        ))}

        {room > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={before ? t('Add before photos for {who}', { who }) : t('Add after photos for {who}', { who })}
            disabled={busyAny}
            onPress={() => tap('extra')}
            style={[styles.smallChip, busyAny && styles.dim]}
          >
            {uploading === 'extra' ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <IconCameraPlus size={18} />
            )}
            <T size={16}>{t('More')}</T>
          </Pressable>
        ) : null}
      </View>

      {customers.length > 0 ? (
        <View style={styles.customers}>
          <T size={13} color={colors.textSecondary}>{t('From {who}', { who })}</T>
          <View style={styles.smallRow}>
            {customers.map((photo, i) => (
              <View key={photo.id} style={styles.thumbCell}>
                {thumb(
                  photo,
                  before
                    ? t("customer's before photo {n}", { n: i + 1 })
                    : t("customer's after photo {n}", { n: i + 1 }),
                  false
                )}
                <T size={13} color={colors.textSecondary}>
                  {angleLabel(photo.angle)}
                </T>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <ScModal
        open={viewing !== null}
        onClose={closeViewer}
        dismissible={removingId === null}
        accessibilityLabel={viewing ? capitalise(viewing.name) : t('Job photo')}
      >
        {viewing ? (
          <View style={styles.viewer}>
            <Image
              accessibilityLabel={capitalise(viewing.name)}
              source={{ uri: viewing.photo.url }}
              onLoad={(event) => {
                const { width, height } = event.nativeEvent.source;
                if (width && height) setViewerRatio(width / height);
              }}
              style={[styles.viewerImage, { aspectRatio: viewerRatio }]}
              resizeMode="contain"
            />
            {confirming ? (
              <>
                <T size={15}>
                  {before
                    ? t('Remove this before photo? It is your record of the job if the customer questions the work later.')
                    : t('Remove this after photo? It is your record of the job if the customer questions the work later.')}
                </T>
                <View style={styles.viewerRow}>
                  <View style={styles.half}>
                    <ScButton variant="outline" disabled={removingId !== null} onPress={() => setConfirming(false)}>
                      {t('Keep')}
                    </ScButton>
                  </View>
                  <View style={styles.half}>
                    <ScButton
                      variant="danger-outline"
                      disabled={removingId !== null}
                      accessibilityLabel={t('Remove {name}', { name: viewing.name })}
                      onPress={() => void handleRemove(viewing.photo.id)}
                    >
                      {removingId === viewing.photo.id ? t('Removing…') : t('Remove')}
                    </ScButton>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.viewerRow}>
                <View style={styles.half}>
                  <ScButton variant="outline" onPress={closeViewer}>
                    {t('Close')}
                  </ScButton>
                </View>
                {!readOnly && viewing.own ? (
                  <View style={styles.half}>
                    <ScButton variant="outline" onPress={() => setConfirming(true)}>
                      {t('Remove photo')}
                    </ScButton>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        ) : null}
      </ScModal>

      <CameraCapture
        open={camera !== null}
        title={
          camera && camera !== 'extra' ? `${t(LABELS[stage])} · ${t(PHOTO_ANGLE_LABELS[camera])}` : t(LABELS[stage])
        }
        label={camera && camera !== 'extra' ? t(PHOTO_ANGLE_LABELS[camera]) : undefined}
        hint={hint}
        counter={counter}
        onClose={() => setCamera(null)}
        onTaken={(uri) => {
          const slot = camera ?? 'extra';
          setCamera(null);
          void upload([uri], slot);
        }}
      />

      {/* More: the web's file input offers camera or gallery; here, the same two. */}
      <ScSheet open={choosingMore} onClose={() => setChoosingMore(false)} accessibilityLabel={t('Add photos')} horizontalPadding={16}>
        <View style={styles.moreSheet}>
          <ScButton
            variant="outline"
            onPress={() => {
              setChoosingMore(false);
              setTimeout(() => setCamera('extra'), AFTER_SHEET_MS);
            }}
          >
            {t('Take a photo')}
          </ScButton>
          <ScButton
            variant="outline"
            onPress={() => {
              setChoosingMore(false);
              setTimeout(() => void fromLibrary(Math.max(0, room)).then((uris) => upload(uris, 'extra')), AFTER_SHEET_MS);
            }}
          >
            {t('Choose from library')}
          </ScButton>
        </View>
      </ScSheet>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  fill: { width: '100%', height: '100%' },
  column: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pillDone: { borderColor: colors.successBorder },
  bigRow: { flexDirection: 'row', gap: 12 },
  bigCell: { flex: 1, aspectRatio: 4 / 3 },
  bigPhoto: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bigTile: { borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bigNext: { borderColor: colors.red, backgroundColor: colors.redWash },
  bigIdle: { borderColor: colors.border },
  dim: { opacity: 0.6 },
  check: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.successFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  angleTag: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,11,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  smallRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallChip: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    paddingHorizontal: 16,
  },
  thumbCell: { alignItems: 'center', gap: 4 },
  thumb: {
    width: 64,
    height: 64,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  smallCheck: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.successFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customers: { gap: 4, paddingTop: 4 },
  viewer: { gap: 12 },
  viewerImage: { width: '100%', maxHeight: Dimensions.get('window').height * 0.6, borderRadius: 12 },
  viewerRow: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  moreSheet: { gap: 10 },
}));
