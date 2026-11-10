import { washGaugeAngle, washGaugeShare } from '@repo/core/moments';
import { useReduceMotion, useSeenOnce, type ViewRef } from '@repo/native-ui/motion';
import { useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const SWEEP = Easing.bezier(0.45, 0, 0.2, 1);
/** The arc's length: a half circle of radius 40. */
const ARC = Math.PI * 40;

/**
 * The Home wash gauge (moment 7; the website's wash-status-tile.tsx): days since the last
 * wash on a dial whose needle sweeps all the way once, like an engine starting, and
 * settles where the car is, by the existing wash-status rule (core's washGaugeAngle: the
 * interval reached is the far end). Overdue pins it at the end stop in amber. Drawn, not
 * read: the figure and the line under it say the same in words.
 */
export function WashGauge({
  daysSinceWash,
  intervalDays,
  over,
}: {
  daysSinceWash: number | null;
  intervalDays: number;
  over: boolean;
}) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const ref = useRef<ViewRef>(null);
  const seen = useSeenOnce(ref);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const angle = washGaugeAngle(daysSinceWash, intervalDays);
  const share = washGaugeShare(daysSinceWash, intervalDays);
  // 0 → the sweep's far end at 45% → where it settles.
  const sweep = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const played = useRef(false);
  useEffect(() => {
    if (reduce) {
      sweep.setValue(1);
      return;
    }
    if (!seen || played.current) return;
    played.current = true;
    const run = Animated.timing(sweep, { toValue: 1, duration: 1500, easing: SWEEP, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [seen, reduce, sweep]);
  const rotate = sweep.interpolate({ inputRange: [0, 0.45, 1], outputRange: ['-90deg', '90deg', `${angle}deg`] });
  const offset = sweep.interpolate({ inputRange: [0, 0.45, 1], outputRange: [ARC, 0, ARC * (1 - share)] });
  return (
    <View ref={ref} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.gauge}>
      <Svg width={96} height={54} viewBox="0 0 96 54" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#22C55E" />
            <Stop offset="0.6" stopColor="#F5B83D" />
            <Stop offset="1" stopColor="#FF2D4A" />
          </SvgGradient>
        </Defs>
        <Path
          d="M8 50 A40 40 0 0 1 88 50"
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          stroke={colors.scheme === 'light' ? colors.line : 'rgba(255,255,255,0.08)'}
        />
        <AnimatedPath
          d="M8 50 A40 40 0 0 1 88 50"
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${ARC}`}
          strokeDashoffset={offset}
          stroke={over ? colors.warningFill : `url(#g${id})`}
        />
      </Svg>
      {/* The needle turns about its foot: lifted half its height, turned, set back down. */}
      <Animated.View style={[styles.needle, { transform: [{ translateY: 19 }, { rotate }, { translateY: -19 }] }]}>
        <LinearGradient colors={['#FF4D66', '#FFFFFF']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.hub} />
    </View>
  );
}

const styles = StyleSheet.create({
  gauge: { width: 96, height: 54 },
  needle: {
    position: 'absolute',
    bottom: 4,
    left: 48 - 1.25,
    width: 2.5,
    height: 38,
    borderRadius: 2,
    overflow: 'hidden',
    shadowColor: '#FF2D4A',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
    shadowOpacity: 0.8,
  },
  hub: {
    position: 'absolute',
    bottom: 0,
    left: 42,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#C9CBD2',
  },
});
