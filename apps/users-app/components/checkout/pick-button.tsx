import { RED_LIGHT } from '@repo/native-ui/tokens';
import { PressScale } from '@repo/native-ui/motion';
import { useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * A day, a time, or a chosen car or address on the booking page (§6, the web's bk-pick
 * and bk-opt): raised graphite with a lit edge; once picked, the brighter graphite with
 * the red light along its bottom. Red here is light only: the red button is Pay's.
 */
export function PickButton({
  on,
  disabled = false,
  onPress,
  accessibilityLabel,
  radius = 16,
  style,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const colors = useColors();
  const light = colors.scheme === 'light';
  const rim: [string, string] = light
    ? on
      ? [colors.outlineStrong, colors.border]
      : [colors.border, colors.stroke]
    : on
      ? ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.05)']
      : ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.03)'];
  const fill: [string, string] = light
    ? on
      ? [colors.surface, colors.surfaceElevated]
      : [colors.stage[0], colors.stage[1]]
    : on
      ? ['#383840', '#1D1D23']
      : ['#1F1F25', '#16161A'];
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.94}
      style={[{ borderRadius: radius }, on && styles.glow, disabled && styles.off]}
    >
      <LinearGradient pointerEvents="none" colors={rim} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
      <LinearGradient pointerEvents="none" colors={fill} style={[styles.fill, { borderRadius: radius - 1 }]} />
      <View style={[styles.face, style]}>{children}</View>
      {on ? (
        <View
          pointerEvents="none"
          style={[styles.light, { borderBottomLeftRadius: radius, borderBottomRightRadius: radius }]}
        />
      ) : null}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  glow: { shadowColor: '#E4002B', shadowOffset: { width: 0, height: 6 }, shadowRadius: 8, shadowOpacity: 0.45 },
  off: { opacity: 0.32 },
  fill: { position: 'absolute', top: 1, left: 1, right: 1, bottom: 1 },
  face: { alignItems: 'center', justifyContent: 'center' },
  // inset 0 -2.5px 0 var(--color-red-light)
  light: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2.5,
    backgroundColor: RED_LIGHT,
    overflow: 'hidden',
  },
});
