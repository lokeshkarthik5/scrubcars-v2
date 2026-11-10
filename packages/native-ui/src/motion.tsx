import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { FINISH_PRESSED_SCALE } from './tokens';

/**
 * The finish's motion (docs/ui-round-2026-11.md §1, packages/ui/src/finish/motion.tsx):
 * one-shot effects only, transform and opacity on the native driver, and none at all
 * when the phone asks for less motion, where the content is simply there. This
 * package has no Reanimated of its own, so it uses React Native's Animated, whose
 * native driver runs these on the UI thread too.
 */

// ─── Reduce motion ───────────────────────────────────────────────────────────

let reduceMotion = false;
const reduceListeners = new Set<() => void>();
let reduceWatched = false;

function watchReduceMotion() {
  if (reduceWatched) return;
  reduceWatched = true;
  const set = (on: boolean) => {
    if (on === reduceMotion) return;
    reduceMotion = on;
    reduceListeners.forEach((listener) => listener());
  };
  AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

function subscribeReduce(onChange: () => void) {
  watchReduceMotion();
  reduceListeners.add(onChange);
  return () => {
    reduceListeners.delete(onChange);
  };
}

/** Whether the phone's Reduce Motion is on. Read once for the app, then kept in step. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduce,
    () => reduceMotion,
    () => reduceMotion
  );
}

/** The same, outside a component (a press handler deciding whether to fly a dot). */
export function reduceMotionNow(): boolean {
  watchReduceMotion();
  return reduceMotion;
}

// ─── Seen once ───────────────────────────────────────────────────────────────

type Check = () => void;

const SeenContext = createContext<{ add: (check: Check) => () => void } | null>(null);

/**
 * Wraps a scrolling screen so the things in it can tell when they first come into
 * view (the web's IntersectionObserver). The screen calls `notify` from its scroll
 * handler; each waiting thing measures itself once per call until it is seen, and
 * then stops asking.
 */
export function useSeenHost() {
  const checks = useRef(new Set<Check>());
  const value = useMemo(
    () => ({
      add: (check: Check) => {
        checks.current.add(check);
        return () => {
          checks.current.delete(check);
        };
      },
    }),
    []
  );
  const notify = useCallback(() => checks.current.forEach((check) => check()), []);
  return { value, notify };
}

export function SeenProvider({
  value,
  children,
}: {
  value: ReturnType<typeof useSeenHost>['value'];
  children: ReactNode;
}) {
  return <SeenContext.Provider value={value}>{children}</SeenContext.Provider>;
}

/**
 * True from the moment the view is first a third on screen, never false again: what
 * starts a card's one-shot effects (the count-up, the road). Already true under
 * reduce motion, so the figures are simply there.
 */
export type ViewRef = ComponentRef<typeof View>;

export function useSeenOnce(ref: RefObject<ViewRef | null>, threshold = 0.35): boolean {
  const reduce = useReduceMotion();
  const host = useContext(SeenContext);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || reduce) return;
    let gone = false;
    const check = () => {
      ref.current?.measureInWindow((_x: number, y: number, _w: number, height: number) => {
        if (gone || height === 0) return;
        const screen = Dimensions.get('window').height;
        const visible = Math.min(screen, y + height) - Math.max(0, y);
        if (visible >= height * threshold) setSeen(true);
      });
    };
    // Once laid out, then on every scroll the host passes on.
    const first = setTimeout(check, 60);
    const remove = host?.add(check);
    return () => {
      gone = true;
      clearTimeout(first);
      remove?.();
    };
  }, [ref, seen, reduce, host, threshold]);
  return seen || reduce;
}

// ─── One-shot entrances ──────────────────────────────────────────────────────

/** The finish's settle (cubic-bezier(.22,1,.36,1)) and spring (.34,1.56,.64,1). */
export const EASE_SETTLE = Easing.bezier(0.22, 1, 0.36, 1);
export const EASE_SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);

/**
 * A value that runs 0 → 1 once, after `delay`, for `duration` ms: the one clock an
 * entrance reads. At 1 from the start under reduce motion.
 */
export function useOneShot({
  play = true,
  delay = 0,
  duration = 400,
  easing = EASE_SETTLE,
  native = true,
}: {
  play?: boolean;
  delay?: number;
  duration?: number;
  easing?: (value: number) => number;
  /** False for what the native driver cannot move (an SVG line's dash): run on the JS thread. */
  native?: boolean;
} = {}): Animated.Value {
  const reduce = useReduceMotion();
  const value = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const done = useRef(reduce);
  // Read when it starts: a caller's inline easing is a new function every render, and must
  // not restart (or strand) a run already going.
  const timing = useRef({ delay, duration, easing, native });
  timing.current = { delay, duration, easing, native };
  useEffect(() => {
    if (done.current) return;
    if (reduce) {
      value.setValue(1);
      done.current = true;
      return;
    }
    if (!play) return;
    done.current = true;
    const { delay: wait, duration: length, easing: curve, native: onNative } = timing.current;
    const run = Animated.timing(value, { toValue: 1, duration: length, delay: wait, easing: curve, useNativeDriver: onNative });
    run.start();
    // Cut short, it ends where it was going: content is never left half shown.
    return () => {
      run.stop();
      value.setValue(1);
    };
  }, [play, reduce, value]);
  return value;
}

/** fx-rise: in from 10 px below, a touch smaller, one after another by `index`. */
export function Rise({
  index = 0,
  delay = 0,
  play = true,
  style,
  children,
}: {
  index?: number;
  delay?: number;
  play?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const p = useOneShot({ play, delay: index * 35 + delay, duration: 400 });
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: p,
          transform: [
            { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** fx-pop: from half size with a spring, once. */
export function Pop({
  play = true,
  delay = 0,
  style,
  children,
}: {
  play?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const p = useOneShot({ play, delay, duration: 420, easing: EASE_SPRING });
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * fx-press: a Pressable that dips to 0.96 with a spring while held and springs back.
 * No dip under reduce motion.
 */
export function PressScale({
  style,
  children,
  onPressIn,
  onPressOut,
  scaleTo = FINISH_PRESSED_SCALE,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  scaleTo?: number;
}) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const { outer, inner } = splitPlacement(style);
  const to = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: value === 1 ? 8 : 0,
    }).start();
  return (
    <Pressable
      {...props}
      style={outer}
      onPressIn={(event) => {
        if (!reduce && !props.disabled) to(scaleTo);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!reduce) to(1);
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[inner, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Where a thing sits among its neighbours: what the pressable itself takes, so `flex: 1` still fills a row. */
const PLACEMENT = new Set([
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'width',
  'minWidth',
  'maxWidth',
  'alignSelf',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'zIndex',
]);

/** A press's style, split: its place for the pressable, its look for the part that dips. */
function splitPlacement(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) (PLACEMENT.has(key) ? outer : inner)[key] = value;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}
