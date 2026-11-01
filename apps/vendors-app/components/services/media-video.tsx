import { formatClipLength } from '@repo/core/service-media';
import type { ServiceMedia } from '@repo/core/types';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  IconAlertTriangle,
  IconCheck,
  IconPlayerPlayFilled,
  IconVideo,
  IconVideoPlus,
} from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { percent, type VideoWork } from '@/lib/service-media-rules';
import { colors } from '@/lib/theme';

/** A square cell, 12 round: the photo tiles and the video slot share it. */
export const tileStyles = StyleSheet.create({
  tile: { width: '100%', aspectRatio: 1, overflow: 'hidden', borderRadius: 12 },
  filled: { backgroundColor: colors.surfaceElevated },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingHorizontal: 4,
  },
  failed: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.error,
    backgroundColor: colors.errorMuted,
  },
});

/** A thin progress ring; spins when there is no figure to show. */
export function Ring({ fraction }: { fraction: number | null }) {
  const spin = useRef(new Animated.Value(0)).current;
  const indeterminate = fraction === null;
  useEffect(() => {
    if (!indeterminate) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [indeterminate, spin]);

  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={indeterminate ? { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] } : undefined}
    >
      <Svg width={36} height={36} viewBox="0 0 36 36">
        <Circle cx={18} cy={18} r={r} fill="none" stroke={colors.textPrimary} strokeOpacity={0.15} strokeWidth={3} />
        <Circle
          cx={18}
          cy={18}
          r={r}
          fill="none"
          stroke={colors.textPrimary}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={indeterminate ? c * 0.7 : c * (1 - fraction)}
          rotation={-90}
          origin="18, 18"
        />
      </Svg>
    </Animated.View>
  );
}

/** The clip-length pill: video icon and "0:45". */
function LengthPill({ secs, ready }: { secs: number; ready?: boolean }) {
  return (
    <View style={[styles.pill, ready ? styles.pillReady : styles.pillRefused]}>
      <IconVideo size={12} color={ready ? colors.white : colors.error} />
      <T num size={11} weight={500} lh={16} color={ready ? colors.white : colors.error}>
        {formatClipLength(secs)}
      </T>
    </View>
  );
}

/** The video's cell beside the photos: add, checking, uploading, failed, ready or processing. */
export function VideoSlot({
  video,
  work,
  serviceName,
  disabled,
  onAdd,
}: {
  video: ServiceMedia | null;
  work: VideoWork;
  serviceName: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  // Refused on the phone: amber, with the clip's length when known.
  if (work.step === 'refused') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add a different video of ${serviceName}`}
        disabled={disabled}
        onPress={onAdd}
        style={[tileStyles.tile, tileStyles.failed, disabled && { opacity: 0.6 }]}
      >
        <IconAlertTriangle size={24} stroke={1.8} color={colors.error} />
        {work.durationSecs !== null ? <LengthPill secs={work.durationSecs} /> : null}
      </Pressable>
    );
  }

  if (work.step === 'checking' || work.step === 'uploading') {
    const uploading = work.step === 'uploading';
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={uploading ? `Uploading, ${percent(work.fraction)}%` : 'Checking the video'}
        style={[tileStyles.tile, tileStyles.filled, styles.centre]}
      >
        <Ring fraction={uploading ? work.fraction : null} />
        <View style={styles.corner}>
          <IconVideo size={14} color={colors.textSecondary} />
        </View>
      </View>
    );
  }

  if (!video) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add a video of ${serviceName}`}
        disabled={disabled}
        onPress={onAdd}
        style={[tileStyles.tile, tileStyles.empty, disabled && { opacity: 0.4 }]}
      >
        <IconVideoPlus size={22} stroke={1.6} color={colors.textSecondary} />
        <T size={12} weight={500} lh={14} color={colors.textSecondary} align="center">
          Add video
        </T>
        <T size={11} lh={14} color={colors.textMuted} align="center">
          up to <T num size={11} lh={14} color={colors.textMuted}>60</T> sec
        </T>
      </Pressable>
    );
  }

  if (video.videoStatus === 'error') {
    return (
      <View accessibilityLabel="Video failed" style={[tileStyles.tile, tileStyles.failed]}>
        <IconAlertTriangle size={24} stroke={1.8} color={colors.error} />
      </View>
    );
  }

  if (video.videoStatus === 'ready' && video.posterUrl) {
    return (
      <View accessibilityLabel={`Video of ${serviceName}`} style={[tileStyles.tile, tileStyles.filled]}>
        <Image source={{ uri: video.posterUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
          <View style={styles.play}>
            <IconPlayerPlayFilled size={14} color={colors.white} />
          </View>
        </View>
        {video.durationSecs !== null ? (
          <View style={styles.length}>
            <LengthPill secs={video.durationSecs} ready />
          </View>
        ) : null}
      </View>
    );
  }

  // Processing: Stream has the file and is encoding it.
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Video processing" style={[tileStyles.tile, tileStyles.filled, styles.centre]}>
      <Ring fraction={null} />
      <View style={styles.corner}>
        <IconVideo size={14} color={colors.textSecondary} />
      </View>
    </View>
  );
}

const textButton = { minHeight: 44, justifyContent: 'center' as const };

function TextAction({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={[textButton, { paddingHorizontal: 8 }, disabled && { opacity: 0.4 }]}
    >
      <T size={13} weight={600}>
        {label}
      </T>
    </Pressable>
  );
}

/** The line under the grid: what the video is up to, and Replace / Remove once it is ready or failed. */
export function VideoStatusLine({
  video,
  keepsEarlier,
  work,
  busy,
  canReplace,
  onReplace,
  onRemove,
}: {
  video: ServiceMedia | null;
  /** A replacement is on its way and customers still see the earlier video. */
  keepsEarlier: boolean;
  work: VideoWork;
  busy: boolean;
  canReplace: boolean;
  onReplace: () => void;
  onRemove: () => void;
}) {
  if (work.step === 'refused') {
    return (
      <View accessibilityRole="alert" style={styles.lineTop}>
        <View style={styles.lineIcon}>
          <IconVideo size={16} color={colors.error} />
        </View>
        <T size={13} color={colors.error} style={styles.flex}>
          {work.message}
        </T>
      </View>
    );
  }
  if (work.step === 'checking') {
    return (
      <T size={13} color={colors.textSecondary}>
        Checking the video…
      </T>
    );
  }
  if (work.step === 'uploading') {
    return (
      <View style={styles.line}>
        <IconVideo size={16} color={colors.textSecondary} />
        <T size={13} color={colors.textSecondary}>
          <T size={13} weight={600}>
            Uploading…
          </T>{' '}
          <T num size={13} color={colors.textSecondary}>
            {percent(work.fraction)}%
          </T>
        </T>
      </View>
    );
  }
  if (!video) return null;

  const earlierNote = keepsEarlier ? (
    <T size={12} lh={16} color={colors.textMuted}>
      Customers see the earlier video until the new one is ready.
    </T>
  ) : null;

  if (video.videoStatus === 'processing') {
    return (
      <View style={styles.gap4}>
        <View style={styles.line}>
          <IconVideo size={16} color={colors.textSecondary} />
          <T size={13} color={colors.textSecondary}>
            <T size={13} weight={600}>
              Processing…
            </T>{' '}
            ready in about a minute
          </T>
        </View>
        {earlierNote}
      </View>
    );
  }

  const actions = (
    <View style={styles.actions}>
      <TextAction label="Replace" disabled={busy || !canReplace} onPress={onReplace} />
      <TextAction label="Remove" accessibilityLabel="Remove video" disabled={busy} onPress={onRemove} />
    </View>
  );

  if (video.videoStatus === 'error') {
    return (
      <View style={styles.gap4}>
        <View style={styles.errorRow}>
          <View accessibilityRole="alert" style={[styles.lineTop, styles.flex, { paddingTop: 12 }]}>
            <View style={styles.lineIcon}>
              <IconVideo size={16} color={colors.error} />
            </View>
            <T size={13} color={colors.error} style={styles.flex}>
              {video.videoError ?? 'This video could not be processed — try uploading it again'}
            </T>
          </View>
          {actions}
        </View>
        {keepsEarlier ? (
          <T size={12} lh={16} color={colors.textMuted}>
            Customers still see the earlier video. Remove this one to go back to it.
          </T>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.line}>
      <IconVideo size={16} color={colors.textSecondary} />
      {video.durationSecs !== null ? (
        <>
          <T num size={13} weight={600}>
            {formatClipLength(video.durationSecs)}
          </T>
          <T size={13} color={colors.textSecondary}>
            ·
          </T>
        </>
      ) : null}
      <View style={styles.ready}>
        <IconCheck size={14} stroke={2.5} color={colors.success} />
        <T size={13} color={colors.textSecondary}>
          Ready
        </T>
      </View>
      <View style={styles.spacer} />
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', bottom: 8, left: 8 },
  length: { position: 'absolute', bottom: 6, left: 6 },
  play: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pillReady: { backgroundColor: 'rgba(0,0,0,0.7)' },
  pillRefused: { backgroundColor: 'rgba(0,0,0,0.4)' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lineIcon: { marginTop: 2 },
  gap4: { gap: 4 },
  ready: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spacer: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
