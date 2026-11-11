import type { MediaConfig, VideoStart } from '@repo/core/api/service-media';
import { CONSENT_TEXT } from '@repo/core/service-media';
import type { ServiceMedia } from '@repo/core/types';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { IconCheck, IconPhotoPlus, IconX } from '@repo/native-ui/icons';
import { AFTER_SHEET_MS, ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { errorText } from '@/lib/error-text';
import { prepareForUpload } from '@/lib/photo-prepare';
import { discardCached } from '@/lib/private-cache';
import {
  getServiceMedia,
  removeServiceMedia,
  startServiceVideo,
  uploadServicePhoto,
  uploadVideoFile,
} from '@/lib/service-media-api';
import {
  checkPhotoPick,
  checkVideoPick,
  DEFAULT_MAX_PHOTOS,
  emptyPhotoSlots,
  mediaSlots,
  POLL_MS,
  processingIdOf,
  replacingVideo,
  settledList,
  startedList,
  type VideoWork,
} from '@/lib/service-media-rules';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { Num } from './figures';
import { useTileStyles, VideoSlot, VideoStatusLine } from './media-video';
import { fill, useT } from '@repo/core/i18n';

type Source = 'camera' | 'library';

/**
 * ServiceMediaEditor (packages/ui/src/features/service-media-editor.tsx): "Photos and
 * video", the upload block for one service or package.
 *
 * The privacy tick comes first and every add stays disabled until it is ticked; the
 * server refuses an upload without it too. Up to the configured number of photos and,
 * when Stream is set up, one video of at most 60 seconds, checked on the phone before
 * anything is uploaded. A video then shows its progress, "Processing…" while Stream
 * encodes it (polled every few seconds as a backstop to the webhook), and either Ready
 * with Replace / Remove or a plain error.
 *
 * Photos are re-encoded by photo-prepare.ts before they leave the phone (that is what
 * drops the location), never core's stripImageMetadata.
 */
export function ServiceMediaEditor({
  serviceId,
  serviceName,
  media,
  onMediaChange,
  config,
}: {
  serviceId: string;
  serviceName: string;
  media: ServiceMedia[];
  onMediaChange: (media: ServiceMedia[]) => void;
  /** Null while loading: photos only until it says video is on. */
  config: MediaConfig | null;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const tileStyles = useTileStyles();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<'photo' | 'remove' | null>(null);
  const [video, setVideo] = useState<VideoWork>({ step: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  // The latest list and callback, for the poll and the upload, which outlive a render.
  // Kept in refs so the poll is not restarted by every parent update: a screen
  // re-rendering faster than POLL_MS (someone typing in a form) would never let it fire.
  const mediaRef = useRef(media);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  const onMediaChangeRef = useRef(onMediaChange);
  useEffect(() => {
    onMediaChangeRef.current = onMediaChange;
  }, [onMediaChange]);

  const maxPhotos = config?.maxPhotos ?? DEFAULT_MAX_PHOTOS;
  const videoOn = config?.video === true;
  const { photos, liveVideo, pendingVideo, currentVideo } = mediaSlots(media);
  const processingId = processingIdOf(currentVideo, video.step === 'uploading');

  // Poll a processing video until Stream has an answer.
  useEffect(() => {
    if (!processingId) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await getServiceMedia(serviceId, processingId);
        if (fresh.videoStatus !== 'processing') {
          onMediaChangeRef.current(settledList(mediaRef.current, fresh));
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [serviceId, processingId]);

  const fail = (err: unknown, fallback: string) => setError(errorText(err, fallback));

  const addPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    setError(null);
    const refused = checkPhotoPick(asset);
    if (refused) {
      discardCached([asset.uri]);
      setError(refused);
      return;
    }
    setBusy('photo');
    let preparedUri: string | null = null;
    try {
      const prepared = await prepareForUpload(asset.uri, t('That photo'));
      preparedUri = prepared.uri;
      onMediaChange(await uploadServicePhoto(serviceId, prepared.bytes));
    } catch (err) {
      fail(err, t('The photo did not upload. Try again.'));
    } finally {
      // The picker's copy of the original (location still on it) goes whatever happened.
      discardCached([asset.uri, preparedUri]);
      setBusy(null);
    }
  };

  const pickPhoto = async (source: Source) => {
    let result: ImagePicker.ImagePickerResult;
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(t('Allow the camera in Settings to take a photo, or choose one from the library.'));
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', exif: false });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', exif: false });
      }
    } catch (err) {
      fail(err, t('The photo did not upload. Try again.'));
      return;
    }
    if (!result.canceled && result.assets[0]) await addPhoto(result.assets[0]);
  };

  /** A phone offers the camera or the library, as the web's file box does; a simulator has the library. */
  const askForPhoto = () => {
    if (Device.isDevice) setChoosing(true);
    else void pickPhoto('library');
  };

  const sendVideo = async (asset: ImagePicker.ImagePickerAsset) => {
    setError(null);
    setVideo({ step: 'checking' });

    let measured: number | null = null;
    if (!asset.fileSize) {
      try {
        measured = new File(asset.uri).size;
      } catch {
        measured = null;
      }
    }
    const check = checkVideoPick(asset, measured);
    if (!check.ok) {
      setVideo({ step: 'refused', message: check.message, durationSecs: check.durationSecs });
      return;
    }

    const replacing = replacingVideo(mediaRef.current);
    let started: VideoStart | null = null;
    try {
      started = await startServiceVideo(serviceId, {
        sizeBytes: check.sizeBytes,
        ...(check.durationSecs !== null ? { durationSecs: check.durationSecs } : {}),
        ...(replacing ? { replaces: replacing.id } : {}),
      });
      onMediaChange(startedList(mediaRef.current, started.media, replacing));
      setVideo({ step: 'uploading', fraction: 0 });
      await uploadVideoFile(
        started,
        { uri: asset.uri, mimeType: asset.mimeType, size: check.sizeBytes },
        (fraction) => setVideo({ step: 'uploading', fraction })
      );
      setVideo({ step: 'idle' });
    } catch (err) {
      setVideo({ step: 'idle' });
      // An upload that never arrived leaves a row Stream will never finish: take it
      // away so the slot is free again. A video it was replacing is still there and
      // comes back into the slot.
      if (started) {
        try {
          onMediaChange(await removeServiceMedia(serviceId, started.media.id));
        } catch {
          // Left as processing; the server gives up on it after two hours.
        }
      }
      fail(err, t('The video did not upload. Try again.'));
    }
  };

  const pickVideo = async () => {
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', allowsMultipleSelection: false });
    } catch (err) {
      fail(err, t('The video did not upload. Try again.'));
      return;
    }
    if (!result.canceled && result.assets[0]) await sendVideo(result.assets[0]);
  };

  const remove = async (item: ServiceMedia) => {
    setError(null);
    setBusy('remove');
    try {
      onMediaChange(await removeServiceMedia(serviceId, item.id));
      if (item.kind === 'video') setVideo({ step: 'idle' });
    } catch (err) {
      fail(err, t('That did not go. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const addDisabled = !consent || busy !== null;
  const videoBusy = video.step === 'checking' || video.step === 'uploading';

  // Photo cells, three to a row (the web's grid-cols-3); the video sits after the first
  // three, past a hairline, in the same row.
  const cells = [
    ...photos.map((photo, i) => (
      <View key={photo.id} style={[tileStyles.tile, tileStyles.filled]}>
        <Image
          source={{ uri: photo.url }}
          accessibilityLabel={t('Photo {n} of {service}', { n: i + 1, service: serviceName })}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
        {photo.source === 'ai' ? (
          <View style={styles.sample}>
            <T size={11} weight={500} lh={16} color={colors.white}>
              {t('Sample')}
            </T>
          </View>
        ) : null}
        {/* A 44px target in the corner; the disc stays small so it covers less of the photo. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Remove photo {n} of {service}', { n: i + 1, service: serviceName })}
          disabled={busy !== null}
          onPress={() => void remove(photo)}
          style={[styles.removeHit, busy !== null && { opacity: 0.5 }]}
        >
          <View style={styles.removeDisc}>
            <IconX size={14} stroke={2.5} color={colors.white} />
          </View>
        </Pressable>
      </View>
    )),
    ...Array.from({ length: emptyPhotoSlots(maxPhotos, photos.length) }, (_, i) => (
      <Pressable
        key={`empty-${i}`}
        accessibilityRole="button"
        accessibilityLabel={t('Add a photo of {service}', { service: serviceName })}
        accessibilityHint={consent ? undefined : t('Tick the box above first')}
        disabled={addDisabled}
        onPress={askForPhoto}
        style={[tileStyles.tile, tileStyles.empty, addDisabled && { opacity: 0.4 }]}
      >
        <IconPhotoPlus size={22} stroke={1.6} color={colors.textSecondary} />
        <T size={12} weight={500} lh={16} color={colors.textSecondary} align="center">
          {busy === 'photo' && i === 0 ? t('Adding…') : t('Add photo')}
        </T>
      </Pressable>
    )),
  ];

  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
  if (rows.length === 0) rows.push([]);

  const videoCell = (
    <VideoSlot
      video={currentVideo}
      work={video}
      serviceName={serviceName}
      disabled={!consent || busy !== null || videoBusy}
      onAdd={() => void pickVideo()}
    />
  );

  return (
    // Named for its service: a screen lists several of these.
    <View accessibilityLabel={t('Photos and video of {service}', { service: serviceName })} style={styles.column}>
      <View style={styles.head}>
        <T size={13} weight={500} color={colors.textSecondary}>
          {t('Photos and video')}
        </T>
        <T size={12} color={colors.textMuted} style={styles.headHint}>
          {videoOn
            ? fill(t('Up to {photos} photos and {videos} video'), { photos: <Num>{maxPhotos}</Num>, videos: <Num>1</Num> })
            : fill(t('Up to {photos} photos'), { photos: <Num>{maxPhotos}</Num> })}
        </T>
      </View>

      {/* The privacy tick, first: nothing can be added until it is given. */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent((current) => !current)}
        style={styles.consent}
      >
        <View style={[styles.box, consent && styles.boxOn]}>
          {consent ? <IconCheck size={16} stroke={3} color={colors.chosenText} /> : null}
        </View>
        <T size={13} lh={18} color={colors.textSecondary} style={styles.flex}>
          <T size={13} lh={18} weight={600}>
            {t('Before adding:')}
          </T>{' '}
          {t(CONSENT_TEXT)}
        </T>
      </Pressable>

      <View style={styles.grid}>
        {rows.map((row, r) => {
          const withVideo = videoOn && r === 0;
          // Short rows keep their cells' width with empty cells.
          const padded = [...row, ...Array.from({ length: 3 - row.length }, (_, i) => <View key={`pad-${r}-${i}`} />)];
          return (
            <View key={r} style={styles.row}>
              {padded.map((cell, c) => (
                <View key={c} style={styles.cell}>
                  {cell}
                </View>
              ))}
              {withVideo ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.cell}>{videoCell}</View>
                </>
              ) : null}
            </View>
          );
        })}
      </View>

      {videoOn ? (
        <VideoStatusLine
          video={currentVideo}
          keepsEarlier={pendingVideo !== undefined && liveVideo !== undefined}
          work={video}
          busy={busy !== null || videoBusy}
          canReplace={consent}
          onReplace={() => void pickVideo()}
          onRemove={() => currentVideo && void remove(currentVideo)}
        />
      ) : null}

      {error ? (
        <T accessibilityRole="alert" size={13} color={colors.error}>
          {error}
        </T>
      ) : null}

      <T size={12} lh={16} color={colors.textMuted}>
        {t('Upload the original file from the phone’s gallery — not a WhatsApp forward — for the sharpest result.')}
      </T>

      {/* The web's file box offers the camera or the gallery; here, the same two. */}
      <ScSheet open={choosing} onClose={() => setChoosing(false)} accessibilityLabel={t('Add a photo')} horizontalPadding={16}>
        <View style={styles.choices}>
          <ScButton
            variant="outline"
            onPress={() => {
              setChoosing(false);
              setTimeout(() => void pickPhoto('camera'), AFTER_SHEET_MS);
            }}
          >
            {t('Take a photo')}
          </ScButton>
          <ScButton
            variant="outline"
            onPress={() => {
              setChoosing(false);
              setTimeout(() => void pickPhoto('library'), AFTER_SHEET_MS);
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
  flex: { flex: 1, minWidth: 0 },
  column: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  headHint: { flexShrink: 1, textAlign: 'right' },
  consent: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  box: {
    marginTop: 2,
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { borderColor: colors.chosenBg, backgroundColor: colors.chosenBg },
  grid: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  cell: { flex: 1, minWidth: 0 },
  divider: { width: 1, marginVertical: 12, backgroundColor: colors.border },
  sample: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    borderRadius: 6,
    // Over the photo: dark in both themes.
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  removeHit: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  choices: { gap: 8 },
}));
