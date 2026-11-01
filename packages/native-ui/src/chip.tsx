import { Pressable, View } from 'react-native';

import { T } from './text';
import { createStyles } from './theme';

/** Chip (packages/ui/src/sc/chip.tsx): chosen is a white fill, the same as the date and time pickers. */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={7}
      onPress={onPress}
      style={[styles.chip, disabled ? styles.off : selected ? styles.on : styles.idle]}
    >
      <T size={12} weight={500} lh={18} style={disabled ? styles.struck : selected ? styles.onLabel : styles.idleLabel}>
        {label}
      </T>
    </Pressable>
  );
}

/** ScSwitch (packages/ui/src/sc/switch.tsx): white when on, never red. */
export function ScSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.touch, disabled && styles.dim]}
    >
      <View style={[styles.track, checked ? styles.trackOn : styles.trackOff]}>
        <View style={[styles.thumb, checked ? styles.thumbOn : styles.thumbOff]} />
      </View>
    </Pressable>
  );
}

/** ScBadge's 'muted': the mark on an add-on's line. */
export function AddOnMark() {
  const styles = useStyles();
  return (
    <View style={styles.badge}>
      <T size={11} weight={500} lh={15} style={styles.badgeLabel}>
        Add-on
      </T>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  chip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 0 },
  on: { borderColor: c.chosenBg, backgroundColor: c.chosenBg },
  idle: { borderColor: c.border, backgroundColor: c.surface },
  off: { borderColor: c.border, backgroundColor: c.canvas, opacity: 0.6 },
  onLabel: { color: c.chosenText },
  idleLabel: { color: c.textPrimary },
  struck: { color: c.textMuted, textDecorationLine: 'line-through' },
  touch: { height: 44, width: 56, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.5 },
  track: { height: 24, width: 44, borderRadius: 12 },
  trackOn: { backgroundColor: c.chosenBg },
  trackOff: { backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.border },
  thumb: { position: 'absolute', top: 2, height: 20, width: 20, borderRadius: 10 },
  thumbOn: { left: 22, backgroundColor: c.chosenText },
  thumbOff: { left: 2, top: 1, backgroundColor: c.textSecondary },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceElevated,
  },
  badgeLabel: { color: c.textSecondary },
}));
