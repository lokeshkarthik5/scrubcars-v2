import { formatIndianPlate } from '@repo/core/moments';
import type { Vehicle } from '@repo/core/types';
import { useT } from '@repo/core/i18n';
import { IconChevronLeft, IconChevronRight, type IconProps } from '@repo/native-ui/icons';
import { PlateDrawing } from '@repo/native-ui/number-plate';
import { CountBadge, Disc, HubCard, PressRow } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import type { Tokens } from '@repo/native-ui/tokens';
import { useFocusEffect } from 'expo-router';
import { type ReactElement, type ReactNode, useCallback } from 'react';
import { BackHandler, Pressable, type StyleProp, type TextStyle, View, type ViewStyle } from 'react-native';

/**
 * The garage app's five main tabs in the customer Home look (approved mockup
 * reference/mockups/garage-hub, 22 Nov 2026): big rounded cards, large light figures,
 * small grey labels, round icon discs, two-tile rows, list cards and outline pills.
 * The parts every one of those screens is built from; the website builds the same from
 * the same mockup, so keep the sizes and words in step with it.
 */

export type HubIcon = (props: IconProps) => ReactElement;

/** The screen's title under the wordmark: "Bookings", "Good morning, Velan". */
export function HubTitle({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <T accessibilityRole="header" size={24} weight={600} lh={30} tracking={-0.01} style={styles.title}>
      {children}
    </T>
  );
}

/** A large, light figure: 56 on a hero card, 34 on a tile. */
export function BigFigure({
  children,
  size = 34,
  color,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
}) {
  return (
    <T num size={size} weight={300} lh={Math.round(size * 1.08)} tracking={-0.035} color={color} numberOfLines={1}>
      {children}
    </T>
  );
}

/** A small grey label (a card's kicker, a tile's name). */
export function Dim({ children, size = 13, style, lines }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle>; lines?: number }) {
  const colors = useColors();
  return (
    <T size={size} lh={Math.round(size * 1.38)} color={colors.dim} numberOfLines={lines} style={style}>
      {children}
    </T>
  );
}

/**
 * One tile of a two-tile row: its name and a disc in the top corners, the figure large
 * and light at the foot, a quiet line under it. Taps through when given `onPress`.
 */
export function HubTile({
  label,
  icon: Icon,
  value,
  line,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon: HubIcon;
  value: ReactNode;
  line?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const styles = useStyles();
  const card = (
    <HubCard style={styles.tile}>
      <View style={styles.tileHead}>
        {/* Two lines, so a longer label (Tamil) wraps rather than ends in an ellipsis. */}
        <T size={13} lh={18} numberOfLines={2} color={colors.dim} style={styles.shrink}>
          {label}
        </T>
        <Disc>
          <Icon size={20} stroke={1.5} />
        </Disc>
      </View>
      <View style={styles.tileFoot}>
        {typeof value === 'string' || typeof value === 'number' ? <BigFigure>{String(value)}</BigFigure> : value}
        {line ? (
          typeof line === 'string' ? (
            <T size={12} lh={16} numberOfLines={2} color={colors.dim} style={styles.tileLine}>
              {line}
            </T>
          ) : (
            <View style={styles.tileLine}>{line}</View>
          )
        ) : null}
      </View>
    </HubCard>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel} style={styles.tileCell}>
        {card}
      </View>
    );
  }
  return (
    <PressRow onPress={onPress} accessibilityLabel={accessibilityLabel} style={styles.tileCell}>
      {card}
    </PressRow>
  );
}

/** Two tiles side by side; one alone takes the row. */
export function TileRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.tileRow}>{children}</View>;
}

/** One card of rows, each with a soft square icon and a chevron. */
export function HubList({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <HubCard radius={22} style={[styles.list, style]}>
      {children}
    </HubCard>
  );
}

export function RowIcon({ icon: Glyph }: { icon: HubIcon }) {
  const styles = useStyles();
  return (
    <View style={styles.rowIcon}>
      <Glyph size={16} stroke={1.6} />
    </View>
  );
}

/** A row of a list card: icon, label (and a line under it), its current value, a chevron. */
export function HubRow({
  icon,
  label,
  sub,
  value,
  onPress,
  first,
  accessibilityLabel,
  accessibilityRole = 'button',
}: {
  icon: HubIcon;
  label: string;
  sub?: ReactNode;
  value?: ReactNode;
  onPress: () => void;
  /** The first row has no line above it. */
  first?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && styles.rowPressed]}
    >
      <RowIcon icon={icon} />
      <View style={styles.flex}>
        <T size={15} lh={20}>
          {label}
        </T>
        {sub ? (
          typeof sub === 'string' ? (
            <T size={12} lh={16} color={colors.dim}>
              {sub}
            </T>
          ) : (
            sub
          )
        ) : null}
      </View>
      {typeof value === 'string' ? (
        <T size={13} lh={18} color={colors.dim} numberOfLines={1} style={styles.value}>
          {value}
        </T>
      ) : (
        value
      )}
      <IconChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

/** A small grey heading over a list card ("Your garage", "Jobs"). */
export function HubSectionHead({ title }: { title: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <T accessibilityRole="header" size={13} lh={18} color={colors.dim} style={styles.sectionHead}>
      {title}
    </T>
  );
}

/** A section's heading on Home and Bookings: "Waiting for your answer" (2), "See all ›". */
export function HubHeading({
  title,
  count,
  right,
}: {
  title: string;
  count?: number;
  right?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.heading}>
      <View style={styles.headingTitle}>
        <T accessibilityRole="header" size={16} weight={500} lh={22} style={styles.shrink}>
          {title}
        </T>
        {count !== undefined && count > 0 ? <CountBadge count={count} small /> : null}
      </View>
      {right}
    </View>
  );
}

/** The outline pill: Add a service, Download CSV. */
export function HubPill({
  children,
  onPress,
  accessibilityLabel,
  disabled,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled } : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, disabled && styles.dimmed, pressed && !disabled && styles.rowPressed, style]}
    >
      {children}
    </Pressable>
  );
}

export type TagTone = 'quiet' | 'green' | 'blue' | 'red' | 'amber' | 'silver';

const TAG_INK = (c: Tokens): Record<TagTone, { border: string; text: string; dot: string }> => ({
  quiet: { border: c.line, text: c.textRead, dot: c.textMuted },
  green: { border: c.successBorder, text: c.tones.done.text, dot: c.tones.done.dot },
  blue: { border: c.progressSoftBorder, text: c.tones.progress.text, dot: c.tones.progress.dot },
  red: { border: c.redBorder, text: c.tones.new.text, dot: c.tones.new.dot },
  amber: { border: c.warningBorder, text: c.tones.attention.text, dot: c.tones.attention.dot },
  silver: { border: c.outlineSoft, text: c.textRead, dot: c.textMuted },
});

/** The outline tag: "Active", "In progress", "Shown to customers", "Silver". */
export function HubTag({
  tone = 'quiet',
  dot = false,
  small = false,
  dotColor,
  children,
}: {
  tone?: TagTone;
  dot?: boolean;
  small?: boolean;
  /** A quiet tag with a coloured dot: "1 under way" with the green of open. */
  dotColor?: string;
  children: ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  const ink = TAG_INK(colors)[tone];
  return (
    <View style={[styles.tag, small && styles.tagSmall, { borderColor: ink.border }]}>
      {dot || dotColor ? <View style={[styles.tagDot, { backgroundColor: dotColor ?? ink.dot }]} /> : null}
      <T size={small ? 11 : 12} weight={500} lh={16} color={ink.text} numberOfLines={1}>
        {children}
      </T>
    </View>
  );
}

/** "See all ›": a quiet link at a heading's end. */
export function SeeAll({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.seeAll}>
      <T size={13} lh={18} color={colors.textSecondary}>
        {label}
      </T>
      <IconChevronRight size={14} color={colors.textSecondary} />
    </Pressable>
  );
}

/**
 * A view inside a tab (a Settings section, a service's edit view): a round Back and its
 * title. Android's back button does the same while it is shown.
 */
export function HubBack({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  const t = useT();
  const styles = useStyles();
  // Only while this tab is the one on screen: tabs stay mounted behind the others.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack();
        return true;
      });
      return () => sub.remove();
    }, [onBack])
  );
  return (
    <View style={styles.back}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Back')}
        hitSlop={4}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.rowPressed]}
      >
        <IconChevronLeft size={20} stroke={1.8} />
      </Pressable>
      <T accessibilityRole="header" size={22} weight={600} lh={28} numberOfLines={1} style={styles.flex}>
        {title}
      </T>
      {right}
    </View>
  );
}

/** "Hyundai Creta ·" and the car's plate drawn small, as the mockup's job and booking cards. */
export function CarLine({ vehicle, size = 13 }: { vehicle: Pick<Vehicle, 'make' | 'model' | 'plate'>; size?: number }) {
  const colors = useColors();
  const styles = useStyles();
  const name = `${vehicle.make} ${vehicle.model}`.trim();
  return (
    <View style={styles.carLine}>
      <T size={size} lh={Math.round(size * 1.4)} color={colors.textSecondary} numberOfLines={1} style={styles.shrink}>
        {vehicle.plate ? `${name} ·` : name}
      </T>
      {vehicle.plate ? <PlateDrawing text={formatIndianPlate(vehicle.plate)} size="sm" /> : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  carLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.disc,
  },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  dimmed: { opacity: 0.5 },
  title: { paddingHorizontal: 2 },
  tileCell: { flex: 1, minWidth: 0 },
  tileRow: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, minHeight: 150, paddingTop: 14, paddingRight: 14, paddingBottom: 18, paddingLeft: 20 },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tileFoot: { marginTop: 'auto', paddingTop: 12 },
  tileLine: { marginTop: 6 },
  list: { paddingVertical: 4, overflow: 'hidden' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: c.line },
  rowPressed: { opacity: 0.7 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.disc },
  value: { maxWidth: '45%', flexShrink: 1 },
  sectionHead: { paddingHorizontal: 4, paddingTop: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2, paddingTop: 4 },
  headingTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  seeAll: { minHeight: 44, marginVertical: -10, flexDirection: 'row', alignItems: 'center', gap: 2 },
  pill: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.disc,
    paddingHorizontal: 18,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    flexShrink: 0,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagSmall: { paddingHorizontal: 8, paddingVertical: 1 },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
}));
