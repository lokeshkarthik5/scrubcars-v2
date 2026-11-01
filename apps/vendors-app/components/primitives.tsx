import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { colors, PRESSED_SCALE, tones } from '@/lib/theme';

import { ScButton } from './button';
import { IconAlertCircle, IconAlertTriangle, IconChevronRight, IconInfoCircle, IconStar, IconStarFilled } from './icons';
import { T } from './text';

const LOGO_RATIO = 316 / 90;

/** BrandMark: the wordmark, sized by height. */
export function BrandMark({ height = 28 }: { height?: number }) {
  return (
    <Image
      source={require('../assets/images/detlio-logo.png')}
      accessibilityLabel="Detlio"
      style={{ height, width: height * LOGO_RATIO }}
      resizeMode="contain"
    />
  );
}

/** ScCard. */
export function ScCard({ style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props} />;
}

/** A row that dips on tap, the web's `press` link. */
export function PressRow({
  onPress,
  style,
  children,
  accessibilityLabel,
}: {
  onPress: () => void;
  style?: ViewProps['style'];
  children: ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && { transform: [{ scale: PRESSED_SCALE }] }]}
    >
      {children}
    </Pressable>
  );
}

/** LoadError: a failed load said as one, never drawn as an empty list or a 0. */
export function LoadError({
  what,
  onRetry,
  retrying = false,
}: {
  what?: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <View accessibilityRole="alert" style={styles.loadError}>
      <IconAlertCircle size={24} color={colors.textSecondary} />
      <T size={14} align="center">
        {what ? `Couldn't load ${what}.` : "Couldn't load."}
      </T>
      <ScButton variant="outline" fullWidth={false} onPress={onRetry} disabled={retrying}>
        {retrying ? 'Retrying…' : 'Retry'}
      </ScButton>
    </View>
  );
}

/** EmptyState. */
export function EmptyState({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      {icon}
      <T size={14} weight={600} align="center">
        {title}
      </T>
      {subtitle ? (
        <T size={12} color={colors.textSecondary} align="center" style={styles.emptySub}>
          {subtitle}
        </T>
      ) : null}
    </View>
  );
}

/**
 * Notice: a line of state above a screen's content. Amber only when there is
 * something to do; a notice with `onPress` is a link with a chevron.
 */
export function Notice({
  title,
  children,
  tone = 'warning',
  onPress,
}: {
  title: string;
  children?: ReactNode;
  tone?: 'warning' | 'neutral';
  onPress?: () => void;
}) {
  const warning = tone === 'warning';
  const Icon = warning ? IconAlertTriangle : IconInfoCircle;
  const body = (
    <>
      <View style={styles.noticeIcon}>
        <Icon size={18} color={warning ? colors.warning : colors.textSecondary} />
      </View>
      <View style={styles.flex}>
        <T size={13} weight={500}>
          {title}
        </T>
        {children ? (
          <T size={12} color={colors.textSecondary} style={styles.noticeBody}>
            {children}
          </T>
        ) : null}
      </View>
      {onPress ? <IconChevronRight size={18} color={colors.textMuted} /> : null}
    </>
  );
  const box = [styles.notice, warning ? styles.noticeWarning : styles.noticeNeutral];
  if (onPress) {
    return (
      <PressRow onPress={onPress} style={[box, styles.noticeLink]}>
        {body}
      </PressRow>
    );
  }
  return <View style={box}>{body}</View>;
}

/** ScSegmented. */
export function ScSegmented<V extends string>({
  value,
  onChange,
  options,
  accessibilityLabel,
}: {
  value: V;
  onChange: (value: V) => void;
  options: { value: V; label: ReactNode }[];
  accessibilityLabel?: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentOn]}
          >
            {typeof option.label === 'string' ? (
              <T size={16} weight={500} color={selected ? colors.textPrimary : colors.textSecondary}>
                {option.label}
              </T>
            ) : (
              option.label
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The web's shimmer, as a slow pulse (a travelling band needs a native mask). */
export function Skeleton({ height = 96 }: { height?: number }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, { height, opacity }]} />;
}

export function SkeletonList({ count = 3, height = 96 }: { count?: number; height?: number }) {
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.skeletonList}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={height} />
      ))}
    </View>
  );
}

/** StatTile: one number and what it counts. */
export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <View style={styles.tile}>
      <T size={11} weight={500} color={colors.textSecondary}>
        {label}
      </T>
      <View style={styles.tileValue}>
        {typeof value === 'string' || typeof value === 'number' ? <TileFigure>{value}</TileFigure> : value}
      </View>
      {hint ? (
        <T size={11} color={colors.textSecondary} style={styles.tileHint}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function TileFigure({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <T num size={size} weight={700} lh={28} tracking={-0.025}>
      {children}
    </T>
  );
}

/** Stars, display only: whole stars filled, as on the web. */
export function Stars({ rating, max = 5, size = 14 }: { rating: number; max?: number; size?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stars}>
      {Array.from({ length: max }, (_, i) =>
        i < Math.floor(rating) ? (
          <IconStarFilled key={i} size={size} color={colors.warning} />
        ) : (
          <IconStar key={i} size={size} color={colors.textMuted} />
        )
      )}
    </View>
  );
}

export type StatusTone = keyof typeof tones;

/** StatusChip. */
export function StatusChip({ tone, children }: { tone: StatusTone; children: string }) {
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.tint }]}>
      <View style={[styles.chipDot, { backgroundColor: t.dot }]} />
      <T size={12} weight={500} lh={16} color={t.text} numberOfLines={1}>
        {children}
      </T>
    </View>
  );
}

/** The red count badge beside a heading or a tab. */
export function CountBadge({ count, small }: { count: number; small?: boolean }) {
  const line = small ? 20 : 24;
  return (
    <View
      style={{
        minWidth: line,
        height: line,
        borderRadius: 999,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: small ? colors.brandRed : colors.brandRedFill,
      }}
    >
      <T num size={small ? 12 : 13} weight={600} lh={line} color={colors.brandWhite}>
        {count}
      </T>
    </View>
  );
}

export function Spinner({ size = 18, color = colors.textMuted }: { size?: number; color?: string }) {
  return <ActivityIndicator size={size > 24 ? 'large' : 'small'} color={color} accessibilityLabel="Loading" />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  loadError: {
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 48 },
  emptySub: { maxWidth: 240 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeWarning: { borderColor: colors.warning, backgroundColor: 'rgba(245,165,36,0.024)' },
  noticeNeutral: { borderColor: colors.border, backgroundColor: colors.surface },
  noticeLink: { alignItems: 'center' },
  noticeIcon: { marginTop: 1, alignSelf: 'flex-start' },
  noticeBody: { marginTop: 2 },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4 },
  segment: {
    flex: 1,
    minHeight: 48,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentOn: { backgroundColor: colors.surfaceElevated },
  skeleton: { borderRadius: 14, backgroundColor: colors.surfaceElevated },
  skeletonList: { gap: 8 },
  tile: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tileValue: { marginTop: 2, minHeight: 28, justifyContent: 'center' },
  tileHint: { marginTop: 2 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  chip: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
});
