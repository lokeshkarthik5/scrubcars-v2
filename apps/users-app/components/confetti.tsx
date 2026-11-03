import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/motion';

/** The web's lib/confetti.ts: about 1.5 s of paper from a point. Never under reduced motion. */
export const JACKPOT_CONFETTI_COLORS = ['#E4002B', '#FAFAFA', '#2A2B33', '#C9CED8', '#B80022', '#8E94A0'];
export const GOLD_SPARKS = ['#FFE08A', '#F7D06B', '#FFF4C2', '#D9A62E', '#FFFFFF'];

const GRAVITY = 820;

function Piece({ colour, run, round }: { colour: string; run: number; round: boolean }) {
  const shape = useMemo(() => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const speed = 260 + Math.random() * 380;
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (Math.random() - 0.5) * 14, w: 4 + Math.random() * 5, h: 2.5 + Math.random() * 3 };
  }, []);
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1.5, { duration: 1500, easing: Easing.linear });
  }, [run, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 1.2 ? Math.max(0, (1.5 - t.value) / 0.3) : 1,
    transform: [{ translateX: shape.vx * t.value * 0.7 }, { translateY: shape.vy * t.value + (GRAVITY * t.value * t.value) / 2 }, { rotate: `${shape.spin * t.value}rad` }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: '50%', top: '45%', width: shape.w, height: round ? shape.w : shape.h, borderRadius: round ? shape.w / 2 : 1, backgroundColor: colour }, style]} />;
}

/** `run` above 0 starts a burst; a new value starts another. */
export function Confetti({ run, colours = JACKPOT_CONFETTI_COLORS, count = 60 }: { run: number; colours?: string[]; count?: number }) {
  const still = useReducedMotion();
  if (still || run === 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <Piece key={`${run}-${i}`} colour={colours[i % colours.length]} run={run} round={i % 5 === 0} />
      ))}
    </View>
  );
}
