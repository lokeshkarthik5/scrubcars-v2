import { angleLabel } from '@repo/core/job-photo-standards';
import type { JobPhoto } from '@repo/core/types';
import { type ReactNode, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { garageStages, hasGaragePhotos } from '@/lib/guarantee-view';
import { createStyles, ThemeScope, useColors } from '@repo/native-ui/theme';

import { BeforeAfterCompare } from './before-after';
import { IconX } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { useT } from '@repo/core/i18n';

/** A photo the customer took of the problem (Detlio Guarantee, 0051). */
export interface ClaimPhotoView {
  id: string;
  url: string;
}

/**
 * The photos are private: their addresses are short-lived signed URLs. They are
 * drawn with React Native's own Image, never expo-image (which keeps a disk cache of
 * every address it loads), and asked for afresh ('reload') each time a card appears.
 */
const source = (url: string) => ({ uri: url, cache: 'reload' as const });

function Thumb({ url, label, onOpen }: { url: string; label: string; onOpen: () => void }) {
  const t = useT();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('View {photo}', { photo: label })} onPress={onOpen} style={styles.thumb}>
      <Image source={source(url)} style={styles.thumbImage} resizeMode="cover" />
    </Pressable>
  );
}

function Strip({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {children}
    </ScrollView>
  );
}

/** A photo full screen, on a dark backdrop. */
function PhotoViewer({ open, onClose }: { open: { url: string; label: string }; onClose: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Pressable accessibilityViewIsModal accessibilityLabel={open.label} onPress={onClose} style={styles.viewer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Close photo')}
        onPress={onClose}
        style={[styles.close, { top: insets.top + 16 }]}
      >
        <IconX size={20} />
      </Pressable>
      <Image source={source(open.url)} accessibilityLabel={open.label} style={styles.full} resizeMode="contain" />
      <T size={13} color={colors.textSecondary}>
        {open.label}
      </T>
    </Pressable>
  );
}

/**
 * GuaranteeEvidence (packages/ui/src/features/guarantee-photos.tsx): what Detlio compares
 * on a free redo claim, the customer's photos of the problem beside the garage's own
 * before and after photos of the job. A tap on a photo opens it full screen.
 */
export function GuaranteeEvidence({
  customerPhotos,
  garagePhotos,
  customerTitle: customerTitleGiven,
  garageTitle: garageTitleGiven,
}: {
  customerPhotos?: readonly ClaimPhotoView[];
  garagePhotos: readonly JobPhoto[];
  customerTitle?: string;
  garageTitle?: string;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const customerTitle = customerTitleGiven ?? t("Customer's photos of the problem");
  const garageTitle = garageTitleGiven ?? t("Garage's before and after photos");
  const [open, setOpen] = useState<{ url: string; label: string } | null>(null);
  const stages = garageStages(garagePhotos);
  const garage = garagePhotos.filter((photo) => photo.by === 'garage');

  return (
    <View style={styles.column}>
      {customerPhotos ? (
        <View accessibilityLabel={customerTitle} style={styles.section}>
          <T size={11} weight={500} color={colors.textSecondary} uppercase tracking={0.025}>
            {customerTitle}
          </T>
          <Strip>
            {customerPhotos.map((photo, index) => (
              <Thumb
                key={photo.id}
                url={photo.url}
                label={t('problem photo {n}', { n: index + 1 })}
                onOpen={() => setOpen({ url: photo.url, label: t('Problem photo {n}', { n: index + 1 }) })}
              />
            ))}
          </Strip>
        </View>
      ) : null}

      <View accessibilityLabel={garageTitle} style={styles.section}>
        <T size={11} weight={500} color={colors.textSecondary} uppercase tracking={0.025}>
          {garageTitle}
        </T>
        {!hasGaragePhotos(garagePhotos) ? (
          <T size={12} color={colors.textSecondary}>
            {t('The garage took no photos of this job.')}
          </T>
        ) : (
          <>
            <BeforeAfterCompare photos={garage} title={t('Compare before and after')} />
            {(['before', 'after'] as const).map((stage) =>
              stages[stage].length > 0 ? (
                <View key={stage} style={styles.stage}>
                  <T size={11} color={colors.textSecondary}>
                    {stage === 'before' ? t('Before') : t('After')}
                  </T>
                  <Strip>
                    {stages[stage].map((photo) => {
                      const label =
                        stage === 'before'
                          ? t('before — {angle}', { angle: angleLabel(photo.angle) })
                          : t('after — {angle}', { angle: angleLabel(photo.angle) });
                      return (
                        <Thumb key={photo.id} url={photo.url} label={label} onOpen={() => setOpen({ url: photo.url, label })} />
                      );
                    })}
                  </Strip>
                </View>
              ) : (
                <T key={stage} size={12} color={colors.textSecondary}>
                  {stage === 'before' ? t('No before photos from the garage.') : t('No after photos from the garage.')}
                </T>
              )
            )}
          </>
        )}
      </View>

      {open ? (
        <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(null)}>
          {/* The viewer is dark in both themes, like a photo viewer. */}
          <ThemeScope scheme="dark">
            <PhotoViewer open={open} onClose={() => setOpen(null)} />
          </ThemeScope>
        </Modal>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  column: { gap: 12 },
  section: { gap: 6 },
  stage: { gap: 4 },
  strip: { gap: 8, paddingBottom: 4 },
  thumb: {
    width: 80,
    height: 80,
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumbImage: { width: '100%', height: '100%' },
  viewer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    // A dark scrim over a photo: dark in both themes.
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  close: {
    position: 'absolute',
    right: 16,
    zIndex: 1,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  full: { width: '100%', height: '80%', borderRadius: 12 },
}));
