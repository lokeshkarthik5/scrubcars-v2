import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState, type ComponentRef } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/lib/theme';

import { ScButton } from '@repo/native-ui/button';
import { IconBolt, IconCar, IconX } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';

/**
 * Native only (frame E): the website opens the phone's plain camera; this adds the
 * angle guide, in the web's buttons, pill, wording and colours. Back camera, flash
 * off by default. What it takes still goes through photo-prepare.ts before upload.
 */
export function CameraCapture({
  open,
  title,
  label,
  hint,
  counter,
  onClose,
  onTaken,
}: {
  open: boolean;
  /** "After photos · Front". */
  title: string;
  /** The angle, on the guide. */
  label?: string;
  hint: string;
  counter: string;
  onClose: () => void;
  onTaken: (uri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState(false);
  const [taking, setTaking] = useState(false);
  const camera = useRef<ComponentRef<typeof CameraView>>(null);

  if (!open) return null;

  const take = async () => {
    if (taking) return;
    setTaking(true);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 1, exif: false });
      if (photo?.uri) onTaken(photo.uri);
    } finally {
      setTaking(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={onClose} style={styles.round}>
            <IconX size={22} />
          </Pressable>
          <T accessibilityRole="header" size={17} weight={600} style={styles.title} numberOfLines={1}>
            {title}
          </T>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Flash"
            accessibilityState={{ checked: flash }}
            onPress={() => setFlash((value) => !value)}
            style={[styles.round, flash && styles.flashOn]}
          >
            <IconBolt size={22} color={flash ? colors.brandBlack : colors.textPrimary} />
          </Pressable>
        </View>

        {permission?.granted ? (
          <View style={styles.middle}>
            <View style={styles.guide}>
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" flash={flash ? 'on' : 'off'} />
              <View pointerEvents="none" style={styles.guideIcon}>
                <IconCar size={150} stroke={1} />
              </View>
              {label ? (
                <View pointerEvents="none" style={styles.chip}>
                  <T size={14} weight={500} lh={18}>
                    {label}
                  </T>
                </View>
              ) : null}
            </View>
            <T size={15} lh={22} color={colors.textSecondary} align="center" style={styles.hint}>
              {hint}
            </T>
          </View>
        ) : (
          <View style={styles.middle}>
            <T size={15} color={colors.textSecondary} align="center" style={styles.hint}>
              Detlio needs the camera to take photos of the car.
            </T>
            <ScButton
              variant="outline"
              fullWidth={false}
              style={styles.allow}
              onPress={() => {
                if (permission && !permission.canAskAgain) void Linking.openSettings();
                else void requestPermission();
              }}
            >
              {permission && !permission.canAskAgain ? 'Open Settings' : 'Allow camera'}
            </ScButton>
          </View>
        )}

        <View style={styles.foot}>
          <View style={styles.counter}>
            <T num size={14} weight={500} lh={18}>
              {counter}
            </T>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            disabled={!permission?.granted || taking}
            onPress={() => void take()}
            style={[styles.shutter, taking && styles.shutterBusy]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.brandBlack, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, textAlign: 'center' },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashOn: { backgroundColor: colors.textPrimary },
  middle: { flex: 1, justifyContent: 'center' },
  guide: {
    aspectRatio: 1,
    width: '100%',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.brandRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideIcon: { opacity: 0.8 },
  chip: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,11,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  hint: { marginTop: 16, paddingHorizontal: 8 },
  allow: { alignSelf: 'center', marginTop: 16 },
  foot: { height: 84, alignItems: 'center', justifyContent: 'center' },
  counter: {
    position: 'absolute',
    left: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: { opacity: 0.5 },
  shutterInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.white },
});
