import { prefetchGarage } from '@repo/core/api/hooks/use-vendors';
import { bookingTypeParam } from '@repo/core/booking-types';
import { anywhereInCityLine } from '@repo/core/reach';
import { distanceLabel, driveTimeLabel } from '@repo/core/drive-time';
import { useT, useTn } from '@repo/core/i18n';
import { hoursLeftShare, openStatus } from '@repo/core/opening-hours';
import { googleRatingSpoken, hasStarScore, mainGoogleRating, NEW_GARAGE_LABEL } from '@repo/core/ratings';
import { DetlioMark, GoogleMapsText, GoogleMark } from '@repo/native-ui/rating-marks';
import type { BookingType, Vendor } from '@repo/core/types';
import { Edge, Glass, HoursRing, Pearl, Raised, usePearlInk } from '@repo/native-ui/finish';
import { IconArrowUpRight, IconHome } from '@repo/native-ui/icons';
import { useReduceMotion, useSeenOnce, type ViewRef } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { memo, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Animated,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { RoadLine } from '@/components/moments/road';
import { buzz, useCountUp } from '@/lib/motion';
import { isApproximate, useLocationStore } from '@/lib/location';
import { useGarageTownTag } from '@/lib/customer-place';

import { GarageCover, GarageMonogram } from './cover';
import { NextFreeRow } from './next-free-row';
import { SaveGarageButton } from './save-button';
import { OutsideCityChip, TierMark } from './tier';

/** How long a press must be held for the quick look (the web's HOLD_MS). */
const HOLD_MS = 450;
const PHOTO_HEIGHT = 196;
/** How far the photos drift with the scroll at the screen's edges. */
const DRIFT = 16;

/** The minute it is now, so a card left on screen turns "Closed" at closing time. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** How long a finger must rest on a card before its garage page is fetched ahead. */
const PREFETCH_AFTER_MS = 120;

/**
 * The Showroom garage card (§3; apps/users/components/garages/showroom-card.tsx), the
 * list's default card: swipeable photos with the name, tier medal and a NEW tag on a
 * shade; "{area} · Known for …"; open or closed on glass with the opening-hours ring; the
 * heart; one row of how good, how far, how much (rating | km and drive | starting price)
 * that counts up once as the card comes into view, and a pearl ↗; the road on the line
 * between photo and facts, along which a small car drives to the garage; the chips; and
 * the Next free row.
 *
 * The photos drift with the scroll, and a press held for 450ms opens the quick look
 * (`onQuickLook`) with a tap of the phone's haptics instead of the garage. Under Reduce
 * Motion none of it moves. The figures that count are hidden from screen readers, which
 * read one plain line instead. The heart, the photo dots and the times are controls of
 * their own beside the card's press, never inside it.
 */
export const ShowroomCard = memo(function ShowroomCard({
  vendor,
  mode,
  chips,
  approxDistance,
  onQuickLook,
  scrollY,
  top,
}: {
  vendor: Vendor;
  mode: BookingType;
  chips?: ReactNode;
  approxDistance?: boolean;
  onQuickLook?: (vendor: Vendor) => void;
  /** The list's scroll and where on it this card sits, for the photos' drift. */
  scrollY?: Animated.Value;
  top?: number;
}) {
  const tn = useTn();
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const { fx } = useFinish();
  const ink = usePearlInk();
  const queryClient = useQueryClient();
  // A garage in another town than the customer's city (0070); null in it.
  const townTag = useGarageTownTag(vendor);
  const reduce = useReduceMotion();
  const { width: screen, height: screenHeight } = useWindowDimensions();
  const ref = useRef<ViewRef>(null);
  const seen = useSeenOnce(ref);
  const location = useLocationStore((s) => s.location);
  const [photo, setPhoto] = useState(0);
  const photosRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const held = useRef(false);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
  }, []);

  const modeParam = bookingTypeParam(mode);
  const anywhere = anywhereInCityLine(vendor, mode);
  const href = modeParam ? `/garage/${vendor.id}?mode=${modeParam}` : `/garage/${vendor.id}`;
  const photos = vendor.photos;
  const stars = hasStarScore(vendor);
  // Google's rating while it is the main one (21 Nov 2026), as the web card:
  // the G, and "Google Maps" under the figures; the NEW tag stays.
  const google = mainGoogleRating(vendor);
  const km = vendor.distanceKm;
  const approx = approxDistance ?? isApproximate(location);
  const now = useMinute();
  const status = openStatus(vendor.openingHours, now, vendor.closures);
  const hoursLeft = hoursLeftShare(vendor.openingHours, now, vendor.closures);
  const knownFor = vendor.knownFor?.label;
  const what = knownFor ? t('Known for {what}', { what: knownFor.toLowerCase() }) : vendor.serviceTags.slice(0, 2).join(', ');
  const subline = [vendor.area, what].filter(Boolean).join(' · ');

  const rating = useCountUp(vendor.rating, 1, seen);
  const distanceValue = km === null ? null : km < 1 ? Math.round(km * 1000) : km;
  const distance = useCountUp(distanceValue ?? 0, km !== null && km < 1 ? 0 : 1, seen);
  const price = useCountUp(vendor.startingPrice, 0, seen);

  const cardWidth = screen - 32;
  const drift =
    scrollY && top !== undefined && !reduce
      ? scrollY.interpolate({
          // The card's middle at the screen's middle is no drift; ±16 at its edges.
          inputRange: [top + PHOTO_HEIGHT / 2 - screenHeight, top + PHOTO_HEIGHT / 2],
          outputRange: [DRIFT, -DRIFT],
          extrapolate: 'clamp',
        })
      : 0;

  const onPhotos = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / cardWidth);
    if (index !== photo) setPhoto(Math.max(0, Math.min(photos.length - 1, index)));
  };

  // One plain line for screen readers, in place of the figures that count.
  const spoken = [
    google
      ? googleRatingSpoken(google)
      : stars
        ? t('{rating} stars, {count} reviews.', { rating: vendor.rating.toFixed(1), count: vendor.reviewCount })
        : `${t(NEW_GARAGE_LABEL)}.`,
    km !== null ? `${distanceLabel(km, approx)} · ${driveTimeLabel(km)}.` : null,
    vendor.startingPrice > 0 ? t('From ₹{price}.', { price: vendor.startingPrice }) : null,
  ]
    .filter(Boolean)
    .join(' ');
  const statusWords = status
    ? `${status.isOpen ? t('Open') : status.closedToday ? t('Closed today') : t('Closed')}${status.detail ? ` · ${status.detail}` : ''}`
    : null;

  return (
    <Edge ref={ref} radius={22} innerStyle={styles.clip}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={[vendor.name, subline, statusWords, spoken].filter(Boolean).join('. ')}
        accessibilityHint={onQuickLook ? t('Press and hold for a quick look') : undefined}
        // The garage page starts loading once a finger rests on the card. Not the instant
        // it lands: a flick that starts on a card cancels the press within a few frames,
        // and used to send three garage requests per flick into the list's own loading.
        onPressIn={() => {
          held.current = false;
          if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
          prefetchTimer.current = setTimeout(() => void prefetchGarage(queryClient, vendor.id), PREFETCH_AFTER_MS);
        }}
        onPressOut={() => {
          if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
          prefetchTimer.current = null;
        }}
        delayLongPress={HOLD_MS}
        onLongPress={
          onQuickLook
            ? () => {
                held.current = true;
                buzz();
                onQuickLook(vendor);
              }
            : undefined
        }
        onPress={() => {
          if (held.current) return;
          // A quick tap ends before the timer: load it now, alongside the push.
          void prefetchGarage(queryClient, vendor.id);
          router.push(href as Href);
        }}
        style={({ pressed }) => [pressed && !reduce && styles.holding]}
      >
        <View style={styles.photo}>
          {photos.length > 0 ? (
            <ScrollView
              ref={photosRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onPhotos}
              scrollEnabled={photos.length > 1}
            >
              {photos.map((src, i) => (
                <View key={src} style={[styles.slide, { width: cardWidth }]}>
                  {/* Only the photo showing and the next one are loaded: a card with eight
                      photos used to decode all eight as the list went by. */}
                  {i <= photo + 1 ? (
                  <Animated.Image
                    source={{ uri: src }}
                    accessibilityIgnoresInvertColors
                    accessibilityLabel={i === 0 ? vendor.name : undefined}
                    resizeMode="cover"
                    style={[styles.photoImage, { width: cardWidth, transform: [{ translateY: drift }] }]}
                  />
                  ) : null}
                </View>
              ))}
            </ScrollView>
          ) : (
            // No photo on file: the garage's own designed cover, never stock imagery.
            <GarageCover vendor={vendor} showMeta={false} />
          )}
          <LinearGradient
            pointerEvents="none"
            colors={[fx.photoShade[0], fx.photoShade[1], fx.photoShade[1], 'rgba(10,10,12,0.55)', fx.photoShade[2]]}
            locations={[0, 0.3, 0.46, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />

          {status ? (
            <Glass pointerEvents="none" radius={999} base="rgba(18,18,22,0.55)" style={styles.status}>
              <HoursRing share={status.isOpen ? hoursLeft : null} play={seen} />
              <T variant="t4" numberOfLines={1} color="#FFFFFF" style={styles.shrink}>
                {status.isOpen ? t('Open') : status.closedToday ? t('Closed today') : t('Closed')}
                {status.detail ? <T variant="t4" color="rgba(255,255,255,0.75)">{` · ${status.detail}`}</T> : null}
              </T>
            </Glass>
          ) : null}

          <View pointerEvents="none" style={styles.nameBlock}>
            {vendor.logoUrl ? (
              <View style={styles.logo}>
                <Image source={{ uri: vendor.logoUrl }} resizeMode="cover" style={styles.fill} />
              </View>
            ) : (
              <GarageMonogram vendor={vendor} size={42} radius={12} fontSize={14} />
            )}
            <View style={styles.flex}>
              <View style={styles.nameRow}>
                <T variant="t2" numberOfLines={1} color="#FFFFFF" style={styles.shrink}>
                  {vendor.name}
                </T>
                {vendor.tier ? <TierMark tier={vendor.tier} /> : null}
                {!stars ? (
                  <Pearl radius={6} style={styles.newTag}>
                    <T size={9.5} weight={600} lh={10} tracking={0.08} uppercase color={ink}>
                      {t('New')}
                    </T>
                  </Pearl>
                ) : null}
              </View>
              {subline ? (
                <T variant="t4" numberOfLines={1} color="rgba(255,255,255,0.72)">
                  {subline}
                </T>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.facts}>
          {km !== null ? <RoadLine play={seen} delay={0} style={styles.road} /> : null}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.factRow}>
            {google ? (
              <Fact first>
                <View style={styles.figureRow}>
                  <GoogleMark size={14} />
                  <T num size={16} weight={600} lh={20}>
                    {google.rating.toFixed(1)}
                  </T>
                </View>
                <T variant="t5" numberOfLines={1} color={fx.quiet}>
                  {tn(google.reviewCount, '{count} review', '{count} reviews')}
                </T>
              </Fact>
            ) : stars ? (
              <Fact first>
                <View style={styles.figureRow}>
                  <DetlioMark size={15} rating={vendor.rating} />
                  <T num size={16} weight={600} lh={20}>
                    {rating}
                  </T>
                </View>
                <T variant="t5" numberOfLines={1} color={fx.quiet}>
                  {tn(vendor.reviewCount, '{count} review', '{count} reviews')}
                </T>
              </Fact>
            ) : null}
            {km !== null ? (
              <Fact first={!stars && !google}>
                <T num size={16} weight={600} lh={20} numberOfLines={1}>
                  {`${approx ? '~' : ''}${distance} ${km < 1 ? 'm' : 'km'}`}
                </T>
                <T variant="t5" numberOfLines={1} color={fx.quiet}>
                  {t('{driveTimeLabel} drive', { driveTimeLabel: driveTimeLabel(km) })}
                </T>
              </Fact>
            ) : null}
            {vendor.startingPrice > 0 ? (
              <Fact first={!stars && !google && km === null}>
                <T num size={16} weight={600} lh={20} numberOfLines={1}>
                  ₹{price}
                </T>
                <T variant="t5" numberOfLines={1} color={fx.quiet}>
                  {t('starting price')}
                </T>
              </Fact>
            ) : null}
          </View>
          <Pearl size={42}>
            <IconArrowUpRight size={18} color={ink} />
          </Pearl>
        </View>

        {/* Google's attribution, in the same card as its rating (Google's rule). */}
        {google ? (
          <View style={styles.googleMaps}>
            <GoogleMapsText />
          </View>
        ) : null}

        {chips || anywhere || townTag || (mode === 'dropin' && vendor.doorstepEnabled) ? (
          <View style={styles.chips}>
            {mode === 'dropin' && vendor.doorstepEnabled ? (
              <Raised radius={999} style={styles.chip} innerStyle={styles.chipInner}>
                <IconHome size={13} color={fx.quietBright} />
                <T variant="t4" color={fx.soft}>
                  {t('Comes to you too')}
                </T>
              </Raised>
            ) : null}
            {/* "Comes anywhere in Chennai" (0069), as the web card. */}
            {anywhere ? (
              <Raised radius={999} style={styles.chip} innerStyle={styles.chipInner}>
                <IconHome size={13} color={fx.quietBright} />
                <T variant="t4" color={fx.soft}>
                  {anywhere}
                </T>
              </Raised>
            ) : null}
            {chips}
            {/* A garage in another town than the customer's city says so on its card ("Vellore · 125 km"), so
                nobody books it thinking it is round the corner; one in their city says nothing (0070). */}
            {townTag ? <OutsideCityChip text={townTag} /> : null}
          </View>
        ) : null}
      </Pressable>

      {photos.length > 1 ? (
        <View style={styles.dots}>
          {photos.map((src, i) => (
            <Pressable
              key={src}
              accessibilityRole="button"
              accessibilityLabel={t('Photo {number} of {total}', { number: i + 1, total: photos.length })}
              accessibilityState={{ selected: i === photo }}
              hitSlop={10}
              onPress={() => {
                setPhoto(i);
                photosRef.current?.scrollTo({ x: i * cardWidth, animated: !reduce });
              }}
              style={styles.dotTouch}
            >
              <View style={[styles.dot, i === photo && styles.dotOn]} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.save}>
        <SaveGarageButton vendor={vendor} glass />
      </View>

      <NextFreeRow vendor={vendor} mode={mode} visible={seen} />
    </Edge>
  );
},
// The list builds its chips element afresh on every render; whether there is one is
// what changes the card (its words follow the vendor and mode, compared here).
(prev, next) =>
  prev.vendor === next.vendor &&
  prev.mode === next.mode &&
  prev.approxDistance === next.approxDistance &&
  prev.onQuickLook === next.onQuickLook &&
  prev.scrollY === next.scrollY &&
  prev.top === next.top &&
  !!prev.chips === !!next.chips
);

/** One of the facts: a figure over its caption, the next divided by a fading line. */
function Fact({ first = false, children }: { first?: boolean; children: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  const mid = colors.scheme === 'light' ? colors.stroke : 'rgba(255,255,255,0.14)';
  return (
    <View style={[styles.fact, first && styles.factFirst]}>
      {!first ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0)', mid, 'rgba(255,255,255,0)']}
          style={styles.factLine}
        />
      ) : null}
      {children}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  clip: { overflow: 'hidden', borderRadius: 21 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  fill: { width: '100%', height: '100%' },
  holding: { transform: [{ scale: 0.97 }] },
  photo: { height: PHOTO_HEIGHT, overflow: 'hidden', backgroundColor: c.surfaceElevated },
  slide: { height: PHOTO_HEIGHT, overflow: 'hidden' },
  // Taller than the frame, so its drift never shows an edge.
  photoImage: { position: 'absolute', top: -12, height: PHOTO_HEIGHT + 24 },
  status: {
    position: 'absolute',
    left: 12,
    top: 12,
    maxWidth: '72%',
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  nameBlock: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 42,
    height: 42,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: c.surface,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  newTag: { paddingHorizontal: 6, paddingVertical: 4 },
  facts: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  road: { position: 'absolute', left: 14, right: 14, top: 0 },
  factRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch' },
  fact: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 3, paddingHorizontal: 10 },
  factFirst: { paddingLeft: 0 },
  factLine: { position: 'absolute', left: 0, top: 3, bottom: 3, width: 1 },
  figureRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  googleMaps: { flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 10, marginTop: -6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 12, marginTop: -2 },
  chip: { height: 26 },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  dots: { position: 'absolute', top: 130, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 2 },
  dotTouch: { height: 24, paddingHorizontal: 2, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { width: 16, backgroundColor: '#FFFFFF' },
  save: { position: 'absolute', right: 12, top: 12 },
}));
