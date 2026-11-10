import { formatClock } from '@repo/core/format';
import { answerByRing, type AnswerDeadline } from '@repo/core/moments';
import { RED_LIGHT } from '@repo/native-ui/tokens';
import { useReduceMotion } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { useColors, useFinish } from '@repo/native-ui/theme';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const R = 52;
const ROUND = 2 * Math.PI * R;

/**
 * "They answer by" (moment 3; the website's components/moments/answer-by-ring.tsx):
 * while a paid booking waits for the garage, the time it has left to reply drains from
 * a red-lit ring, with the minutes left in the middle. It moves with the clock the screen
 * already keeps; the arc draws in once on arrival. When the garage's clock has not
 * started yet (it is shut), the ring is full and names the time instead. The words beside
 * it already say "They answer by …", so the ring is drawn, not read.
 */
export function AnswerByRing({ deadline, now }: { deadline: AnswerDeadline; now: number }) {
  const reduce = useReduceMotion();
  const colors = useColors();
  const { fx } = useFinish();
  const { fraction, minutesLeft } = answerByRing(deadline, now);
  const offset = useRef(new Animated.Value(reduce ? ROUND * (1 - fraction) : ROUND)).current;
  const drawn = useRef(false);
  useEffect(() => {
    const to = ROUND * (1 - fraction);
    if (reduce) {
      offset.setValue(to);
      return;
    }
    const run = Animated.timing(offset, { toValue: to, duration: drawn.current ? 1000 : 1400, useNativeDriver: false });
    drawn.current = true;
    run.start();
    return () => run.stop();
  }, [fraction, reduce, offset]);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.box}>
      <Svg width={72} height={72} viewBox="0 0 120 120" style={styles.turn}>
        <Circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          strokeWidth={6}
          stroke={colors.scheme === 'light' ? colors.line : 'rgba(255,255,255,0.1)'}
        />
        <AnimatedCircle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          strokeWidth={6}
          stroke={RED_LIGHT}
          strokeLinecap="round"
          strokeDasharray={`${ROUND} ${ROUND}`}
          strokeDashoffset={offset}
        />
      </Svg>
      <View style={styles.middle}>
        {minutesLeft === null ? (
          <>
            <T variant="over" color={fx.quiet}>
              by
            </T>
            <T num variant="t5" weight={600}>
              {formatClock(deadline.respondBy)}
            </T>
          </>
        ) : (
          <>
            <T num size={20} weight={600} lh={22}>
              {minutesLeft}
            </T>
            <T variant="over" weight={500} uppercase={false} tracking={0} color={fx.quiet}>
              min left
            </T>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 72, height: 72, flexShrink: 0 },
  turn: { transform: [{ rotate: '-90deg' }] },
  middle: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
