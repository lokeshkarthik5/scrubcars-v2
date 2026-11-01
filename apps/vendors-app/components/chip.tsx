import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/lib/theme';

import { T } from './text';

/**
 * Chip: selected is a white fill with dark text, not red. 30px drawn, with a
 * 44px touch area (the web's tap-target).
 */
export function Chip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={7}
      onPress={onPress}
      style={[
        styles.chip,
        disabled ? styles.disabled : selected ? styles.selected : styles.idle,
      ]}
    >
      <T
        size={12}
        weight={500}
        lh={18}
        color={disabled ? colors.textMuted : selected ? colors.brandBlack : colors.textPrimary}
        style={disabled ? styles.struck : undefined}
      >
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 0 },
  idle: { borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.brandWhite, backgroundColor: colors.brandWhite },
  disabled: { borderColor: colors.border, backgroundColor: colors.brandBlack, opacity: 0.6 },
  struck: { textDecorationLine: 'line-through' },
});
