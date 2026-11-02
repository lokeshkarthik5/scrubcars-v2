import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { colors, PRESSED_SCALE } from '@/lib/theme';

import { T } from './text';

/**
 * The web's older ScButton shapes (`primary`, `secondary` in packages/ui/src/sc/button.tsx):
 * a 10px-cornered button, py-3, 14px semibold. The map picker's buttons and the last wizard
 * step still use them, where the pill family (components/button.tsx) is the other shape.
 */
export function RectButton({
  tone = 'secondary',
  children,
  disabled,
  onPress,
  fullWidth = true,
  small,
  accessibilityLabel,
  style,
}: {
  tone?: 'primary' | 'secondary';
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  fullWidth?: boolean;
  /** The paste box's "Use": px-4 py-2, 12px words. */
  small?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        small ? styles.small : styles.normal,
        fullWidth ? styles.full : null,
        primary ? styles.primary : styles.secondary,
        // disabled:opacity-40 on primary; the secondary dims with the text.
        disabled && { opacity: primary ? 0.4 : 0.5 },
        pressed && !disabled && { transform: [{ scale: PRESSED_SCALE }] },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <T size={small ? 12 : 14} weight={600} lh={small ? 18 : 20} color={colors.brandWhite}>
          {children}
        </T>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  normal: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12 },
  small: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 8 },
  full: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.brandRedFill },
  secondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
});
