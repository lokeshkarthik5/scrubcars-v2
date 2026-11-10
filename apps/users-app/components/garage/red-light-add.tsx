import { IconPlus } from '@repo/native-ui/icons';
import { EASE_SPRING, useReduceMotion, type ViewRef } from '@repo/native-ui/motion';
import { RED_LIGHT } from '@repo/native-ui/tokens';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Animated,
  Easing,
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Point = { x: number; y: number };

/** Where a flying dot lands: the booking bar, once it is up. Measured when a dot leaves. */
const FlyContext = createContext<{ fly: (from: Point) => void; target: RefObject<ViewRef | null> } | null>(null);

/**
 * The garage page's flight layer (§5): a just-added service sends a small white dot to the
 * booking bar (`flyTarget`), or towards the bottom of the screen while the bar is still
 * rising. One arc of transform and opacity, gone on landing; none under Reduce Motion.
 */
export function FlyHost({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const target = useRef<ViewRef>(null);
  const [flights, setFlights] = useState<{ id: number; from: Point; to: Point }[]>([]);
  const next = useRef(0);
  const fly = useCallback(
    (from: Point) => {
      const land = (to: Point) => setFlights((list) => [...list, { id: next.current++, from, to }]);
      const fallback = { x: Math.min(width, 428) / 4, y: height - 46 };
      if (!target.current) return land(fallback);
      target.current.measureInWindow((x: number, y: number, _w: number, h: number) =>
        land(h > 0 ? { x: x + 40, y: y + h / 2 } : fallback)
      );
    },
    [width, height]
  );
  const value = useMemo(() => ({ fly, target }), [fly]);
  return (
    <FlyContext.Provider value={value}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {flights.map((flight) => (
          <FlyingDot
            key={flight.id}
            from={flight.from}
            to={flight.to}
            onDone={() => setFlights((list) => list.filter((f) => f.id !== flight.id))}
          />
        ))}
      </View>
    </FlyContext.Provider>
  );
}

/** The booking bar's ref, for the dot to land on it. */
export const useFlyTarget = () => useContext(FlyContext)?.target;

function FlyingDot({ from, to, onDone }: { from: Point; to: Point; onDone: () => void }) {
  const styles = useStyles();
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(p, {
      toValue: 1,
      duration: 520,
      easing: Easing.bezier(0.5, 0, 0.3, 1),
      useNativeDriver: true,
    }).start(onDone);
    // A flight runs once from where it started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const peak = Math.min(from.y, to.y) - 60;
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          opacity: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1, 0] }),
          transform: [
            {
              translateX: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [from.x, (from.x + to.x) / 2, to.x] }),
            },
            { translateY: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [from.y, peak, to.y] }) },
            { scale: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.8, 0.4] }) },
          ],
        },
      ]}
    />
  );
}

/**
 * The red-light Add (§1, §5; apps/users/components/garage/red-light-add.tsx): a graphite
 * button with a red + and a dim red light waiting under it; once added it reads "Added",
 * the light switches fully on, a tick draws itself and a small dot flies to the booking
 * bar. Red only as light: the solid red button is Book now's alone. A toggle named in
 * full, 44 tall, the same width in both states so nothing shifts under the finger.
 */
export function RedLightAdd({
  name,
  added,
  onToggle,
  disabled = false,
  fly = true,
  style,
}: {
  name: string;
  added: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** The dot to the booking bar: on the garage page, not at checkout. */
  fly?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const colors = useColors();
  const reduce = useReduceMotion();
  const host = useContext(FlyContext);
  const ref = useRef<ViewRef>(null);
  const pop = useRef(new Animated.Value(1)).current;
  const light = useRef(new Animated.Value(added ? 1 : 0)).current;
  const tick = useRef(new Animated.Value(added ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      light.setValue(added ? 1 : 0);
      tick.setValue(added ? 1 : 0);
      return;
    }
    Animated.timing(light, {
      toValue: added ? 1 : 0,
      duration: 300,
      easing: EASE_SPRING,
      useNativeDriver: true,
    }).start();
    if (added) {
      tick.setValue(0);
      Animated.timing(tick, {
        toValue: 1,
        duration: 350,
        easing: Easing.bezier(0.65, 0, 0.35, 1),
        useNativeDriver: false,
      }).start();
      pop.setValue(0.9);
      Animated.spring(pop, { toValue: 1, speed: 24, bounciness: 12, useNativeDriver: true }).start();
    }
  }, [added, reduce, light, tick, pop]);

  const ink = colors.scheme === 'light' ? colors.textPrimary : '#FFFFFF';
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={added ? `Remove ${name} from booking` : `Add ${name} to booking`}
      accessibilityState={{ selected: added, disabled }}
      disabled={disabled}
      onPress={() => {
        if (!added && fly && host && !reduce) {
          ref.current?.measureInWindow((x: number, y: number, w: number, h: number) =>
            host.fly({ x: x + w / 2, y: y + h / 2 })
          );
        }
        onToggle();
      }}
      style={({ pressed }) => [disabled && styles.dim, pressed && !reduce && styles.pressed, style]}
    >
      <Animated.View style={[styles.add, { transform: [{ scale: pop }] }]}>
        <LinearGradient
          colors={
            colors.scheme === 'light'
              ? [colors.surface, colors.surfaceElevated]
              : added
                ? ['#383840', '#1D1D23']
                : ['#26262D', '#1B1B20']
          }
          style={[StyleSheet.absoluteFill, styles.face]}
        />
        <View
          style={[
            styles.face,
            styles.rim,
            {
              borderColor:
                colors.scheme === 'light' ? colors.border : added ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)',
            },
          ]}
        />
        {added ? (
          <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
            <AnimatedPath
              d="M5 12.5l4.2 4.2L19 7"
              stroke="#FF4D66"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="30"
              strokeDashoffset={tick.interpolate({ inputRange: [0, 1], outputRange: [30, 0] })}
            />
          </Svg>
        ) : (
          <IconPlus size={15} line={2} color="#FF4D66" />
        )}
        <T variant="t4" weight={600} color={ink}>
          {added ? 'Added' : 'Add'}
        </T>
        <Animated.View
          style={[
            styles.light,
            added && styles.lightGlow,
            {
              opacity: light.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] }),
              transform: [{ scaleX: light.interpolate({ inputRange: [0, 1], outputRange: [1, 1.57] }) }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const useStyles = createStyles(() => ({
  dim: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.93 }] },
  add: {
    height: 44,
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 3,
    borderRadius: 12,
  },
  face: { borderRadius: 12 },
  rim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1 },
  light: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    width: 14,
    height: 2,
    borderRadius: 2,
    backgroundColor: RED_LIGHT,
  },
  lightGlow: { shadowColor: RED_LIGHT, shadowOffset: { width: 0, height: 0 }, shadowRadius: 5, shadowOpacity: 0.95 },
  dot: {
    position: 'absolute',
    left: -7,
    top: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F4F4F6',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 0.6,
  },
}));
