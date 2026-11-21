import { ApiError } from '@repo/core/api/client';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { Label, ScButton } from '@repo/native-ui/button';
import { ScCard, Skeleton } from '@repo/native-ui/primitives';
import { TopBar } from '@/components/rows';
import { IconChevronLeft, IconChevronRight, IconStar, IconTrash } from '@repo/native-ui/icons';
import { IconBuildingStore, IconPhoto, IconUpload } from '@/components/owner-icons';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { useIsVendorAdmin } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { getMyVendor } from '@/lib/garage-api';
import { prepareForUpload } from '@/lib/photo-prepare';
import { discardCached } from '@/lib/private-cache';
import {
  LOGO_REMOVE_FAILED,
  LOGO_SUBTITLE,
  logoProblem,
  PHOTO_DELETE_FAILED,
  photoProblem,
  PHOTOS_LOAD_FAILED,
  PHOTOS_SUBTITLE,
  tileSize,
  UPLOAD_FAILED,
} from '@/lib/photos-view';
import { createStyles, useColors } from '@repo/native-ui/theme';
import {
  type ApiVendorPhoto,
  deleteVendorLogo,
  deleteVendorPhoto,
  getMyPhotos,
  setVendorPhotoOrder,
  uploadVendorLogo,
  uploadVendorPhoto,
} from '@/lib/vendor-api';
import { useT } from '@repo/core/i18n';
import {
  movedPhotos,
  PHOTO_ORDER_STALE,
  PHOTO_ORDER_WORDS,
  photoMoves,
  withOrderOf,
  type PhotoMove,
} from '@repo/core/photo-order';

const GAP = 8;
// The web's back arrow goes to /settings; in the tab bar `back` would land on Home instead.
const goBack = () => router.navigate('/settings');

/**
 * Garage photos (apps/vendors/app/photos/page.tsx): the logo shown next to the garage in customer
 * listings, and the photos on its public listing. The owner seat only: an operator is sent
 * home. Every image is re-encoded as a JPEG by photo-prepare.ts, which drops its location.
 */
function PhotosScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const isVendorAdmin = useIsVendorAdmin();
  const [photos, setPhotos] = useState<ApiVendorPhoto[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  // Make cover and the arrows wait for an upload or delete to finish, so the order sent is the
  // list the server has (anything else is refused), as on the web.
  const orderLocked = ordering || uploading || deletingId !== null;
  const [gridWidth, setGridWidth] = useState(0);
  const tile = tileSize(gridWidth, GAP);

  // The server keeps the catalogue and media to the owner seat, and an operator's nav has none.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home');
  }, [isVendorAdmin]);

  useEffect(() => {
    if (!isVendorAdmin) return;
    let cancelled = false;
    Promise.all([getMyPhotos(), getMyVendor()])
      .then(([list, vendor]) => {
        if (cancelled) return;
        setPhotos(list);
        setLogoUrl(vendor.logoUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace('/login');
          return;
        }
        toast.error(t(PHOTOS_LOAD_FAILED));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isVendorAdmin]);

  const handleLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', exif: false });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    // The picker's copy of the original (location still on it) is deleted whatever happens next:
    // refused, unreadable, failed or sent.
    const problem = logoProblem({ name: asset.fileName ?? t('Logo'), mimeType: asset.mimeType, size: asset.fileSize });
    if (problem) {
      discardCached([asset.uri]);
      toast.error(problem);
      return;
    }
    setLogoBusy(true);
    let preparedUri: string | null = null;
    try {
      const prepared = await prepareForUpload(asset.uri, t('This logo'));
      preparedUri = prepared.uri;
      const vendor = await uploadVendorLogo(prepared.bytes);
      setLogoUrl(vendor.logoUrl);
      toast.success(t('Logo updated'));
    } catch (err) {
      toast.error(errorText(err, t(UPLOAD_FAILED)));
    } finally {
      discardCached([asset.uri, preparedUri]);
      setLogoBusy(false);
    }
  };

  const handleRemoveLogo = async () => {
    setLogoBusy(true);
    try {
      await deleteVendorLogo();
      setLogoUrl(null);
    } catch {
      toast.error(t(LOGO_REMOVE_FAILED));
    } finally {
      setLogoBusy(false);
    }
  };

  const handleFiles = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    setUploading(true);
    try {
      for (const [index, asset] of result.assets.entries()) {
        const name = asset.fileName ?? t('Photo {n}', { n: index + 1 });
        const problem = photoProblem({ name, mimeType: asset.mimeType, size: asset.fileSize });
        if (problem) {
          discardCached([asset.uri]);
          toast.error(problem);
          continue;
        }
        let preparedUri: string | null = null;
        try {
          const prepared = await prepareForUpload(asset.uri, name);
          preparedUri = prepared.uri;
          const created = await uploadVendorPhoto(prepared.bytes);
          setPhotos((prev) => [...prev, created]);
        } finally {
          discardCached([asset.uri, preparedUri]);
        }
      }
    } catch (err) {
      // The pictures after the one that failed were never read: their copies go too.
      discardCached(result.assets.map((a) => a.uri));
      toast.error(errorText(err, t(UPLOAD_FAILED)));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteVendorPhoto(id);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error(t(PHOTO_DELETE_FAILED));
    } finally {
      setDeletingId(null);
    }
  };

  // Make cover and the ← → arrows (@repo/core/photo-order), as the web's Photos page: the new
  // order shows at once and saves at once. A failed save puts the order back; a stale one (photos
  // changed on another device) shows them as they are now.
  const handleMove = async (id: string, move: PhotoMove) => {
    if (orderLocked) return;
    const next = movedPhotos(photos, id, move);
    if (!next) return;
    const previousIds = photos.map((p) => p.id);
    setPhotos(next);
    setOrdering(true);
    try {
      const saved = await setVendorPhotoOrder(next.map((p) => p.id));
      setPhotos((prev) => withOrderOf(prev, saved.map((p) => p.id)));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/login');
        return;
      }
      if (err instanceof ApiError && err.code === PHOTO_ORDER_STALE) {
        try {
          setPhotos(await getMyPhotos());
        } catch {
          setPhotos((prev) => withOrderOf(prev, previousIds));
        }
        toast.error(t(PHOTO_ORDER_WORDS.stale));
        return;
      }
      setPhotos((prev) => withOrderOf(prev, previousIds));
      toast.error(t(PHOTO_ORDER_WORDS.failed));
    } finally {
      setOrdering(false);
    }
  };

  return (
    <AppShell>
      <TopBar title={t('Garage photos')} onBack={goBack} />

      <View style={styles.section}>
        <View style={styles.heading}>
          <T accessibilityRole="header" size={15} weight={600}>
            {t('Logo')}
          </T>
          <T size={12} color={colors.textSecondary}>
            {t(LOGO_SUBTITLE)}
          </T>
        </View>
        <ScCard style={styles.logoCard}>
          <View style={styles.logo}>
            {logoUrl ? (
              <Image accessibilityLabel={t('Logo')} source={{ uri: logoUrl }} resizeMode="cover" style={styles.fill} />
            ) : (
              <IconBuildingStore size={26} color={colors.textMuted} />
            )}
          </View>
          <View style={styles.logoActions}>
            <ScButton variant="outline" disabled={logoBusy} onPress={() => void handleLogo()}>
              {logoBusy ? t('Working…') : logoUrl ? t('Change logo') : t('Add logo')}
            </ScButton>
            {/* A quiet text button: removing the logo is not what this screen is for. */}
            {logoUrl ? (
              <Pressable
                accessibilityRole="button"
                disabled={logoBusy}
                onPress={() => void handleRemoveLogo()}
                style={[styles.removeLogo, logoBusy && { opacity: 0.5 }]}
              >
                <T size={12} weight={500} color={colors.textSecondary} style={styles.underline}>
                  {t('Remove logo')}
                </T>
              </Pressable>
            ) : null}
          </View>
        </ScCard>
      </View>

      <View style={styles.section}>
        <View style={styles.heading}>
          <View style={styles.row}>
            <T accessibilityRole="header" size={15} weight={600}>
              {t('Photos')}
            </T>
            {ordering ? (
              <T accessibilityRole="text" accessibilityLiveRegion="polite" size={12} color={colors.textMuted}>
                {t('Saving…')}
              </T>
            ) : photos.length > 0 ? (
              <T num size={12} color={colors.textMuted}>
                {photos.length}
              </T>
            ) : null}
          </View>
          <T size={12} color={colors.textSecondary}>
            {t(PHOTOS_SUBTITLE)}
          </T>
          {photos.length > 1 ? (
            <T size={12} color={colors.textSecondary}>
              {t(PHOTO_ORDER_WORDS.hint)}
            </T>
          ) : null}
        </View>

        {/* The screen's one main action. */}
        <ScButton variant="main" size="lg" disabled={uploading || ordering} onPress={() => void handleFiles()}>
          <IconUpload size={18} color={colors.white} />
          <Label color={colors.white}>{uploading ? t('Uploading…') : t('Add photos')}</Label>
        </ScButton>

        <View style={styles.grid} onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
          {loading ? (
            tile > 0 ? (
              Array.from({ length: 4 }, (_, i) => (
                <View key={i} style={{ width: tile }}>
                  <Skeleton height={tile} />
                </View>
              ))
            ) : null
          ) : photos.length === 0 ? (
            <View style={styles.empty}>
              <IconPhoto size={28} stroke={1.5} color={colors.textMuted} />
              <T size={14} weight={600}>
                {t('No photos yet')}
              </T>
              <T size={12} color={colors.textSecondary}>
                {t('Add photos of your garage and work')}
              </T>
            </View>
          ) : (
            photos.map((photo, i) => {
              const moves = photoMoves(i, photos.length);
              return (
                <View key={photo.id} style={[styles.tile, { width: tile, height: tile }]}>
                  <Image
                    accessibilityLabel={t('Garage photo {n}', { n: i + 1 })}
                    source={{ uri: photo.url }}
                    resizeMode="cover"
                    style={styles.fill}
                  />
                  {moves.isCover ? (
                    <View style={styles.coverTag}>
                      <T size={12} weight={600} color={colors.white}>
                        {t(PHOTO_ORDER_WORDS.cover)}
                      </T>
                    </View>
                  ) : null}
                  {/* A full 44px target in the corner; the dark disc keeps it legible on any photo. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Delete photo')}
                    disabled={deletingId === photo.id || ordering}
                    onPress={() => void handleDelete(photo.id)}
                    style={[styles.trash, (deletingId === photo.id || ordering) && { opacity: 0.5 }]}
                  >
                    <View style={styles.disc}>
                      <IconTrash size={15} color={colors.white} />
                    </View>
                  </Pressable>
                  {/* ← Make cover → along the bottom, 44px targets each. */}
                  <View style={styles.moves}>
                    <MoveButton
                      label={t(PHOTO_ORDER_WORDS.left)}
                      disabled={orderLocked || !moves.left}
                      onPress={() => void handleMove(photo.id, 'left')}
                    >
                      <IconChevronLeft size={16} color={colors.white} />
                    </MoveButton>
                    {moves.cover ? (
                      <MoveButton
                        label={t(PHOTO_ORDER_WORDS.makeCover)}
                        disabled={orderLocked}
                        onPress={() => void handleMove(photo.id, 'cover')}
                      >
                        <IconStar size={15} color={colors.white} />
                      </MoveButton>
                    ) : (
                      <View style={styles.moveSpacer} />
                    )}
                    <MoveButton
                      label={t(PHOTO_ORDER_WORDS.right)}
                      disabled={orderLocked || !moves.right}
                      onPress={() => void handleMove(photo.id, 'right')}
                    >
                      <IconChevronRight size={16} color={colors.white} />
                    </MoveButton>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    </AppShell>
  );
}

/** A 44px target with the dark disc drawn inside, as the delete button. */
function MoveButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.move, disabled && { opacity: 0.4 }]}
    >
      <View style={styles.disc}>{children}</View>
    </Pressable>
  );
}

export default garageScreen(PhotosScreen);

const useStyles = createStyles((colors) => ({
  section: { gap: 12 },
  heading: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logoCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logo: {
    width: 64,
    height: 64,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
  fill: { width: '100%', height: '100%' },
  logoActions: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  removeLogo: { minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { overflow: 'hidden', borderRadius: 12, backgroundColor: colors.surface },
  trash: { position: 'absolute', right: 0, top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  coverTag: {
    position: 'absolute',
    left: 8,
    top: 8,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  moves: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  move: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  moveSpacer: { width: 44, height: 44 },
  disc: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  empty: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingVertical: 48,
  },
}));
