import { useT } from '@repo/core/i18n';
import { useReduceMotion, useSeenOnce, type ViewRef } from '@repo/native-ui/motion';
import { RED_LIGHT } from '@repo/native-ui/tokens';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

/** How long a new item's light stays on once it is on screen. */
const SEEN_AFTER_MS = 1600;

/**
 * A new item's small red light (moment 13; the website's UnreadLight): on while the item is
 * new, and fading once it has been on screen a moment, as a dashboard light does once
 * read. It stays in the row, still saying "new" to a screen reader; only its light goes.
 * Under Reduce Motion it goes without the fade.
 */
export function UnreadLight() {
  const t = useT();
  const reduce = useReduceMotion();
  const ref = useRef<ViewRef>(null);
  const onScreen = useSeenOnce(ref, 1);
  const light = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!onScreen) return;
    const timer = setTimeout(() => {
      if (reduce) light.setValue(0);
      else Animated.timing(light, { toValue: 0, duration: 800, useNativeDriver: true }).start();
    }, SEEN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [onScreen, reduce, light]);
  return (
    <Animated.View
      ref={ref}
      accessibilityLabel={t('new')}
      style={[
        styles.light,
        { opacity: light, transform: [{ scale: light.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  light: {
    marginTop: 9,
    marginRight: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: RED_LIGHT,
    shadowColor: RED_LIGHT,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
    shadowOpacity: 0.9,
  },
});
