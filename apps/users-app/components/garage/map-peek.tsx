import { useT } from '@repo/core/i18n';
import { LUXURY_MAKE_PARAM, LUXURY_PARAM } from '@repo/core/luxury';
import type { BookingType, Vendor } from '@repo/core/types';
import { Glass, Odometer } from '@repo/native-ui/finish';
import { IconArrowUpRight } from '@repo/native-ui/icons';
import { PressScale, useReduceMotion } from '@repo/native-ui/motion';
import { RED_LIGHT } from '@repo/native-ui/tokens';
import { T } from '@repo/native-ui/text';
import { createStyles, useFinish } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';

import { PEEK_PLANE_PX, peekZoom, planePoint, tiltProject } from '@/lib/map-3d';
import type { LatLng } from '@/lib/map-view';

/** The card's height, and where on it the customer stands (the plane's anchor). */
const CARD_HEIGHT = 156;
const ANCHOR_Y = 72;
const PERSPECTIVE = 620;
const TILT = 52;
const HALF = PEEK_PLANE_PX / 2;
const GRID = 34;

/**
 * The map peek under the search (§3, apps/users/components/garages/map-peek.tsx): a
 * small dark map of the customer's area tilted back in 3D, every garage of the current
 * mode a red dot dropping in one after another, the customer a white dot, the nearest
 * garage tagged with its km, and "N garages near you" and "Map ↗" on glass. The whole
 * card opens the map on the same mode and category (and "Luxury specialists", when on), and
 * it drifts as the list scrolls.
 *
 * Real coordinates: the dots are placed with Web Mercator pixels (lib/map-3d.ts), then
 * projected through the same tilt the plane is drawn at, so they stand over their spots.
 * The plane is a drawn street grid rather than a second map: a live map on the list
 * screen would cost far more than it shows at this size, and the spec asks for the
 * lighter of the two. The tilt runs on the native driver; under Reduce Motion it opens
 * already tilted with every dot in place, and does not move on scroll.
 */
export function MapPeek({
  vendors,
  origin,
  centre,
  mode,
  category,
  luxury = false,
  luxuryMake,
  countLabel,
  scrollY,
}: {
  vendors: readonly Vendor[];
  origin?: LatLng;
  centre: LatLng;
  mode: BookingType;
  category?: string;
  /** "Luxury specialists" is on (0083): the map opens with it on too. */
  luxury?: boolean;
  /** "Specialists for your <Make>"'s See all is on: that make only, on the map too. */
  luxuryMake?: string;
  /** "12 garages near you"; with no count (a small city, 0070), the words alone: "Detlio in Madurai". */
  countLabel: { count: string | null; words: string };
  /** The list's scroll, for the drift. */
  scrollY: Animated.Value;
}) {
  const t = useT();
  const styles = useStyles();
  const { fx, scheme } = useFinish();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const tilt = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const [dropped, setDropped] = useState(reduce);

  const pinned = useMemo(
    () => vendors.filter((v): v is Vendor & { lat: number; lng: number } => v.lat != null && v.lng != null),
    [vendors]
  );
  const zoom = useMemo(() => peekZoom(centre, pinned), [centre, pinned]);
  const nearestId = useMemo(() => {
    if (!origin) return null;
    let best: { id: string; km: number } | null = null;
    for (const v of pinned) {
      if (v.distanceKm != null && (!best || v.distanceKm < best.km)) best = { id: v.id, km: v.distanceKm };
    }
    return best?.id ?? null;
  }, [origin, pinned]);

  // The opening: the map tilts back over a second, a quarter second in, and the dots
  // drop once it is most of the way over.
  useEffect(() => {
    if (reduce) {
      tilt.setValue(1);
      setDropped(true);
      return;
    }
    const run = Animated.timing(tilt, {
      toValue: 1,
      duration: 1000,
      delay: 250,
      easing: Easing.out(Easing.poly(4)),
      useNativeDriver: true,
    });
    run.start();
    const timer = setTimeout(() => setDropped(true), 420);
    return () => {
      run.stop();
      clearTimeout(timer);
    };
  }, [reduce, tilt]);

  // The plane turns about its own middle, the customer's spot, seen from there.
  const anchor = { x: width / 2, y: ANCHOR_Y };
  const place = (point: LatLng) =>
    tiltProject(planePoint(point, centre, zoom, { x: 0, y: 0 }), anchor, TILT, PERSPECTIVE, anchor);
  // Dots drop in north to south, the way the mockup reads.
  const order = [...pinned].sort((a, b) => b.lat - a.lat);
  const drift = reduce ? 0 : scrollY.interpolate({ inputRange: [0, 133], outputRange: [0, 40], extrapolate: 'clamp' });

  const query = new URLSearchParams({ bookingType: mode });
  if (category) query.set('category', category);
  if (luxury) query.set(LUXURY_PARAM, '1');
  if (luxuryMake) query.set(LUXURY_MAKE_PARAM, luxuryMake);
  const plane = scheme === 'light' ? fx.recessedFill[0] : '#0D0E12';
  const street = scheme === 'light' ? 'rgba(10,10,11,0.06)' : 'rgba(255,255,255,0.05)';

  return (
    <PressScale
      accessibilityRole="link"
      accessibilityLabel={
        countLabel.count
          ? t('Open the map: {count} {words}', { count: countLabel.count, words: countLabel.words })
          : t('Open the map: {words}', { words: countLabel.words })
      }
      onPress={() => router.navigate(`/map?${query.toString()}` as Href)}
      style={styles.card}
    >
      <View style={styles.frame} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateY: drift }] }]}>
            <Animated.View
              style={[
                styles.plane,
                {
                  left: width / 2 - HALF,
                  top: ANCHOR_Y - HALF,
                  transform: [
                    { perspective: PERSPECTIVE },
                    { rotateX: tilt.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${TILT}deg`] }) },
                  ],
                },
              ]}
            >
              <Svg width={PEEK_PLANE_PX} height={PEEK_PLANE_PX}>
                <Defs>
                  <RadialGradient id="peek-me" cx="50%" cy="50%" rx="24%" ry="24%">
                    <Stop offset="0" stopColor="#E4002B" stopOpacity={0.16} />
                    <Stop offset="1" stopColor="#E4002B" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Rect width={PEEK_PLANE_PX} height={PEEK_PLANE_PX} fill={plane} />
                {Array.from({ length: Math.floor(PEEK_PLANE_PX / GRID) + 1 }, (_, i) => (
                  <Line
                    key={`h${i}`}
                    x1={0}
                    x2={PEEK_PLANE_PX}
                    y1={i * GRID}
                    y2={i * GRID}
                    stroke={street}
                    strokeWidth={1}
                  />
                ))}
                {Array.from({ length: Math.floor(PEEK_PLANE_PX / GRID) + 1 }, (_, i) => (
                  <Line
                    key={`v${i}`}
                    y1={0}
                    y2={PEEK_PLANE_PX}
                    x1={i * GRID}
                    x2={i * GRID}
                    stroke={street}
                    strokeWidth={1}
                  />
                ))}
                <Rect width={PEEK_PLANE_PX} height={PEEK_PLANE_PX} fill="url(#peek-me)" />
              </Svg>
            </Animated.View>

            {order.map((vendor, i) => {
              const at = place(vendor);
              return (
                <View key={vendor.id} style={[styles.spot, { left: at.x, top: at.y }]}>
                  {dropped ? <Drop index={i} near={vendor.id === nearestId ? vendor.distanceKm : null} /> : null}
                </View>
              );
            })}
            {origin ? (
              <View style={[styles.spot, { left: place(origin).x, top: place(origin).y }]}>
                {dropped ? <View style={styles.me} /> : null}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        <LinearGradient
          pointerEvents="none"
          colors={[
            `${fx.edgeFill[1]}F2`,
            `${fx.edgeFill[1]}59`,
            `${fx.edgeFill[1]}00`,
            `${fx.edgeFill[1]}00`,
            `${fx.edgeFill[1]}B3`,
          ]}
          locations={[0, 0.22, 0.42, 0.66, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Glass radius={999} style={[styles.chip, styles.count]}>
          <View style={styles.redDot} />
          {countLabel.count ? (
            <Odometer
              value={countLabel.count}
              size={13}
              weight={600}
              color={scheme === 'light' ? undefined : '#FFFFFF'}
              lh={18}
            />
          ) : null}
          <T variant="t4" color={scheme === 'light' ? undefined : '#E8E8EC'}>
            {countLabel.words}
          </T>
        </Glass>
        <Glass radius={999} style={[styles.chip, styles.open]}>
          <T variant="t4" weight={600} color={scheme === 'light' ? undefined : '#FFFFFF'}>
            {t('Map')}
          </T>
          <IconArrowUpRight size={14} color={scheme === 'light' ? undefined : '#FFFFFF'} />
        </Glass>
      </View>
    </PressScale>
  );
}

/** One garage's dot, dropping in with a spring; the nearest one tagged with its km. */
function Drop({ index, near }: { index: number; near: number | null }) {
  const styles = useStyles();
  const { scheme } = useFinish();
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.timing(p, {
      toValue: 1,
      duration: 520,
      delay: (index + 3) * 70,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [index, p]);
  return (
    <Animated.View
      style={{
        opacity: p.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) },
          { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
        ],
      }}
    >
      <View style={styles.shadow} />
      <View style={styles.dot} />
      {near !== null ? (
        <Glass radius={10} style={styles.km}>
          <T num size={12} weight={600} lh={14} color={scheme === 'light' ? undefined : '#FFFFFF'}>
            {`${near.toFixed(1)} km`}
          </T>
        </Glass>
      ) : null}
    </Animated.View>
  );
}

const useStyles = createStyles((c) => ({
  card: { height: CARD_HEIGHT },
  frame: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.scheme === 'light' ? c.border : 'rgba(255,255,255,0.14)',
    backgroundColor: c.scheme === 'light' ? c.surfaceElevated : '#0B0C0F',
  },
  plane: { position: 'absolute', width: PEEK_PLANE_PX, height: PEEK_PLANE_PX },
  spot: { position: 'absolute', width: 0, height: 0 },
  dot: {
    position: 'absolute',
    left: -6,
    top: -12,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#E4002B',
    shadowColor: '#E4002B',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 7,
    shadowOpacity: 0.9,
  },
  shadow: {
    position: 'absolute',
    left: -7,
    top: -3,
    width: 14,
    height: 5,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  me: {
    position: 'absolute',
    left: -5,
    top: -10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.scheme === 'light' ? c.meDot : '#FFFFFF',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.7,
  },
  km: { position: 'absolute', top: -42, left: -26, paddingHorizontal: 8, paddingVertical: 6 },
  chip: {
    position: 'absolute',
    bottom: 10,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  count: { left: 10 },
  open: { right: 10, gap: 4, paddingRight: 10 },
  redDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: RED_LIGHT,
    shadowColor: '#E4002B',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
    shadowOpacity: 0.9,
  },
}));
