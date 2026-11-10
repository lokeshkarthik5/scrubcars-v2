import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { ScButton } from './button';
import { Edge, Raised, Recessed, RedLight } from './finish';
import { IconAlertCircle, IconAlertTriangle, IconChevronRight, IconInfoCircle, IconStar, IconStarFilled } from './icons';
import { T } from './text';
import { createStyles, useColors, useFinish, useTheme } from './theme';
import { PRESSED_SCALE, type Tokens } from './tokens';

const LOGO_RATIO = 316 / 90;

/**
 * BrandMark: the wordmark, sized by height. On dark, the web's white logo. On light,
 * the same artwork with the wordmark recoloured and the red dot untouched
 * (assets/detlio-logo-dark-wordmark-derived.png, derived from it, not a brand file).
 */
export function BrandMark({ height = 28 }: { height?: number }) {
  const { scheme } = useTheme();
  return (
    <Image
      source={
        scheme === 'light'
          ? require('../assets/detlio-logo-dark-wordmark-derived.png')
          : require('../assets/detlio-logo.png')
      }
      accessibilityLabel="Detlio"
      style={{ height, width: height * LOGO_RATIO }}
      resizeMode="contain"
    />
  );
}

/**
 * A card that sets its own border or fill (a red hairline on a booking that needs an
 * answer, a tone's wash) keeps it under the finish, as a utility beside the web's
 * lit edge wins: only a plain card takes the edge.
 */
function setsOwnSurface(style: ViewProps['style']): boolean {
  const flat = StyleSheet.flatten(style) ?? {};
  return flat.borderColor !== undefined || flat.backgroundColor !== undefined;
}

/** ScCard. Under the finish, the lit edge (finish.css: the app's ScCard). */
export function ScCard({ style, ...props }: ViewProps) {
  const styles = useStyles();
  const { on } = useFinish();
  if (on && !setsOwnSurface(style)) return <Edge radius={14} style={[styles.cardFinish, style]} {...props} />;
  return <View style={[styles.card, style]} {...props} />;
}

/**
 * `hub-card`: the soft graphite gradient, hairline and 28px radius of Home's cards.
 * Plain white with a faint shadow in the light theme.
 */
export function HubCard({ style, children, radius = 28, ...props }: ViewProps & { radius?: number }) {
  const colors = useColors();
  const styles = useStyles();
  const { on } = useFinish();
  // Under the finish every hub card takes the lit edge (finish.css `.finish .hub-card`).
  if (on && !setsOwnSurface(style)) {
    return (
      <Edge radius={radius} style={style} {...props}>
        {children}
      </Edge>
    );
  }
  return (
    <View style={[styles.hubShadow, { borderRadius: radius }, style]} {...props}>
      <LinearGradient
        colors={[colors.cardTop, colors.cardBottom]}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.hubEdge, { borderRadius: radius }]}
      />
      {children}
    </View>
  );
}

/** A row that dips on tap, the web's `press` link. */
export function PressRow({
  onPress,
  style,
  children,
  accessibilityLabel,
  disabled,
  hitSlop,
  accessibilityState,
}: {
  onPress: () => void;
  style?: ViewProps['style'];
  children: ReactNode;
  accessibilityLabel?: string;
  disabled?: boolean;
  hitSlop?: number;
  /** A chosen card or row says so (`{ selected }`). */
  accessibilityState?: { selected?: boolean };
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled || accessibilityState ? { ...accessibilityState, ...(disabled ? { disabled } : {}) } : undefined}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && { transform: [{ scale: PRESSED_SCALE }] }]}
    >
      {children}
    </Pressable>
  );
}

/** ErrorState / LoadError: a failed load said as one, never drawn as an empty list or a 0. */
export function ErrorState({ message, onRetry, retrying = false }: { message: string; onRetry: () => void; retrying?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View accessibilityRole="alert" style={styles.loadError}>
      <IconAlertCircle size={24} color={colors.textSecondary} />
      <T size={14} align="center">
        {message}
      </T>
      <ScButton variant="outline" fullWidth={false} onPress={onRetry} disabled={retrying}>
        {retrying ? 'Retrying…' : 'Try again'}
      </ScButton>
    </View>
  );
}

/** EmptyState. */
export function EmptyState({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  const colors = useColors();
  const styles = useStyles();
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

/** Notice: a line of state above a screen's content. Amber only when there is something to do. */
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
  const colors = useColors();
  const styles = useStyles();
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
  minHeight = 48,
  labelSize = 14,
  trackColor,
}: {
  value: V;
  onChange: (value: V) => void;
  /**
   * `accessibilityLabel` names an option whose label is an icon alone, and
   * `width` gives it a fixed width instead of an equal share (the garage's
   * Calendar segment).
   */
  options: { value: V; label: ReactNode; icon?: ReactNode; accessibilityLabel?: string; width?: number }[];
  accessibilityLabel?: string;
  minHeight?: number;
  labelSize?: number;
  /** When it sits on a card, where the usual surface wouldn't show. */
  trackColor?: string;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { on } = useFinish();
  if (on) {
    // The finish: a recessed track, the chosen option raised with the red light under it.
    return (
      <Recessed radius={14} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} innerStyle={styles.segmentedFinish}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.accessibilityLabel}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={[styles.segment, { minHeight }, option.width ? { flex: 0, width: option.width } : null]}
            >
              {selected ? <Raised radius={10} style={StyleSheet.absoluteFill} /> : null}
              {option.icon}
              {typeof option.label === 'string' ? (
                <T size={labelSize} weight={selected ? 600 : 500} numberOfLines={1} color={selected ? colors.textPrimary : colors.textSecondary}>
                  {option.label}
                </T>
              ) : (
                option.label
              )}
              {selected ? <RedLight style={styles.segmentLight} /> : null}
            </Pressable>
          );
        })}
      </Recessed>
    );
  }
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.segmented, trackColor ? { backgroundColor: trackColor } : null]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, { minHeight }, option.width ? { flex: 0, width: option.width } : null, selected && styles.segmentOn]}
          >
            {option.icon}
            {typeof option.label === 'string' ? (
              <T size={labelSize} weight={500} numberOfLines={1} color={selected ? colors.textPrimary : colors.textSecondary}>
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
export function Skeleton({ height = 96, radius = 14 }: { height?: number; radius?: number }) {
  const styles = useStyles();
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
  return <Animated.View style={[styles.skeleton, { height, opacity, borderRadius: radius }]} />;
}

/** Stars, display only: whole stars filled, as on the web. */
export function Stars({ rating, max = 5, size = 14 }: { rating: number; max?: number; size?: number }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stars}>
      {Array.from({ length: max }, (_, i) =>
        i < Math.floor(rating) ? (
          <IconStarFilled key={i} size={size} color={colors.warningFill} />
        ) : (
          <IconStar key={i} size={size} color={colors.textMuted} />
        )
      )}
    </View>
  );
}

export type StatusTone = keyof Tokens['tones'];

/** StatusChip. */
export function StatusChip({ tone, children, size = 'sm', dot = true }: { tone: StatusTone; children: string; size?: 'sm' | 'md'; dot?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const t = colors.tones[tone];
  const md = size === 'md';
  return (
    <View style={[styles.chip, md && styles.chipMd, { backgroundColor: t.tint }]}>
      {dot ? <View style={[styles.chipDot, md && styles.chipDotMd, { backgroundColor: t.dot }]} /> : null}
      <T size={md ? 13 : 12} weight={500} lh={16} color={t.text} numberOfLines={1}>
        {children}
      </T>
    </View>
  );
}

export function Spinner({ size = 18, color }: { size?: number; color?: string }) {
  const colors = useColors();
  return <ActivityIndicator size={size > 24 ? 'large' : 'small'} color={color ?? colors.textMuted} accessibilityLabel="Loading" />;
}

/** A red-free soft disc holding an icon: TileIcon, the update row's. */
export function Disc({ children, size = 40, strong }: { children: ReactNode; size?: number; strong?: boolean }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        backgroundColor: strong ? colors.discStrong : colors.disc,
      }}
    >
      {children}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardFinish: { paddingHorizontal: 14, paddingVertical: 12 },
  segmentedFinish: { flexDirection: 'row', padding: 4, gap: 4 },
  segmentLight: { position: 'absolute', bottom: 4, alignSelf: 'center' },
  hubShadow: {
    shadowColor: '#0A0A0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: c.scheme === 'light' ? 0.04 : 0,
    shadowRadius: 2,
  },
  hubEdge: { borderWidth: 1, borderColor: c.line },
  loadError: {
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
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
  noticeWarning: { borderColor: c.warningFill, backgroundColor: c.warningMuted },
  noticeNeutral: { borderColor: c.border, backgroundColor: c.surface },
  noticeLink: { alignItems: 'center' },
  noticeIcon: { marginTop: 1, alignSelf: 'flex-start' },
  noticeBody: { marginTop: 2 },
  segmented: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: 12, padding: 4 },
  segment: {
    flex: 1,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentOn: { backgroundColor: c.surfaceElevated },
  skeleton: { backgroundColor: c.skeleton },
  skeletonList: { gap: 8 },
  tile: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
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
  chipMd: { height: 32, gap: 8, paddingHorizontal: 12 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipDotMd: { width: 8, height: 8, borderRadius: 4 },
}));

/** LoadError (the garage's wording): a failed load said as one, never drawn as an empty list or a 0. */
export function LoadError({ what, onRetry, retrying = false }: { what?: string; onRetry: () => void; retrying?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
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

export function SkeletonList({ count = 3, height = 96 }: { count?: number; height?: number }) {
  const styles = useStyles();
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
  const colors = useColors();
  const styles = useStyles();
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

/** The red count on a heading or a card: a fill, with white figures in both themes. */
export function CountBadge({ count, small }: { count: number; small?: boolean }) {
  const colors = useColors();
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
        backgroundColor: small ? colors.red : colors.redFill,
      }}
    >
      <T num size={small ? 12 : 13} weight={600} lh={line} color={colors.white}>
        {count}
      </T>
    </View>
  );
}
