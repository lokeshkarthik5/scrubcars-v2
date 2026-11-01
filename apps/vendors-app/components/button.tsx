import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, ctaGradient, PRESSED_SCALE } from '@/lib/theme';

import { T } from './text';

export type ButtonVariant = 'cta' | 'main' | 'outline' | 'text' | 'danger-outline';
export type ButtonSize = 'md' | 'lg';

interface ScButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** The web's px-*: the inside padding of the pill. `style` pads outside it. */
  paddingX?: number;
  disabled?: boolean;
  /** Why it can't be pressed yet, under it in grey. Only shown while disabled. */
  disabledReason?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** The sign-in card's disabled look, on the glass (disabled:bg-white/10). */
  glass?: boolean;
  /** Overrides, for Turn on's white fill. */
  backgroundColor?: string;
  labelColor?: string;
}

const HEIGHT: Record<ButtonSize, number> = { md: 52, lg: 56 };

/** ScButton (packages/ui/src/sc/button.tsx): the pill family and the sign-in CTA. */
export function ScButton({
  variant = 'main',
  size = 'md',
  fullWidth = true,
  paddingX,
  disabled = false,
  disabledReason,
  onPress,
  accessibilityLabel,
  children,
  style,
  glass,
  backgroundColor,
  labelColor,
}: ScButtonProps) {
  const greyed = disabled && (Boolean(disabledReason) || variant === 'main' || variant === 'cta');
  const gradient = variant === 'main' && !disabled;
  const label = labelColor
    ? labelColor
    : greyed
      ? colors.textSecondary
      : disabled
        ? colors.textMuted
        : variant === 'danger-outline'
          ? colors.error
          : variant === 'main'
            ? colors.white
            : colors.textPrimary;

  const box: ViewStyle = {
    height: variant === 'cta' ? 52 : HEIGHT[size],
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: paddingX ?? (backgroundColor ? 16 : variant === 'text' ? 12 : 24),
    ...(greyed
      ? { backgroundColor: glass ? 'rgba(255,255,255,0.1)' : colors.surfaceElevated }
      : variant === 'cta'
        ? { backgroundColor: colors.brandRedFill }
        : variant === 'outline'
          ? { borderWidth: 1, borderColor: disabled ? colors.border : 'rgba(255,255,255,0.25)' }
          : variant === 'danger-outline'
            ? { borderWidth: 1, borderColor: disabled ? colors.border : 'rgba(245,165,36,0.6)' }
            : {}),
    ...(backgroundColor ? { backgroundColor, borderWidth: 0 } : {}),
  };

  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        fullWidth && styles.full,
        gradient && styles.mainShadow,
        pressed && !disabled && { transform: [{ scale: PRESSED_SCALE }] },
        style,
      ]}
    >
      <View style={[box, gradient && styles.clip]}>
        {gradient ? (
          <>
            <LinearGradient {...ctaGradient} colors={[...ctaGradient.colors]} locations={[...ctaGradient.locations]} style={StyleSheet.absoluteFill} />
            {/* inset 0 1px 0 rgba(255,255,255,0.22) */}
            <View style={styles.highlight} />
          </>
        ) : null}
        {typeof children === 'string' ? <Label color={label}>{children}</Label> : children}
      </View>
    </Pressable>
  );

  if (!(disabled && disabledReason)) return button;
  return (
    <View style={fullWidth ? styles.reasonFull : styles.reason}>
      {button}
      <T size={13} lh={18} color={colors.textSecondary} align="center" style={styles.reasonText}>
        {disabledReason}
      </T>
    </View>
  );
}

/** The words on a button, when they sit beside an icon. */
export function Label({ children, color = colors.textPrimary }: { children: ReactNode; color?: string }) {
  return (
    <T size={15} weight={600} lh={20} color={color}>
      {children}
    </T>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  mainShadow: {
    shadowColor: '#E4002B',
    // 0 10px 22px -12px: iOS has no negative spread, so tighter and fainter.
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  clip: { overflow: 'hidden' },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  reason: { alignItems: 'center' },
  reasonFull: { alignSelf: 'stretch', alignItems: 'center' },
  reasonText: { marginTop: 6 },
});
