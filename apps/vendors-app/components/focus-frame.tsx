import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { createStyles } from '@repo/native-ui/theme';

/**
 * Wraps a card so a link or notification can point at it: when `flash` turns on a
 * border in the theme's chosen-outline colour comes up and fades. Touches nothing
 * inside the card.
 */
export function FocusFrame({
  flash,
  onLayout,
  children,
}: {
  flash: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!flash) return;
    const run = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [flash, opacity]);

  return (
    <View onLayout={onLayout}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ring, { opacity }]} />
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  // The card's radius (ScCard is 14).
  ring: { borderRadius: 14, borderWidth: 2, borderColor: colors.outlineChosen },
}));
