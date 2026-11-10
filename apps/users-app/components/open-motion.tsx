import { useOneShot } from '@repo/native-ui/motion';
import type { ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/** The web's container transform curve, cubic-bezier(.05,.7,.1,1). */
const OPEN_EASE = Easing.bezier(0.05, 0.7, 0.1, 1);

/**
 * The garage page and the booking page opening (§5, §6): the screen fades in (the
 * stack's own fade, app/_layout.tsx) while its content grows from .93 to full size,
 * once, as the web's card grows into the page. Reanimated 4.7's shared element
 * transitions need a native build flag, so this is the fallback the spec allows.
 * Transform only; already full size under Reduce Motion.
 */
export function OpenMotion({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useOneShot({ duration: 300, easing: OPEN_EASE });
  return (
    <Animated.View
      style={[style, { transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}
