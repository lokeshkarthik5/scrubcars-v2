import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { EASE_SETTLE, Pop, PressScale, useReduceMotion } from './motion';
import { T } from './text';
import { useColors, useFinish } from './theme';
import { RED_LIGHT, redButtonGradient } from './tokens';
import { useT } from './lang';

/**
 * The finish's materials and controls (docs/ui-round-2026-11.md §1), the native twins
 * of packages/ui/styles/finish.css and packages/ui/src/finish. A lit edge is drawn
 * as the web draws it: a gradient one point wider than the fill, so the edge is bright
 * on top and fades down instead of being a flat grey line. Every effect is one-shot,
 * on the native driver, and off under Reduce Motion.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Materials ───────────────────────────────────────────────────────────────

type SurfaceProps = ViewProps & {
  radius?: number;
  children?: ReactNode;
  innerStyle?: StyleProp<ViewStyle>;
  /** The outer view, for a caller that measures it (a card's "seen once"). */
  ref?: Ref<ComponentRef<typeof View>>;
};

function Rimmed({
  rim,
  rimLocations,
  fill,
  radius,
  shadow,
  style,
  innerStyle,
  children,
  ...props
}: SurfaceProps & {
  rim: readonly string[];
  rimLocations?: readonly number[];
  fill: readonly string[];
  radius: number;
  shadow: ViewStyle;
}) {
  return (
    <View style={[{ borderRadius: radius }, shadow, style]} {...props}>
      <LinearGradient
        pointerEvents="none"
        colors={[...rim] as [string, string, ...string[]]}
        locations={rimLocations ? ([...rimLocations] as [number, number, ...number[]]) : undefined}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[...fill] as [string, string, ...string[]]}
        style={[styles.inset, { borderRadius: Math.max(0, radius - 1) }]}
      />
      <View style={[styles.grow, innerStyle]}>{children}</View>
    </View>
  );
}

/** fx-edge: a big surface (a card, the map card), its edge lit from above. */
export function Edge({ radius = 22, ...props }: SurfaceProps) {
  const { fx } = useFinish();
  return (
    <Rimmed
      {...props}
      radius={radius}
      rim={fx.edgeRim}
      rimLocations={[0, 0.38, 1]}
      fill={fx.edgeFill}
      shadow={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 16,
        shadowOpacity: fx.shadowOpacity * 0.6,
      }}
    />
  );
}

/** fx-raised: something you press, lighter, with a soft shadow under it. */
export function Raised({ radius = 18, ...props }: SurfaceProps) {
  const { fx } = useFinish();
  return (
    <Rimmed
      {...props}
      radius={radius}
      rim={fx.raisedRim}
      fill={fx.raisedFill}
      shadow={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        shadowOpacity: fx.shadowOpacity * 0.5,
      }}
    />
  );
}

/** fx-recessed: something you type into, and a switch's track, pressed into the screen. */
export function Recessed({ radius = 16, ...props }: SurfaceProps) {
  const { fx } = useFinish();
  return <Rimmed {...props} radius={radius} rim={fx.recessedRim} fill={fx.recessedFill} shadow={styles.none} />;
}

/**
 * fx-glass: a bar or a sheet floating over content. The blur, a faint white wash and
 * a one-point light edge, over the panel's own colour so words read on any photo.
 */
export function Glass({
  radius = 18,
  heavy = false,
  base,
  edge = true,
  intensity = 40,
  style,
  children,
  ...props
}: ViewProps & {
  radius?: number;
  heavy?: boolean;
  base?: string;
  edge?: boolean;
  intensity?: number;
  children?: ReactNode;
}) {
  const { fx } = useFinish();
  return (
    <View
      style={[
        { borderRadius: radius, overflow: 'hidden' },
        edge && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: fx.glassEdge },
        style,
      ]}
      {...props}
    >
      <BlurView pointerEvents="none" intensity={intensity} tint={fx.glassTint} style={StyleSheet.absoluteFill} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: base ?? (heavy ? fx.glassSheet : fx.glassBase) }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[...fx.glassWash] as [string, string]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/** fx-pearl: the chosen tile, the ↗ on a card, the + in the bar. Still: it never shines. */
export function Pearl({
  size,
  width,
  height,
  radius,
  style,
  children,
}: {
  /** A disc or square of this size; leave it out and size the pearl by `style` (a tile). */
  size?: number;
  width?: number;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { fx } = useFinish();
  const w = width ?? size;
  const h = height ?? size;
  const r = radius ?? (w !== undefined && h !== undefined ? Math.min(w, h) / 2 : 16);
  return (
    <View
      style={[
        { width: w, height: h, borderRadius: r, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
        styles.pearlShadow,
        style,
      ]}
    >
      <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="pearl" cx="50%" cy="22%" rx="70%" ry="80%" fx="50%" fy="22%">
            <Stop offset="0" stopColor={fx.pearl[0]} />
            <Stop offset="0.5" stopColor={fx.pearl[1]} />
            <Stop offset="1" stopColor={fx.pearl[2]} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#pearl)" />
      </Svg>
      {children}
    </View>
  );
}

/** The pearl's ink: what an icon or a word on it is drawn in. */
export const usePearlInk = () => useFinish().fx.pearlInk;

/**
 * The red light (§1, "Red, exactly two ways"): a small glowing bar under the chosen
 * thing. `dim` waits under an Add not yet pressed; `off` is gone. Drawn, never read.
 */
export function RedLight({
  state = 'on',
  width = 20,
  style,
}: {
  state?: 'on' | 'dim' | 'off';
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const target = state === 'on' ? 1 : state === 'dim' ? 0.28 : 0;
  const level = useRef(new Animated.Value(target)).current;
  const grow = useRef(new Animated.Value(state === 'off' ? 0 : 1)).current;
  useEffect(() => {
    if (reduce) {
      level.setValue(target);
      grow.setValue(state === 'off' ? 0 : 1);
      return;
    }
    Animated.parallel([
      Animated.timing(level, { toValue: target, duration: 300, useNativeDriver: true }),
      Animated.timing(grow, {
        toValue: state === 'off' ? 0 : 1,
        duration: 300,
        easing: EASE_SETTLE,
        useNativeDriver: true,
      }),
    ]).start();
  }, [target, state, reduce, level, grow]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.redLight,
        { width, opacity: level, transform: [{ scaleX: grow }] },
        state === 'on' ? styles.redGlow : null,
        style,
      ]}
    />
  );
}

/**
 * The solid red button: the booking or payment action, and nothing else (Book now,
 * Add to booking, Pay ₹X, Book in the quick look, Confirm reschedule, Pay final bill,
 * Approve & pay). Greyed while it cannot be pressed.
 */
export function RedButton({
  onPress,
  disabled = false,
  height = 52,
  radius = 16,
  accessibilityLabel,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  height?: number;
  radius?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[{ height, borderRadius: radius }, !disabled && styles.redShadow, style]}
    >
      <View style={[styles.redFace, { borderRadius: radius }, disabled && { backgroundColor: colors.surfaceElevated }]}>
        {!disabled ? (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={[...redButtonGradient.colors]}
              locations={[...redButtonGradient.locations]}
              start={redButtonGradient.start}
              end={redButtonGradient.end}
              style={StyleSheet.absoluteFill}
            />
            {/* inset 0 1px 0 rgb(255 255 255 / .35) */}
            <View pointerEvents="none" style={styles.redHighlight} />
          </>
        ) : null}
        {typeof children === 'string' ? (
          <T variant="t3" weight={600} color={disabled ? colors.textMuted : colors.white}>
            {children}
          </T>
        ) : (
          children
        )}
      </View>
    </PressScale>
  );
}

/** The faint red glow at the very top of a screen. None in the light theme. */
export function TopGlow() {
  const { fx } = useFinish();
  const { width, height } = useWindowDimensions();
  if (!fx.topGlow) return null;
  const h = Math.round(height * 0.46);
  // radial-gradient(130% 70% at 50% -8%, red 9%, transparent 62%), as finish.css draws it.
  return (
    <Svg pointerEvents="none" width={width} height={h} style={styles.glow}>
      <Defs>
        <RadialGradient
          id="top-glow"
          gradientUnits="userSpaceOnUse"
          cx={width / 2}
          cy={-h * 0.08}
          fx={width / 2}
          fy={-h * 0.08}
          rx={width * 1.3}
          ry={h * 0.7}
        >
          <Stop offset="0" stopColor={fx.topGlow} stopOpacity={1} />
          <Stop offset="0.62" stopColor={fx.topGlow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={h} fill="url(#top-glow)" />
    </Svg>
  );
}

// ─── The bottom bar's orb ─────────────────────────────────────────────────────

const ORB = 30;

/**
 * The lit tab's orb on the floating bar (the red-glow mockup's F, held still; the web's
 * `hub-orb` in finish.css): a graphite well with a thin ring of light, crimson with two
 * hot spots. It pops in once when the tab is reached and never turns: the finish allows
 * no loops. One copy for the customer's HubNav and the garage's BottomNav.
 */
export function NavOrb({ children }: { children: ReactNode }) {
  const r = ORB / 2;
  return (
    <Pop style={styles.orb}>
      <Svg width={ORB + 8} height={ORB + 8} viewBox={`-4 -4 ${ORB + 8} ${ORB + 8}`} style={styles.orbArt}>
        <Defs>
          <RadialGradient id="orb-well" cx="50%" cy="30%" rx="60%" ry="60%" fx="50%" fy="30%">
            <Stop offset="0" stopColor="#2C2C31" />
            <Stop offset="0.55" stopColor="#19191C" />
            <Stop offset="1" stopColor="#0E0E10" />
          </RadialGradient>
          <SvgGradient id="orb-ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#7A0018" />
            <Stop offset="0.2" stopColor="#FF2A3D" />
            <Stop offset="0.3" stopColor="#FFF1EA" />
            <Stop offset="0.38" stopColor="#FF5C8A" />
            <Stop offset="0.5" stopColor="#7A0019" />
            <Stop offset="0.66" stopColor="#FF4A3A" />
            <Stop offset="0.76" stopColor="#FFF4EF" />
            <Stop offset="0.86" stopColor="#FF2D6F" />
            <Stop offset="1" stopColor="#7A0019" />
          </SvgGradient>
        </Defs>
        {/* The bloom: the same light, wider and soft. */}
        <Circle cx={r} cy={r} r={r - 1.4} fill="none" stroke="url(#orb-ring)" strokeWidth={4.5} strokeOpacity={0.35} />
        <Circle cx={r} cy={r} r={r} fill="url(#orb-well)" />
        <Circle cx={r} cy={r} r={r - 0.7} fill="none" stroke="url(#orb-ring)" strokeWidth={1.4} />
      </Svg>
      {children}
    </Pop>
  );
}

// ─── Controls ────────────────────────────────────────────────────────────────

export interface GraphiteOption<V extends string> {
  value: V;
  label: string;
  /** The quiet second line ("Drive it in"); hidden while the switch is pinned. */
  quiet?: string;
  /** The quiet line in the red tone: something waiting (the garage's "2 waiting" under New). */
  quietTone?: 'red';
  icon?: (color: string) => ReactNode;
  /**
   * The icon alone on the top line, the label drawn small under it where a quiet line
   * would be (the garage's Calendar). The label still names the radio.
   */
  iconOnly?: boolean;
}

/**
 * The graphite mode switch (§1, §3): a recessed track with a raised brushed-graphite
 * key that slides to the choice with a small liquid stretch (it reaches across both
 * places, then settles), and a red light under it once it has landed. Two-line options
 * are 56 tall; `pinned` shrinks them to 44 and hides the quiet line. `size="sm"` is the
 * small one-line switch beside a heading (the garage calendar's Month | Day): 36 tall in a
 * 42 track, still a 44-point target, as the web's. A radiogroup, each radio named by its
 * label with the quiet line as its hint.
 */
export function GraphiteSwitch<V extends string>({
  value,
  onChange,
  options,
  pinned = false,
  size = 'md',
  role = 'radio',
  accessibilityLabel,
  style,
}: {
  value: V;
  onChange: (value: V) => void;
  options: GraphiteOption<V>[];
  pinned?: boolean;
  size?: 'md' | 'sm';
  /**
   * 'tab' when each option opens its own panel (the garage's Services and Settings):
   * a tablist of tabs marked selected, as the web's Radix tabs are. Same look.
   */
  role?: 'radio' | 'tab';
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { fx } = useFinish();
  const colors = useColors();
  const reduce = useReduceMotion();
  const { width: screen } = useWindowDimensions();
  const [trackWidth, setTrackWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const [move, setMove] = useState({ from: index, to: index });
  const p = useRef(new Animated.Value(1)).current;
  const [lit, setLit] = useState(true);
  const litTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new choice, from a tap or from outside (a link's mode): slide from where it was.
  if (move.to !== index) setMove({ from: move.to, to: index });
  useEffect(() => {
    if (move.from === move.to) return;
    if (reduce) {
      p.setValue(1);
      return;
    }
    p.setValue(0);
    setLit(false);
    const run = Animated.timing(p, {
      toValue: 1,
      duration: 460,
      easing: Easing.bezier(0.3, 0.85, 0.25, 1),
      useNativeDriver: true,
    });
    run.start();
    if (litTimer.current) clearTimeout(litTimer.current);
    litTimer.current = setTimeout(() => setLit(true), 300);
    return () => run.stop();
  }, [move, reduce, p]);
  useEffect(
    () => () => {
      if (litTimer.current) clearTimeout(litTimer.current);
    },
    []
  );

  const small = size === 'sm';
  const pad = small ? 3 : 4;
  const keyRadius = small ? 11 : 14;
  const segment = trackWidth > 0 ? (trackWidth - pad * 2) / options.length : 0;
  const from = move.from * segment;
  const to = move.to * segment;
  const span = Math.abs(to - from) + segment;
  // A tight three-way switch drops its icons below 400 points, as the web's does.
  const showIcons = options.length <= 2 || screen >= 400;
  const height = small ? 42 : pinned ? 44 : 56;

  return (
    <Recessed
      radius={small ? 14 : 18}
      accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
      onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
      style={[{ height }, style]}
      innerStyle={[styles.switchRow, small && { padding: pad }]}
    >
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.key,
            small && { top: pad, bottom: pad, left: pad },
            { width: segment, borderRadius: keyRadius },
            {
              transform: [
                { translateX: p.interpolate({ inputRange: [0, 0.42, 1], outputRange: [from, (from + to) / 2, to] }) },
                { scaleX: p.interpolate({ inputRange: [0, 0.42, 1], outputRange: [1, span / segment, 1] }) },
                { scaleY: p.interpolate({ inputRange: [0, 0.42, 1], outputRange: [1, 0.92, 1] }) },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[...fx.graphite]}
            locations={[0, 0.52, 1]}
            style={[StyleSheet.absoluteFill, { borderRadius: keyRadius }]}
          />
          <View style={[styles.keyHighlight, { borderRadius: keyRadius }]} />
          <RedLight
            state={lit ? 'on' : 'off'}
            width={small ? 16 : 20}
            style={[styles.keyLight, small ? { bottom: 3, marginLeft: -8 } : { bottom: pinned ? 3 : 4 }]}
          />
        </Animated.View>
      ) : null}
      {options.map((option, i) => {
        const selected = i === index;
        const ink = selected ? fx.graphiteInk : fx.quiet;
        // An icon-only option's label sits where a quiet line would, gone when pinned.
        const labelUnder = Boolean(option.iconOnly && option.icon);
        return (
          <Pressable
            key={option.value}
            accessibilityRole={role}
            accessibilityState={role === 'tab' ? { selected } : { checked: selected }}
            accessibilityLabel={option.label}
            accessibilityHint={labelUnder ? undefined : option.quiet}
            onPress={() => {
              if (option.value !== value) onChange(option.value);
            }}
            hitSlop={small ? { top: 4, bottom: 4 } : undefined}
            style={[styles.option, small ? { paddingHorizontal: 10 } : { paddingBottom: pinned ? 4 : 6 }]}
          >
            {labelUnder ? (
              <>
                {option.icon?.(ink)}
                {!pinned ? (
                  <T
                    variant="t5"
                    weight={selected ? 600 : 500}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    color={selected ? fx.quietBright : fx.quiet}
                    style={styles.optionQuiet}
                  >
                    {option.label}
                  </T>
                ) : null}
              </>
            ) : (
              <View style={styles.optionTop}>
                {showIcons && option.icon ? option.icon(ink) : null}
                {/* One line, inside its own option: a label too long for it (Tamil) shrinks a
                    little, then ends in an ellipsis, and never runs into its neighbour. */}
                <T
                  size={small || (role === 'tab' && options.length > 3) ? 13 : 14}
                  weight={selected ? 600 : 500}
                  lh={18}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  color={ink}
                  style={styles.optionLabel}
                >
                  {option.label}
                </T>
              </View>
            )}
            {option.quiet && !labelUnder && !pinned ? (
              <T
                variant="t5"
                weight={option.quietTone === 'red' ? 600 : undefined}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                color={option.quietTone === 'red' ? colors.redText : selected ? fx.quietBright : fx.quiet}
                style={styles.optionQuiet}
              >
                {option.quiet}
              </T>
            ) : null}
          </Pressable>
        );
      })}
    </Recessed>
  );
}

/**
 * A two-line control (§1, layout): a raised 56-point button, a main line (14/600) over
 * a quiet line (11/500), an optional pearl tile on the left and anything trailing on
 * the right. `pinned` is its 44-point form with the quiet line hidden.
 */
export function TwoLineControl({
  main,
  quiet,
  tile,
  trailing,
  pinned = false,
  onPress,
  accessibilityLabel,
  style,
}: {
  main: ReactNode;
  quiet?: ReactNode;
  /** The pearl tile's icon, drawn in the pearl's ink. */
  tile?: (ink: string) => ReactNode;
  trailing?: ReactNode;
  pinned?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { fx } = useFinish();
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={style}>
      <Raised radius={18} style={{ height: pinned ? 44 : 56 }} innerStyle={styles.twoLine}>
        {tile ? (
          <Pearl size={pinned ? 32 : 40} radius={pinned ? 10 : 12}>
            {tile(fx.pearlInk)}
          </Pearl>
        ) : null}
        <View style={styles.twoLineText}>
          {typeof main === 'string' ? (
            <T size={14} weight={600} lh={18} numberOfLines={1}>
              {main}
            </T>
          ) : (
            main
          )}
          {quiet && !pinned ? (
            typeof quiet === 'string' ? (
              <T variant="t5" numberOfLines={1} color={fx.quiet}>
                {quiet}
              </T>
            ) : (
              quiet
            )
          ) : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </Raised>
    </PressScale>
  );
}

/**
 * The "Silver+ / Silver & Gold" key (§3): a two-line raised key that turns brushed
 * silver when on, with a coin-flip of its medal and one glint across it, both only
 * on the way on. A toggle named in full for screen readers.
 */
export function SilverKey({
  on,
  onToggle,
  label,
  quiet,
  medal,
  pinned = false,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  quiet: string;
  /** The silver medal, drawn by the app (its tier artwork lives there). */
  medal: ReactNode;
  pinned?: boolean;
}) {
  const t = useT();
  const { fx } = useFinish();
  const colors = useColors();
  const reduce = useReduceMotion();
  const coin = useRef(new Animated.Value(0)).current;
  const glint = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const height = pinned ? 44 : 56;

  const press = () => {
    if (!on && !reduce) {
      coin.setValue(0);
      glint.setValue(0);
      Animated.parallel([
        Animated.timing(coin, {
          toValue: 1,
          duration: 800,
          easing: Easing.bezier(0.3, 0.9, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.timing(glint, { toValue: 1, duration: 900, delay: 120, easing: EASE_SETTLE, useNativeDriver: true }),
      ]).start();
    }
    onToggle();
  };

  const face = (
    <View style={[styles.silverRow, { height }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Animated.View
        style={{
          transform: [
            { perspective: 60 },
            { rotateY: coin.interpolate({ inputRange: [0, 0.45, 1], outputRange: ['0deg', '300deg', '720deg'] }) },
            { scale: coin.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1.35, 1] }) },
          ],
        }}
      >
        {medal}
      </Animated.View>
      <View>
        <T size={14} weight={600} lh={18} numberOfLines={1} color={on ? fx.silverInk : colors.textPrimary}>
          {label}
        </T>
        {!pinned ? (
          <T variant="t5" numberOfLines={1} color={on ? fx.silverQuiet : fx.quiet}>
            {quiet}
          </T>
        ) : null}
      </View>
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glint,
            {
              width: width * 0.4,
              opacity: glint.interpolate({ inputRange: [0, 0.01, 0.99, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: glint.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.6, width * 1.2] }) },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={t('{label}: {quiet} garages only', { label, quiet })}
      accessibilityState={{ selected: on }}
      onPress={press}
    >
      {on ? (
        <View style={[styles.silver, { height }]}>
          <LinearGradient
            colors={[...fx.silver]}
            locations={[0, 0.22, 0.42, 0.64, 0.82, 1]}
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 0.8 }}
            style={StyleSheet.absoluteFill}
          />
          {face}
        </View>
      ) : (
        <Raised radius={18} style={[styles.silverOff, { height }]}>
          {face}
        </Raised>
      )}
    </PressScale>
  );
}

// ─── Figures ─────────────────────────────────────────────────────────────────

/**
 * A figure that rolls like an odometer when it changes (§1): every digit place rolls
 * in from below when the figure grew, from above when it shrank. Read as the plain
 * figure; the rolling places are hidden from screen readers.
 */
export function Odometer({
  value,
  numeric,
  size = 15,
  weight = 600,
  color,
  lh,
}: {
  /** The figure as it should read, formatted ("₹1,049", "5"). */
  value: string;
  numeric?: number;
  size?: number;
  weight?: 400 | 500 | 600 | 700;
  color?: string;
  lh?: number;
}) {
  const reduce = useReduceMotion();
  const number = numeric ?? Number(value.replace(/[^0-9.-]/g, ''));
  const [shown, setShown] = useState({ number, key: 0, dir: 0 });
  if (shown.number !== number && !(Number.isNaN(shown.number) && Number.isNaN(number))) {
    const dir =
      reduce || !Number.isFinite(shown.number) || !Number.isFinite(number) ? 0 : number > shown.number ? 1 : -1;
    setShown({ number, key: shown.key + 1, dir });
  }
  const line = lh ?? Math.round(size * 1.2);
  const places = Array.from(value);
  return (
    <View accessible accessibilityLabel={value} style={styles.odometer}>
      {places.map((char, i) => {
        const digit = /^[0-9]$/.test(char);
        return (
          <View key={`${places.length - i}-${digit ? shown.key : char}`} style={{ height: line, overflow: 'hidden' }}>
            {digit && shown.dir !== 0 ? (
              <RollIn dir={shown.dir} distance={line}>
                <T num size={size} weight={weight} lh={line} color={color}>
                  {char}
                </T>
              </RollIn>
            ) : (
              <T num size={size} weight={weight} lh={line} color={color}>
                {char}
              </T>
            )}
          </View>
        );
      })}
    </View>
  );
}

function RollIn({ dir, distance, children }: { dir: number; distance: number; children: ReactNode }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.timing(p, {
      toValue: 1,
      duration: 480,
      easing: Easing.bezier(0.5, 0, 0.2, 1),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [p]);
  return (
    <Animated.View
      style={{
        opacity: p,
        transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [dir * distance, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The opening-hours ring (§3): the green arc is the share of today's hours still
 * ahead (core's hoursLeftShare). Beside the word "Open", which says the same, so it is
 * hidden from screen readers. Draws in once when `play` turns true.
 */
export function HoursRing({
  share,
  play = false,
  size = 14,
  track,
}: {
  share: number | null;
  play?: boolean;
  size?: number;
  track?: string;
}) {
  const reduce = useReduceMotion();
  const r = 5.6;
  const circumference = 2 * Math.PI * r;
  const final = share === null ? circumference : circumference * (1 - share);
  const offset = useRef(new Animated.Value(play && !reduce ? circumference : final)).current;
  const played = useRef(false);
  useEffect(() => {
    if (share === null) return;
    if (!play || reduce || played.current) {
      offset.setValue(final);
      return;
    }
    played.current = true;
    const run = Animated.timing(offset, {
      toValue: final,
      duration: 1000,
      delay: 200,
      easing: EASE_SETTLE,
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [play, reduce, final, share, offset]);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.ring}
    >
      <Circle cx="8" cy="8" r={r} fill="none" strokeWidth={2.2} stroke={track ?? 'rgba(255,255,255,0.2)'} />
      {share !== null ? (
        <AnimatedCircle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          strokeWidth={2.2}
          stroke="#22C55E"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
        />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
  inset: { position: 'absolute', top: 1, left: 1, right: 1, bottom: 1 },
  none: {},
  pearlShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, shadowOpacity: 0.45 },
  redLight: { height: 2.5, borderRadius: 2, backgroundColor: RED_LIGHT },
  redGlow: { shadowColor: RED_LIGHT, shadowOffset: { width: 0, height: 0 }, shadowRadius: 5, shadowOpacity: 0.95 },
  redShadow: { shadowColor: '#E4002B', shadowOffset: { width: 0, height: 8 }, shadowRadius: 12, shadowOpacity: 0.55 },
  redFace: {
    flex: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
  },
  redHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  glow: { position: 'absolute', top: 0, left: 0 },
  orb: { width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  orbArt: { position: 'absolute', left: -4, top: -4 },
  switchRow: { flexDirection: 'row', padding: 4 },
  key: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 8,
    shadowOpacity: 0.55,
  },
  keyHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  keyLight: { position: 'absolute', left: '50%', marginLeft: -10 },
  option: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  optionLabel: { flexShrink: 1, minWidth: 0 },
  optionQuiet: { maxWidth: '100%' },
  twoLine: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 16 },
  twoLineText: { flex: 1, minWidth: 0, gap: 2 },
  trailing: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  silver: {
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    shadowColor: 'rgb(220,225,235)',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    shadowOpacity: 0.35,
  },
  silverOff: {},
  silverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 16,
    overflow: 'hidden',
  },
  glint: { position: 'absolute', top: -8, bottom: -8, left: 0 },
  odometer: { flexDirection: 'row', alignItems: 'flex-end' },
  ring: { transform: [{ rotate: '-90deg' }] },
});
