import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { createStyles, useColors } from '@repo/native-ui/theme';
import { PRESSED_SCALE } from '@repo/native-ui/tokens';

import { T } from '@repo/native-ui/text';

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
  const colors = useColors();
  const styles = useStyles();
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
        <T size={small ? 12 : 14} weight={600} lh={small ? 18 : 20} color={primary ? colors.white : colors.textPrimary}>
          {children}
        </T>
      ) : (
        children
      )}
    </Pressable>
  );
}

const useStyles = createStyles((colors) => ({
  base: { borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  normal: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12 },
  small: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 8 },
  full: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.redFill },
  secondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
}));
