import { useReduceMotion } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';

/** How long each hint stays before the next rolls in. */
const HINT_MS = 2600;
const LINE = 22;

/**
 * The search field's hint, rolling through real searches (§3): each one slides up and
 * out as the next comes in. The one loop the finish allows, and only while the app is in
 * front; under Reduce Motion it stays on the first. Drawn only: the field's own name is
 * what a screen reader says.
 */
export function RollingHint({ hints, color }: { hints: readonly string[]; color: string }) {
  const reduce = useReduceMotion();
  const [index, setIndex] = useState(0);
  const roll = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce || hints.length < 2) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      setIndex((i) => (i + 1) % hints.length);
      roll.setValue(0);
      Animated.timing(roll, {
        toValue: 1,
        duration: 500,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }).start();
    }, HINT_MS);
    return () => clearInterval(timer);
  }, [reduce, hints.length, roll]);

  const shown = reduce ? 0 : index;
  const before = (shown - 1 + hints.length) % hints.length;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.box}>
      <Animated.View
        style={[
          styles.line,
          {
            opacity: roll.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [0, -LINE] }) }],
          },
        ]}
      >
        <T variant="t3" weight={400} lh={LINE} numberOfLines={1} color={color}>
          {hints[before]}
        </T>
      </Animated.View>
      <Animated.View
        style={[
          styles.line,
          {
            opacity: roll,
            transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [LINE, 0] }) }],
          },
        ]}
      >
        <T variant="t3" weight={400} lh={LINE} numberOfLines={1} color={color}>
          {hints[shown]}
        </T>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, height: LINE, overflow: 'hidden' },
  line: { position: 'absolute', left: 0, right: 0, top: 0 },
});
