import { useReduceMotion } from '@repo/native-ui/motion';
import { useColors } from '@repo/native-ui/theme';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** Fourteen lines of print, one after another (the web's steps(14, end)). */
const LINES = 14;
const stepped = (t: number) => Math.min(1, Math.ceil(t * LINES) / LINES);

/**
 * The receipt prints out of a slot, line by line (moment 12; the website's .mo-slot and
 * .mo-print): the screen's only. The shared PDF is made from the receipt's own HTML, so
 * the paper itself is never animated. Simply there under Reduce Motion.
 */
export function ReceiptPrint({ children }: { children: ReactNode }) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const [height, setHeight] = useState(0);
  const feed = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const started = useRef(false);
  useEffect(() => {
    if (reduce) {
      feed.setValue(1);
      return;
    }
    if (height === 0 || started.current) return;
    started.current = true;
    Animated.timing(feed, { toValue: 1, duration: 1300, delay: 150, easing: stepped, useNativeDriver: true }).start();
  }, [height, reduce, feed]);
  return (
    <View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.slot, colors.scheme === 'light' && styles.slotLight]}
      />
      <View style={styles.window}>
        <Animated.View
          onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
          style={{
            transform: [{ translateY: feed.interpolate({ inputRange: [0, 1], outputRange: [-(height || 2000), 0] }) }],
          }}
        >
          {children}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    zIndex: 1,
    height: 10,
    marginHorizontal: 12,
    borderRadius: 5,
    backgroundColor: '#050506',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  slotLight: { backgroundColor: '#1D1D23' },
  window: { marginTop: -5, overflow: 'hidden', paddingHorizontal: 8 },
});
