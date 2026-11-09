import { roadStopAt } from '@repo/core/moments';
import { RED_LIGHT } from '@repo/native-ui/tokens';
import { useReduceMotion, useSeenOnce, type ViewRef } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

/** The road's own curve, cubic-bezier(.45,0,.2,1): the car pulls away and parks. */
const DRIVE = Easing.bezier(0.45, 0, 0.2, 1);
/** Where the car parks short of the garage's pin, as on the list card. */
const PARK_SHORT = 30;

/** The small side-on car that drives the road (the list card's own drawing). */
export function RoadCar({ size = 17 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#FFFFFF"
        d="M2.5 15.6v-2.3c0-.9.6-1.6 1.4-1.8l2.6-.6l2.6-3.1c.4-.5 1-.8 1.7-.8h4.6c.7 0 1.3.3 1.7.8l2.7 3.1l1.9.4c.8.2 1.4.9 1.4 1.8v2.5c0 .5-.4.9-.9.9h-1.1a2.4 2.4 0 0 0-4.6 0H8.6a2.4 2.4 0 0 0-4.6 0h-.6c-.5 0-.9-.4-.9-1z"
      />
      <Circle fill="#FFFFFF" cx="6.3" cy="16.6" r="1.7" />
      <Circle fill="#FFFFFF" cx="17.7" cy="16.6" r="1.7" />
    </Svg>
  );
}

/**
 * The road line itself (§3, §5): a hairline from your white dot to the garage's red pin;
 * once `play` turns true it draws itself in and the car drives to the garage. Drawn
 * only: the distance is said in words beside it. The card's and the page's road.
 */
export function RoadLine({
  play,
  delay = 350,
  style,
}: {
  play: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const draw = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const played = useRef(false);
  useEffect(() => {
    if (reduce) {
      draw.setValue(1);
      return;
    }
    if (!play || played.current || width === 0) return;
    played.current = true;
    const run = Animated.timing(draw, { toValue: 1, duration: 950, delay, easing: DRIVE, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [play, reduce, width, draw, delay]);
  const travel = Math.max(0, width - PARK_SHORT);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.road, style]}
    >
      {width > 0 ? (
        <>
          <Animated.View
            style={[
              styles.line,
              {
                width: width - 10,
                transform: [{ translateX: -(width - 10) / 2 }, { scaleX: draw }, { translateX: (width - 10) / 2 }],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.18)', 'rgba(228,0,43,0.75)']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <View style={styles.me} />
          <View style={styles.pin} />
          <Animated.View
            style={[
              styles.car,
              {
                opacity: draw.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1] }),
                transform: [{ translateX: draw.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }],
              },
            ]}
          >
            <RoadCar />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

/**
 * The road from you to the garage on the garage page (§5): drawn in once when it comes
 * into view, with "You" and the garage's name under its two ends.
 */
export function GarageRoad({ from = 'You', to, style }: { from?: string; to: string; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { fx } = useFinish();
  const ref = useRef<ViewRef>(null);
  const seen = useSeenOnce(ref);
  return (
    <View ref={ref} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={style}>
      <RoadLine play={seen} />
      <View style={styles.ends}>
        <T variant="t5" color={fx.quiet}>
          {from}
        </T>
        <T variant="t5" color={fx.quiet} numberOfLines={1} style={styles.shrink}>
          {to}
        </T>
      </View>
    </View>
  );
}

export interface RoadStop {
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

/** The four steps (STATUS_STEPS) as stops, from the headline's step. */
export function statusStops(steps: readonly string[], step: number, finished: boolean): RoadStop[] {
  return steps.map((label, i) => ({
    label,
    state: finished || i < step ? 'done' : i === step ? 'current' : 'upcoming',
  }));
}

/**
 * The road is the progress bar (moment 2): the steps are stops along the road, the part
 * travelled lit and the car parked at the step reached. When the step changes while the
 * screen is open the car drives on to it; the garage's pin flashes like headlights when
 * the booking is accepted, and is a green tick once it is done. Read as a list of the
 * steps, the one reached marked; the road itself is drawn, not read.
 */
export function ProgressRoad({
  stops,
  label = 'Booking progress',
  flashAt,
  compact = false,
  style,
}: {
  stops: RoadStop[];
  label?: string;
  /** The step whose arrival flashes the garage's pin (Accepted). */
  flashAt?: number;
  /** The ticket's small road: no labels under it. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { fx } = useFinish();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const doneAll = stops.length > 0 && stops.every((stop) => stop.state === 'done');
  const currentIndex = stops.findIndex((stop) => stop.state === 'current');
  const lastDone = stops.reduce((last, stop, i) => (stop.state === 'done' ? i : last), -1);
  const at = doneAll ? stops.length - 1 : currentIndex >= 0 ? currentIndex : Math.max(0, lastDone);
  const share = roadStopAt(at, stops.length);
  const travelled = useRef(new Animated.Value(share)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const flashedFor = useRef<number | null>(null);

  // The car drives on to a new step; it is simply there on open and under Reduce Motion.
  useEffect(() => {
    if (reduce) {
      travelled.setValue(share);
      return;
    }
    const run = Animated.timing(travelled, { toValue: share, duration: 900, easing: DRIVE, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [share, reduce, travelled]);

  useEffect(() => {
    if (reduce || flashAt === undefined || at !== flashAt || flashedFor.current === at) return;
    flashedFor.current = at;
    flash.setValue(0);
    Animated.timing(flash, { toValue: 1, duration: 900, delay: 500, useNativeDriver: true }).start();
  }, [at, flashAt, reduce, flash]);

  const inner = Math.max(0, width - 12);
  return (
    <View style={style}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={styles.trackBox}
      >
        {inner > 0 ? (
          <View
            style={[
              styles.track,
              { width: inner, backgroundColor: colors.scheme === 'light' ? colors.line : 'rgba(255,255,255,0.14)' },
            ]}
          >
            <Animated.View
              style={[
                styles.fill,
                {
                  width: inner,
                  transform: [{ translateX: -inner / 2 }, { scaleX: travelled }, { translateX: inner / 2 }],
                },
              ]}
            >
              <LinearGradient
                colors={['#FFFFFF', '#FF4D66']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            {stops.map((stop, i) => {
              const end = i === stops.length - 1;
              const left = roadStopAt(i, stops.length) * inner;
              if (end) {
                return (
                  <View key={stop.label} style={[styles.endStop, { left: left - 7 }, doneAll && styles.endDone]}>
                    <Animated.View
                      style={[
                        styles.headlights,
                        {
                          opacity: flash.interpolate({
                            inputRange: [0, 0.2, 0.3, 0.45, 1],
                            outputRange: [0, 1, 0.35, 1, 0],
                          }),
                        },
                      ]}
                    />
                    {doneAll ? (
                      <Svg
                        width={10}
                        height={10}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth={3.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <Path d="M5 12.5l4.2 4.2L19 7" />
                      </Svg>
                    ) : null}
                  </View>
                );
              }
              return <View key={stop.label} style={[styles.stop, { left: left - 5.5 }, i <= at && styles.stopOn]} />;
            })}
            {!doneAll ? (
              <Animated.View
                style={[
                  styles.trackCar,
                  {
                    transform: [{ translateX: travelled.interpolate({ inputRange: [0, 1], outputRange: [0, inner] }) }],
                  },
                ]}
              >
                <RoadCar />
              </Animated.View>
            ) : null}
          </View>
        ) : null}
      </View>
      <View accessibilityRole="list" accessibilityLabel={label} style={[styles.labels, compact && styles.hidden]}>
        {stops.map((stop, i) => (
          <T
            key={stop.label}
            accessibilityRole="text"
            accessibilityState={i === at ? { selected: true } : undefined}
            accessibilityLabel={i === at ? `${stop.label}, current step` : stop.label}
            variant="t5"
            numberOfLines={1}
            align={i === 0 ? 'left' : i === stops.length - 1 ? 'right' : 'center'}
            color={i === at ? colors.textPrimary : fx.quiet}
            style={styles.label}
          >
            {stop.label}
          </T>
        ))}
      </View>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  road: { height: 1, justifyContent: 'center' },
  line: { position: 'absolute', left: 4, top: 0, height: 1, overflow: 'hidden' },
  me: {
    position: 'absolute',
    left: 0,
    top: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.scheme === 'light' ? c.textPrimary : '#FFFFFF',
  },
  pin: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: '#E4002B',
    shadowColor: RED_LIGHT,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 5,
    shadowOpacity: 0.8,
  },
  car: {
    position: 'absolute',
    left: 0,
    top: -15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    shadowOpacity: 0.8,
  },
  ends: { marginTop: 9, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  shrink: { flexShrink: 1 },
  trackBox: { height: 16, justifyContent: 'center', paddingHorizontal: 6 },
  track: { height: 1 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  stop: {
    position: 'absolute',
    top: -5,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: c.scheme === 'light' ? c.stroke : '#3A3A42',
    backgroundColor: c.scheme === 'light' ? c.surface : '#1D1D22',
  },
  stopOn: {
    backgroundColor: c.scheme === 'light' ? c.textPrimary : '#FFFFFF',
    borderColor: c.scheme === 'light' ? c.textPrimary : '#FFFFFF',
  },
  endStop: {
    position: 'absolute',
    top: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endDone: {
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 0.8,
  },
  headlights: {
    position: 'absolute',
    left: -9,
    top: -9,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  trackCar: {
    position: 'absolute',
    left: -8,
    top: -15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    shadowOpacity: 0.8,
  },
  labels: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  label: { flex: 1, minWidth: 0 },
  hidden: { height: 0, marginTop: 0, overflow: 'hidden', opacity: 0 },
}));
