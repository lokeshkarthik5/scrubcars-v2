import { useReduceMotion, useSeenOnce, type ViewRef } from './motion';
import { useColors } from './theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const SWEEP = Easing.bezier(0.45, 0, 0.2, 1);
/** The arc's length: a half circle of radius 40. */
const ARC = Math.PI * 40;

/**
 * The wash gauge's dial (moment 7; the website's packages/ui/src/finish/wash-gauge.tsx),
 * shared by the customer app's Home and Garage Book's one-customer screen: a needle that
 * sweeps all the way once, like an engine starting, and settles at `angle`, with the arc
 * filled to `share`. Each app works both out with core's washGaugeAngle and
 * washGaugeShare (this package has no core dependency). Overdue pins it at the end stop
 * in amber. Drawn, not read: the figure and the line beside it say the same in words.
 */
export function WashGaugeDial({
  angle,
  share,
  over,
  reversed = false,
}: {
  /** core's washGaugeAngle: -90 just washed, +90 the interval reached. */
  angle: number;
  /** core's washGaugeShare: the arc's fill, 0–1. */
  share: number;
  over: boolean;
  /** Higher is better (Shine Score, 0075): the arc runs red → amber → green. */
  reversed?: boolean;
}) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const ref = useRef<ViewRef>(null);
  const seen = useSeenOnce(ref);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
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
            <Stop offset="0" stopColor={reversed ? '#FF2D4A' : '#22C55E'} />
            <Stop offset={reversed ? '0.4' : '0.6'} stopColor="#F5B83D" />
            <Stop offset="1" stopColor={reversed ? '#22C55E' : '#FF2D4A'} />
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
