import { useT } from '@repo/core/i18n';
import { Edge, RedLight } from '@repo/native-ui/finish';
import { useOneShot } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { ProgressRoad, type RoadStop } from './road';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** How long the moment holds before it hands the screen back. */
const HOLD_MS = 2400;
const DRAW = Easing.bezier(0.65, 0, 0.35, 1);
const RING = 2 * Math.PI * 30;

/**
 * Ignition (moment 1; the website's components/moments/ignition.tsx), the moment after
 * paying, in place of the confetti burst: the Pay button's red light runs out along the
 * bottom like an LED strip switching on, the screen dims, a tick draws itself in a
 * red-lit ring, and the booking card rises with the road and the car parked at
 * Requested. The same words as before ("Booking requested / Waiting for…", "Booking
 * confirmed / …"). Plays once and hands the screen back by itself; under Reduce Motion
 * everything is simply there for the same time. Announced once.
 */
export function Ignition({
  title,
  subtitle,
  stops,
  caption,
  onDone,
}: {
  title: string;
  subtitle?: string;
  stops: RoadStop[];
  caption?: string | null;
  onDone: () => void;
}) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const { fx } = useFinish();
  const dim = useOneShot({ delay: 200, duration: 400, easing: Easing.ease });
  const strip = useOneShot({ delay: 50, duration: 550 });
  const ring = useOneShot({ delay: 450, duration: 600, easing: DRAW, native: false });
  const tick = useOneShot({ delay: 850, duration: 350, easing: DRAW, native: false });
  const card = useOneShot({ delay: 1000, duration: 550 });
  const leave = useRef(new Animated.Value(1)).current;
  // Held in a ref so the timers are not restarted when the screen behind re-renders (it polls).
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility([title, subtitle].filter(Boolean).join('. '));
    const fade = setTimeout(
      () => Animated.timing(leave, { toValue: 0, duration: 220, useNativeDriver: true }).start(),
      HOLD_MS
    );
    const done = setTimeout(() => onDoneRef.current(), HOLD_MS + 220);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => onDoneRef.current()}>
      <Animated.View accessibilityViewIsModal style={[StyleSheet.absoluteFill, { opacity: leave }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: dim }]} />
        <View style={styles.column}>
          <Svg
            width={64}
            height={64}
            viewBox="0 0 64 64"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.tick}
          >
            <AnimatedCircle
              cx="32"
              cy="32"
              r="30"
              fill="none"
              stroke="#FF2D4A"
              strokeWidth={2}
              strokeDasharray={`${RING} ${RING}`}
              strokeDashoffset={ring.interpolate({ inputRange: [0, 1], outputRange: [RING, 0] })}
            />
            <AnimatedPath
              d="M20 33l8 8l16-17"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="30"
              strokeDashoffset={tick.interpolate({ inputRange: [0, 1], outputRange: [30, 0] })}
            />
          </Svg>
          <Animated.View
            style={[
              styles.cardBox,
              {
                opacity: card,
                transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
              },
            ]}
          >
            <Edge radius={22} style={styles.card}>
              <T variant="t2" accessibilityRole="header">
                {title}
              </T>
              {subtitle ? (
                <T variant="t4" weight={400} color={colors.textSecondary} style={styles.subtitle}>
                  {subtitle}
                </T>
              ) : null}
              <ProgressRoad stops={stops} compact label={t('Your booking, just sent')} style={styles.road} />
              {caption ? (
                <T variant="t5" color={fx.quiet}>
                  {caption}
                </T>
              ) : null}
            </Edge>
          </Animated.View>
          <Animated.View
            style={[
              styles.strip,
              { transform: [{ scaleX: strip.interpolate({ inputRange: [0, 1], outputRange: [0.125, 1] }) }] },
            ]}
          >
            <RedLight width={320} />
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const useStyles = createStyles(() => ({
  dim: { backgroundColor: 'rgba(0,0,0,0.78)' },
  column: { flex: 1, alignItems: 'center', paddingHorizontal: 16 },
  tick: { marginTop: '44%' },
  cardBox: { marginTop: 24, alignSelf: 'stretch' },
  card: { padding: 16 },
  subtitle: { marginTop: 4 },
  road: { marginTop: 26, marginBottom: 12 },
  strip: { position: 'absolute', bottom: 18, alignSelf: 'center' },
}));
