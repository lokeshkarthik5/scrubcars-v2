import { IconCheck } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';

const CONFETTI = [
  { x: -56, r: '-220deg', delay: 120, tone: 'redFill' },
  { x: 42, r: '180deg', delay: 60, tone: 'success' },
  { x: -24, r: '140deg', delay: 220, tone: 'warning' },
  { x: 64, r: '-160deg', delay: 300, tone: 'textPrimary' },
  { x: 10, r: '200deg', delay: 180, tone: 'redFill' },
  { x: -70, r: '120deg', delay: 340, tone: 'success' },
] as const;

function Piece({ x, r, delay, color }: { x: number; r: string; delay: number; color: string }) {
  const at = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(at, { toValue: 1, duration: 900, delay, useNativeDriver: true }).start();
  }, [at, delay]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 12,
        left: 44,
        height: 6,
        width: 6,
        borderRadius: 1,
        backgroundColor: color,
        opacity: at.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: at.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
          { translateY: at.interpolate({ inputRange: [0, 1], outputRange: [0, 110] }) },
          { rotate: at.interpolate({ inputRange: [0, 1], outputRange: ['0deg', r] }) },
        ],
      }}
    />
  );
}

/**
 * SuccessBurst (packages/ui/src/sc/success-burst.tsx): the moment after a booking is paid for.
 * A view, not a Modal: iOS drops a modal shown while Razorpay's window is still leaving.
 */
export function SuccessBurst({ title, subtitle, durationMs = 2200, onDone }: { title: string; subtitle?: string; durationMs?: number; onDone: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.6)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(title);
    Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    const leave = setTimeout(() => Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => doneRef.current()), durationMs);
    return () => clearTimeout(leave);
  }, [fade, pop, durationMs, title]);

  return (
      <Animated.View style={[StyleSheet.absoluteFill, styles.page, { opacity: fade }]}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={() => doneRef.current()} />
        <View style={styles.burst} pointerEvents="none">
          <Animated.View style={[styles.ring, { transform: [{ scale: pop }] }]}>
            <IconCheck size={40} stroke={3.2} color={colors.success} />
          </Animated.View>
          {CONFETTI.map((piece, i) => (
            <Piece key={i} x={piece.x} r={piece.r} delay={piece.delay} color={colors[piece.tone]} />
          ))}
        </View>
        <T size={20} weight={700} lh={28} align="center" style={styles.title}>
          {title}
        </T>
        {subtitle ? (
          <T size={15} lh={22} color={colors.textSecondary} align="center" style={styles.sub}>
            {subtitle}
          </T>
        ) : null}
      </Animated.View>
  );
}

const useStyles = createStyles((c) => ({
  page: { zIndex: 50, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  burst: { height: 96, width: 96, alignItems: 'center', justifyContent: 'center' },
  ring: { height: 88, width: 88, borderRadius: 44, borderWidth: 3, borderColor: c.success, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 24 },
  sub: { marginTop: 8 },
}));
