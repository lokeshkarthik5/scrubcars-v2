import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useReduceMotion } from '@repo/native-ui/motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** A half circle of radius 56, the mockup's arc. */
const ARC = Math.PI * 56;
const SETTLE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Moment 7, the stock gauge (stage23.py `stock_gauge`): a half dial, the needle at what is
 * left. Silver; running low is calm amber, never a glow. The needle settles once from empty
 * to the level; under Reduce Motion it is simply there. The words beside it say the same, so
 * the drawing is labelled once for a screen reader.
 */
export function StockGauge({ share, low, width = 140, label }: { share: number; low: boolean; width?: number; label: string }) {
  const reduce = useReduceMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const level = Math.max(0, Math.min(1, share));
  const p = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      p.setValue(1);
      return;
    }
    // The arc's dash can't run on the native driver, so neither does the needle that matches it.
    const run = Animated.timing(p, { toValue: 1, duration: 900, delay: 120, easing: SETTLE, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [reduce, p]);
  const offset = p.interpolate({ inputRange: [0, 1], outputRange: [ARC, ARC * (1 - level)] });
  const rotate = p.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', `${-90 + 180 * level}deg`] });
  // The drawing is 140 × 84; the needle runs from the hub (70, 70) up 46, and turns about its foot.
  const k = width / 140;
  const needle = 46 * k;
  const hub = Math.max(8, Math.round(14 * k));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height: Math.round(width * 0.6) }}>
      <Svg width={width} height={Math.round(width * 0.6)} viewBox="0 0 140 84" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`sg${id}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#9C9CA6" />
            <Stop offset="1" stopColor="#F2F2F5" />
          </LinearGradient>
        </Defs>
        <Path d="M14 70 A56 56 0 0 1 126 70" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={8} strokeLinecap="round" />
        <AnimatedPath
          d="M14 70 A56 56 0 0 1 126 70"
          fill="none"
          stroke={low ? '#F5A524' : `url(#sg${id})`}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${ARC}`}
          strokeDashoffset={offset}
        />
      </Svg>
      <Animated.View
        style={[
          styles.needle,
          { left: 70 * k - 1.25, top: 24 * k, height: needle, transform: [{ translateY: needle / 2 }, { rotate }, { translateY: -needle / 2 }] },
        ]}
      />
      <View style={[styles.hub, { width: hub, height: hub, borderRadius: hub / 2, left: 70 * k - hub / 2, top: 70 * k - hub / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  needle: { position: 'absolute', width: 2.5, borderRadius: 2, backgroundColor: '#FFFFFF' },
  hub: { position: 'absolute', backgroundColor: '#1B1B20', borderWidth: 2, borderColor: '#FFFFFF' },
});
