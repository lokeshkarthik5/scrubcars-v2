import { useVendorSearch } from '@repo/core/api/hooks/use-vendors';
import { BOOKING_TYPE_LABELS, bookingTypeParam, parseBookingType } from '@repo/core/booking-types';
import { categoryLabel } from '@repo/core/categories';
import { atGarageListHasGarages } from '@repo/core/reach';
import { distanceAndDrive, distanceLabel, driveTimeLabel } from '@repo/core/drive-time';
import { fill, useT } from '@repo/core/i18n';
import { garageInCity, garageTown, isSmallCity, outsideCityTag } from '@repo/core/customer-city';
import { straightLineKm } from '@repo/core/map';
import { hasStarScore, NEW_GARAGE_LABEL } from '@repo/core/ratings';
import { SERVICE_CITY } from '@repo/core/service-city';
import type { BookingType, Vendor } from '@repo/core/types';
import { Glass, Pearl, usePearlInk } from '@repo/native-ui/finish';
import {
  IconArrowUpRight,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCurrentLocation,
  IconList,
  IconMap,
  IconRefresh,
  IconStarFilled,
} from '@repo/native-ui/icons';
import { Pop, PressScale, useReduceMotion } from '@repo/native-ui/motion';
import { PressRow } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish, useTheme } from '@repo/native-ui/theme';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import Constants from 'expo-constants';
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GarageCover } from '@/components/garage/cover';
import { OpenStatus } from '@/components/garage/open-status';
import { RouteArc } from '@/components/map/route-arc';
import { OutsideCityChip } from '@/components/garage/tier';
import { useNavClearance } from '@/components/hub-nav';
import { useCustomerPlace } from '@/lib/customer-place';
import { coarse, isApproximate, isCitywide, useLocationStore } from '@/lib/location';
import { mapAvailable } from '@/lib/location-picker-logic';
import { framingBounds, groupPins, hasMovedMeaningfully, pinLabel, regionToBounds, regionZoom, type LatLngBounds } from '@/lib/map-view';

const PAGE_LIMIT = 50;
// Nearby mode's reach from the customer (the list's most, 50 km). City mode uses the customer's
// city's own centre and reach (0070), as the web map does.
const CITY_RADIUS_KM = SERVICE_CITY.radiusKm;
const CARD_GAP = 12;

const boundsToParam = (b: LatLngBounds) => `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`;
const hasPin = (v: Vendor): v is Vendor & { lat: number; lng: number } => v.lat !== null && v.lng !== null;

/**
 * The map card. THE one approved difference from the web: the whole photo always shows,
 * 150 px tall, contain over a soft blurred copy of the same photo, so a car never loses its
 * roof or wheels. The blur reads lighter in the light theme. Otherwise the web's card (§4):
 * glass, the chosen one full size with a lit edge, the others a step back so the next peeks.
 */
function MapVendorCard({
  vendor,
  selected,
  mode,
  width,
  onChoose,
}: {
  vendor: Vendor;
  selected: boolean;
  mode: BookingType;
  width: number;
  onChoose: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const ink = usePearlInk();
  const reduce = useReduceMotion();
  const approx = useLocationStore((s) => isApproximate(s.location));
  const modeParam = bookingTypeParam(mode);
  const distance = vendor.distanceKm !== null ? distanceAndDrive(vendor.distanceKm, approx) : null;
  // A garage in another town than the customer's city names its town; the km is the card's own
  // distance beside it. One in their city says nothing (0070), as on the web.
  const { place } = useCustomerPlace();
  const townTag = garageInCity(vendor, place.city) ? null : (garageTown(vendor, place.city) ?? outsideCityTag(vendor, place));
  const badge = mode === 'pickup' ? t(BOOKING_TYPE_LABELS.pickup) : vendor.doorstepEnabled ? t(BOOKING_TYPE_LABELS.doorstep) : null;
  const photo = vendor.photos[0];
  const step = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      step.setValue(selected ? 1 : 0);
      return;
    }
    Animated.timing(step, { toValue: selected ? 1 : 0, duration: 400, useNativeDriver: true }).start();
  }, [selected, reduce, step]);
  return (
    <Animated.View
      style={{
        width,
        opacity: step.interpolate({ inputRange: [0, 1], outputRange: [0.66, 1] }),
        transform: [{ scale: step.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] }) }],
      }}
    >
      <PressRow
        accessibilityLabel={vendor.name}
        accessibilityState={{ selected }}
        // A tap on a card at the side picks it first; a tap on the chosen one opens the garage.
        onPress={() => {
          if (!selected) onChoose();
          else router.push((modeParam ? `/garage/${vendor.id}?mode=${modeParam}` : `/garage/${vendor.id}`) as Href);
        }}
      >
        <Glass radius={24} style={[styles.card, selected && { borderColor: colors.scheme === 'light' ? colors.outlineStrong : 'rgba(255,255,255,0.34)' }]}>
          <View style={styles.cardPhoto}>
            {photo ? (
              <>
                <Image source={{ uri: photo }} blurRadius={24} resizeMode="cover" style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.photoWash }]} />
                <Image source={{ uri: photo }} accessibilityIgnoresInvertColors resizeMode="contain" style={StyleSheet.absoluteFill} />
              </>
            ) : (
              <GarageCover vendor={vendor} size="compact" showMeta={false} />
            )}
            <View style={styles.cardOpen}>
              <OpenStatus hours={vendor.openingHours} closures={vendor.closures} variant="overlay" />
            </View>
            {badge ? (
              <Glass radius={999} style={styles.cardBadge}>
                <T variant="t5" weight={600}>
                  {badge}
                </T>
              </Glass>
            ) : null}
            <Pearl size={36} style={styles.cardGo}>
              <IconArrowUpRight size={18} color={ink} />
            </Pearl>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardName}>
              <T variant="t2" numberOfLines={1} style={styles.flex}>
                {vendor.name}
              </T>
              {hasStarScore(vendor) ? (
                <View style={styles.cardRating}>
                  <IconStarFilled size={11} color={colors.warningFill} />
                  <T num variant="t5" weight={600}>
                    {vendor.rating.toFixed(1)}
                  </T>
                  <T variant="t5" color={colors.textSecondary}>
                    ({vendor.reviewCount})
                  </T>
                </View>
              ) : (
                <T variant="t5" style={styles.cardNew}>
                  {t(NEW_GARAGE_LABEL)}
                </T>
              )}
            </View>
            {vendor.serviceTags.length > 0 ? (
              <T variant="t4" weight={400} numberOfLines={1} color={colors.textSecondary}>
                {vendor.serviceTags.map(categoryLabel).join(' · ')}
              </T>
            ) : null}
            {townTag ? (
              <View style={styles.cardOutside}>
                <View style={styles.shrink}>
                  <OutsideCityChip text={townTag} />
                </View>
                {distance ? (
                  <T num variant="t5" weight={400} color={colors.textSecondary}>
                    {distance}
                  </T>
                ) : null}
              </View>
            ) : (
              <T variant="t5" weight={400} numberOfLines={1} color={colors.textSecondary}>
                <Figures text={[vendor.area, distance].filter(Boolean).join(' · ')} size={11} lh={15} color={colors.textSecondary} />
              </T>
            )}
            {vendor.startingPrice > 0 ? (
              <T variant="t4" weight={400} color={colors.textSecondary} style={styles.cardPrice}>
                {fill(t('{price} onwards'), {
                  price: (
                    <T num size={17} weight={600} lh={22}>
                      ₹{vendor.startingPrice}
                    </T>
                  ),
                })}
              </T>
            ) : null}
          </View>
        </Glass>
      </PressRow>
    </Animated.View>
  );
}

/** Unchosen: its short name over its starting price on a small glass label, a tail on the spot. */
function Pin({ vendor }: { vendor: Vendor }) {
  const styles = useStyles();
  const light = useColors().scheme === 'light';
  const ink = light ? undefined : '#FFFFFF';
  return (
    <View style={styles.pin}>
      <View style={[styles.pinTail, light && styles.pinTailLight]} />
      <Glass radius={12} style={styles.pinBody}>
        <T variant="t5" weight={600} numberOfLines={1} color={ink}>
          {pinLabel(vendor.name)}
        </T>
        {vendor.startingPrice > 0 ? (
          <T num variant="t4" weight={600} color={ink}>
            ₹{vendor.startingPrice}
          </T>
        ) : null}
      </Glass>
    </View>
  );
}

/**
 * Chosen: the premium marker (§4): a crisp red dot ringed in white on the spot itself, with
 * a two-line glass label above it, the name over "₹price · km · ~min" (the drive time by the
 * list's own rule). The dot pops once with a ripple as the route lands; it never pulses on.
 */
function ChosenPin({ vendor }: { vendor: Vendor }) {
  const styles = useStyles();
  const light = useColors().scheme === 'light';
  const facts = [
    vendor.startingPrice > 0 ? `₹${vendor.startingPrice}` : null,
    vendor.distanceKm !== null ? distanceLabel(vendor.distanceKm) : null,
    vendor.distanceKm !== null ? driveTimeLabel(vendor.distanceKm) : null,
  ].filter(Boolean);
  return (
    <View style={styles.chosen}>
      <Pop delay={560}>
        <Glass radius={14} style={styles.chosenLabel}>
          <T variant="t4" weight={600} numberOfLines={1} color={light ? undefined : '#FFFFFF'}>
            {pinLabel(vendor.name, 24)}
          </T>
          {facts.length > 0 ? (
            <T num size={11.5} weight={500} lh={15} color={light ? undefined : 'rgba(255,255,255,0.72)'}>
              {facts.join(' · ')}
            </T>
          ) : null}
        </Glass>
      </Pop>
      <Pop delay={470} style={styles.chosenDotBox}>
        <Ripple />
        <View style={styles.chosenDot} />
      </Pop>
    </View>
  );
}

/** One ripple running out from the chosen dot as it lands. */
function Ripple() {
  const styles = useStyles();
  const reduce = useReduceMotion();
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.timing(p, { toValue: 1, duration: 620, delay: 500, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [reduce, p]);
  if (reduce) return null;
  return (
    <Animated.View
      style={[
        styles.ripple,
        {
          opacity: p.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 0.95, 0] }),
          transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.3] }) }],
        },
      ]}
    />
  );
}

/** A row of the pull-up list: photo, name, area, and how far, how long, how much. */
function MapListRow({ vendor, selected, onChoose }: { vendor: Vendor; selected: boolean; onChoose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const approx = useLocationStore((s) => isApproximate(s.location));
  const km = vendor.distanceKm;
  return (
    <PressRow
      accessibilityLabel={vendor.name}
      accessibilityState={{ selected }}
      onPress={onChoose}
      style={[styles.listRow, selected ? styles.listRowOn : null]}
    >
      <View style={styles.listPhoto}>
        {vendor.photos[0] ? (
          <Image source={{ uri: vendor.photos[0] }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <GarageCover vendor={vendor} size="compact" showMeta={false} />
        )}
      </View>
      <View style={styles.flex}>
        <T variant="t3" weight={600} numberOfLines={1}>
          {vendor.name}
        </T>
        <T variant="t4" weight={400} numberOfLines={1} color={colors.textSecondary}>
          {[vendor.area, hasStarScore(vendor) ? `★ ${vendor.rating.toFixed(1)}` : t(NEW_GARAGE_LABEL)].filter(Boolean).join(' · ')}
        </T>
      </View>
      <View style={styles.listFacts}>
        {km !== null ? (
          <>
            <T num size={16} weight={600} lh={20}>
              {distanceLabel(km, approx)}
            </T>
            <T variant="t5" weight={400} color={colors.textSecondary}>
              {driveTimeLabel(km)}
            </T>
          </>
        ) : null}
        {vendor.startingPrice > 0 ? (
          <T num variant="t4" weight={600}>
            ₹{vendor.startingPrice}
          </T>
        ) : null}
      </View>
    </PressRow>
  );
}

/** apps/users/app/map/page.tsx on react-native-maps: Apple Maps on iOS, Google on Android. */
export default function MapScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { scheme } = useTheme();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const clearance = useNavClearance();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ bookingType?: string; category?: string }>();
  const bookingType = parseBookingType(params.bookingType) ?? 'dropin';
  const category = params.category ?? undefined;

  const location = useLocationStore((s) => s.location);
  const locating = useLocationStore((s) => s.locating);
  const requestGpsLocation = useLocationStore((s) => s.requestGpsLocation);
  const origin = !location || isCitywide(location) ? undefined : coarse(location);
  const { city: myCity } = useCustomerPlace();
  const small = isSmallCity(myCity);

  const [areaBounds, setAreaBounds] = useState<LatLngBounds | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [baseline, setBaseline] = useState<LatLngBounds | null>(null);
  const [recentred, setRecentred] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  /** The pull-up list of every garage on the map (List, or "N garages near you"). */
  const [listOpen, setListOpen] = useState(false);
  /** Whether the chosen pin's pop is still playing, so its marker keeps redrawing. */
  const [popping, setPopping] = useState(false);
  const mapRef = useRef<ComponentRef<typeof MapView>>(null);
  const cardsRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollingToCard = useRef(false);
  // Until when a move of the map is the app's own: the opening view, a fit, a bubble zooming.
  const appMovesUntil = useRef(Date.now() + 2000);

  const nearby = origin !== undefined && areaBounds === null;
  const city = origin === undefined && areaBounds === null;

  const { vendors: found, radiusKm, reach, isLoading } = useVendorSearch({
    bookingType,
    category,
    bbox: areaBounds ? boundsToParam(areaBounds) : undefined,
    lat: origin?.lat,
    lng: origin?.lng,
    // City mode: the server leaves out garages over 150 km from the city's centre (0070).
    ...(city ? { cityLat: myCity.centre.lat, cityLng: myCity.centre.lng } : {}),
    radiusKm: nearby ? CITY_RADIUS_KM : undefined,
    sort: origin ? 'distance' : 'relevance',
    includeUnlocated: false,
    limit: PAGE_LIMIT,
  });

  const vendors = useMemo(() => {
    if (!city) return found;
    return found
      .filter(hasPin)
      .map((vendor) => ({ vendor, km: straightLineKm(myCity.centre, vendor) }))
      .filter(({ km }) => km <= myCity.reachKm)
      .sort((a, b) => a.km - b.km)
      .map(({ vendor }) => vendor);
  }, [city, found, myCity]);

  const selectedId = chosenId && vendors.some((v) => v.id === chosenId) ? chosenId : (vendors[0]?.id ?? null);
  const selectedIndex = vendors.findIndex((v) => v.id === selectedId);
  const pins = useMemo(() => vendors.filter(hasPin), [vendors]);
  const cardWidth = Math.min(width * 0.78, 288);
  const sidePad = Math.max(16, (width - cardWidth) / 2);

  // What the map frames once results land: once per origin, or per "Centre on my location".
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading) return;
    let key: string | null = null;
    let target: LatLngBounds | null = null;
    if (nearby && origin) {
      key = `nearby:${origin.lat},${origin.lng}:${recentred}`;
      target = pins.length > 0 ? framingBounds([origin, ...pins], 3) : framingBounds([origin], 12);
    } else if (city && pins.length > 0) {
      key = `city:${myCity.id}`;
      target = framingBounds(pins, 3);
    }
    if (!key || !target || fitted.current === key) return;
    fitted.current = key;
    appMovesUntil.current = Date.now() + 1500;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: target.minLat, longitude: target.minLng },
        { latitude: target.maxLat, longitude: target.maxLng },
      ],
      { edgePadding: { top: insets.top + 110, bottom: clearance + 300, left: 73, right: 73 }, animated: true }
    );
  }, [isLoading, nearby, city, origin, pins, recentred, insets.top, clearance]);

  const moved = hasMovedMeaningfully(region ? regionToBounds(region) : null, baseline);
  const zoom = region ? regionZoom(region, width) : 11;
  const groups = useMemo(() => {
    const chosen = pins.find((p) => p.id === selectedId);
    const groupsOf = groupPins(pins.filter((p) => p.id !== selectedId), zoom);
    return { chosen, groups: groupsOf };
  }, [pins, selectedId, zoom]);

  // The chosen pin redraws while its pop plays (Android draws a marker's view once).
  useEffect(() => {
    if (!selectedId) return;
    setPopping(true);
    const timer = setTimeout(() => setPopping(false), 1300);
    return () => clearTimeout(timer);
  }, [selectedId]);

  const choose = (vendor: Vendor) => {
    setChosenId(vendor.id);
    const index = vendors.findIndex((v) => v.id === vendor.id);
    scrollingToCard.current = true;
    cardsRef.current?.scrollTo({ x: index * (cardWidth + CARD_GAP), animated: !reduce });
    setTimeout(() => {
      scrollingToCard.current = false;
    }, 500);
    // The map keeps its zoom; a pin off screen is glided into view (560ms), never flown to.
    if (hasPin(vendor) && region) {
      const b = regionToBounds(region);
      const inView = vendor.lat > b.minLat && vendor.lat < b.maxLat && vendor.lng > b.minLng && vendor.lng < b.maxLng;
      if (!inView) {
        appMovesUntil.current = Date.now() + 900;
        mapRef.current?.animateCamera({ center: { latitude: vendor.lat, longitude: vendor.lng } }, { duration: reduce ? 0 : 560 });
      }
    }
  };

  /** The pager and the strip's edges: the next or the previous card. */
  const step = (by: 1 | -1) => {
    const next = vendors[selectedIndex + by];
    if (next) choose(next);
  };

  const onCardsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (scrollingToCard.current) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + CARD_GAP));
    const vendor = vendors[Math.max(0, Math.min(vendors.length - 1, index))];
    if (vendor && vendor.id !== selectedId) setChosenId(vendor.id);
  };

  const centreOnMe = async () => {
    const fix = await requestGpsLocation();
    if (!fix) return;
    setAreaBounds(null);
    setRecentred((n) => n + 1);
  };

  const searchThisArea = () => {
    if (!region) return;
    const bounds = regionToBounds(region);
    setAreaBounds(bounds);
    setBaseline(bounds);
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/home' as Href));

  const mapShown = mapAvailable(Platform.OS, Constants.expoConfig?.android?.config?.googleMaps?.apiKey);
  // Opens on the customer's city's centre while there is no place (0070).
  const center = location ? { latitude: location.lat, longitude: location.lng } : { latitude: myCity.centre.lat, longitude: myCity.centre.lng };
  const chosen = vendors.find((v) => v.id === selectedId);
  const light = scheme === 'light';
  const ink = light ? colors.textPrimary : '#FFFFFF';

  return (
    <View style={styles.page}>
      {mapShown ? <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={scheme}
        showsCompass={false}
        showsPointsOfInterests={false}
        // North up and flat, so the route's arc (drawn in map coordinates) rises up the screen.
        pitchEnabled={false}
        rotateEnabled={false}
        initialRegion={{ ...center, latitudeDelta: 0.5, longitudeDelta: 0.5 }}
        onRegionChangeComplete={(next) => {
          setRegion(next);
          // The app put the map here: nothing new to search from this view.
          if (Date.now() < appMovesUntil.current) setBaseline(regionToBounds(next));
        }}
      >
        {/* The route from the customer to the chosen garage, drawn once each time one is chosen. */}
        <RouteArc
          from={origin}
          to={chosen && hasPin(chosen) ? { lat: chosen.lat, lng: chosen.lng } : null}
          pxPerLng={region ? width / region.longitudeDelta : 0}
        />
        {origin ? (
          <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} anchor={{ x: 0.5, y: 0.5 }} accessibilityLabel={t('You')}>
            <View style={styles.meHalo}>
              <View style={styles.meDot} />
            </View>
          </Marker>
        ) : null}
        {groups.groups.map((group) =>
          group.members.length === 1 ? (
            <Marker
              key={`${group.key}-${scheme}`}
              coordinate={{ latitude: group.members[0].lat, longitude: group.members[0].lng }}
              anchor={{ x: 0.5, y: 1 }}
              accessibilityLabel={
                group.members[0].startingPrice > 0
                  ? t('{name}, from ₹{price}', { name: group.members[0].name, price: group.members[0].startingPrice })
                  : group.members[0].name
              }
              onPress={() => choose(group.members[0])}
            >
              <Pin vendor={group.members[0]} />
            </Marker>
          ) : (
            <Marker
              key={`${group.key}-${scheme}`}
              coordinate={{ latitude: group.lat, longitude: group.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              accessibilityLabel={t('{count} garages here. Zoom in', { count: group.members.length })}
              onPress={() => {
                appMovesUntil.current = Date.now() + 1500;
                mapRef.current?.fitToCoordinates(
                  group.members.map((m) => ({ latitude: m.lat, longitude: m.lng })),
                  { edgePadding: { top: insets.top + 110, bottom: clearance + 300, left: 73, right: 73 }, animated: true }
                );
              }}
            >
              <View style={styles.bubble}>
                <T num size={15} weight={700} lh={20} color={colors.pinText}>
                  {group.members.length}
                </T>
              </View>
            </Marker>
          )
        )}
        {groups.chosen ? (
          <Marker
            key={`chosen-${groups.chosen.id}-${scheme}`}
            coordinate={{ latitude: groups.chosen.lat, longitude: groups.chosen.lng }}
            // The dot's middle is the spot.
            anchor={{ x: 0.5, y: 0.95 }}
            zIndex={10}
            tracksViewChanges={popping}
            accessibilityLabel={groups.chosen.name}
          >
            <ChosenPin vendor={groups.chosen} />
          </Marker>
        ) : null}
      </MapView> : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.noMap]}>
          <T size={13} lh={18} align="center" color={colors.textSecondary}>
            {t("The map isn't available in this version of the app. Garages near you are listed here.")}
          </T>
        </View>
      )}

      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 8 }]}>
        {/* The glass top bar: Back, the pull-up list, and Centre on my location. */}
        <View pointerEvents="box-none" style={styles.top}>
          <RoundButton label={t('Back')} onPress={goBack}>
            <IconChevronLeft size={20} color={ink} />
          </RoundButton>
          <View pointerEvents="box-none" style={styles.topRight}>
            <PressScale
              accessibilityRole="button"
              disabled={vendors.length === 0}
              onPress={() => setListOpen(true)}
              style={vendors.length === 0 && styles.dim}
            >
              <Glass radius={999} style={styles.list}>
                <IconList size={16} color={ink} />
                <T variant="t4" weight={600} color={ink}>
                  {t('List')}
                </T>
              </Glass>
            </PressScale>
            <RoundButton label={t('Centre on my location')} disabled={locating} onPress={() => void centreOnMe()}>
              <IconCurrentLocation size={18} color={ink} />
            </RoundButton>
          </View>
        </View>

        {moved ? (
          <View pointerEvents="box-none" style={styles.moved}>
            {/* White, not red: the map's one red is the chosen garage's pin. */}
            <PressRow onPress={searchThisArea} style={styles.searchArea}>
              <IconRefresh size={15} color={colors.chosenText} />
              <T variant="t4" weight={600} color={colors.chosenText}>
                {t('Search this area')}
              </T>
            </PressRow>
          </View>
        ) : null}

        <View pointerEvents="box-none" style={[styles.results, { paddingBottom: clearance - 8 }]}>
          {isLoading ? (
            <T variant="t5" weight={400} align="center" color={colors.textSecondary}>
              {nearby ? t('Finding garages near you…') : t('Looking in this area…')}
            </T>
          ) : vendors.length === 0 ? (
            <Glass radius={22} style={styles.empty}>
              <T variant="t4" weight={400} align="center" color={colors.textSecondary}>
                {bookingType === 'pickup'
                  ? t('No garages pick up near you yet — try At garage or Doorstep.')
                  : bookingType === 'doorstep'
                    ? t('No garages travel to this area yet.')
                    : nearby && radiusKm !== null
                      ? t('No garages within {km} km of you yet.', { km: radiusKm })
                      : t('No garages in this area. Try zooming out or moving the map.')}
              </T>
              {/* The list has the garages further away, but not those over 150 km (0070):
                  offered only when the At garage count says it has any. */}
              {nearby && bookingType === 'dropin' && atGarageListHasGarages(reach) ? (
                <Pressable accessibilityRole="link" onPress={() => router.navigate('/garages' as Href)} style={styles.seeAll}>
                  <T variant="t4" weight={600} style={styles.underline}>
                    {t('See all garages')}
                  </T>
                </Pressable>
              ) : null}
            </Glass>
          ) : (
            <>
              {/* Above the strip: the pull-up list, and where in the strip the chosen card is. */}
              <View pointerEvents="box-none" style={styles.pagerRow}>
                <PressScale accessibilityRole="button" onPress={() => setListOpen(true)}>
                  <Glass radius={999} style={styles.pullUp}>
                    <IconChevronUp size={18} color={ink} />
                    {/* A small city counts nothing (0070): just the list. */}
                    {small ? (
                      <T variant="t4" weight={600} color={ink}>
                        {t('Garages here')}
                      </T>
                    ) : (
                      <T variant="t4" weight={600} color={ink}>
                        <T num variant="t4" weight={600} color={ink}>
                          {vendors.length}
                        </T>{' '}
                        {nearby
                          ? vendors.length === 1
                            ? t('garage near you')
                            : t('garages near you')
                          : vendors.length === 1
                            ? t('garage here')
                            : t('garages here')}
                      </T>
                    )}
                  </Glass>
                </PressScale>
                {vendors.length > 1 ? (
                  <Glass radius={999} style={styles.pager}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('Previous garage')}
                      disabled={selectedIndex <= 0}
                      onPress={() => step(-1)}
                      hitSlop={7}
                      style={[styles.pagerStep, selectedIndex <= 0 && styles.faint]}
                    >
                      <IconChevronLeft size={17} color={ink} />
                    </Pressable>
                    <T accessibilityLiveRegion="polite" variant="t4" weight={600} color={ink} style={styles.pagerText}>
                      {fill(t('{number} of {total}'), {
                        number: (
                          <T num variant="t4" weight={600} color={ink}>
                            {selectedIndex + 1}
                          </T>
                        ),
                        total: (
                          <T num variant="t4" weight={600} color={ink}>
                            {vendors.length}
                          </T>
                        ),
                      })}
                    </T>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('Next garage')}
                      disabled={selectedIndex >= vendors.length - 1}
                      onPress={() => step(1)}
                      hitSlop={7}
                      style={[styles.pagerStep, selectedIndex >= vendors.length - 1 && styles.faint]}
                    >
                      <IconChevronRight size={17} color={ink} />
                    </Pressable>
                  </Glass>
                ) : null}
              </View>
              <View>
                <ScrollView
                  ref={cardsRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={cardWidth + CARD_GAP}
                  snapToAlignment="start"
                  onMomentumScrollEnd={onCardsScroll}
                  onScrollEndDrag={onCardsScroll}
                  contentContainerStyle={{ gap: CARD_GAP, paddingHorizontal: sidePad, paddingVertical: 10 }}
                >
                  {vendors.map((vendor) => (
                    <MapVendorCard
                      key={vendor.id}
                      vendor={vendor}
                      selected={vendor.id === selectedId}
                      mode={bookingType}
                      width={cardWidth}
                      onChoose={() => choose(vendor)}
                    />
                  ))}
                </ScrollView>
                {/* The strip's edges: a step to the card either side. */}
                {selectedIndex > 0 ? <EdgeButton side="prev" onPress={() => step(-1)} ink={ink} /> : null}
                {selectedIndex >= 0 && selectedIndex < vendors.length - 1 ? <EdgeButton side="next" onPress={() => step(1)} ink={ink} /> : null}
              </View>
              {vendors.length === PAGE_LIMIT ? (
                <T variant="t5" weight={400} align="center" color={colors.textMuted}>
                  {nearby ? t('Showing the nearest {count}.', { count: PAGE_LIMIT }) : t('Showing the first {count} — zoom in to narrow it down.', { count: PAGE_LIMIT })}
                </T>
              ) : null}
            </>
          )}
        </View>
      </View>

      <ScSheet open={listOpen} onClose={() => setListOpen(false)} accessibilityLabel={t('Garages on the map')} horizontalPadding={10}>
        <View style={styles.sheetHead}>
          <View style={styles.flex}>
            <T variant="t2" accessibilityRole="header">
              {nearby ? t('Garages near you') : t('Garages here')}
            </T>
            <T variant="t4" weight={400} color={colors.textSecondary}>
              <T num variant="t4" weight={400} color={colors.textSecondary}>
                {vendors.length}
              </T>{' '}
              {origin ? t('nearest first') : t('on the map')}
            </T>
          </View>
          <PressScale accessibilityRole="button" onPress={() => setListOpen(false)}>
            <Glass radius={999} style={styles.pullUp}>
              <IconMap size={16} color={ink} />
              <T variant="t4" weight={600} color={ink}>
                {t('Map')}
              </T>
            </Glass>
          </PressScale>
        </View>
        <View style={styles.sheetList}>
          {vendors.map((vendor) => (
            <MapListRow
              key={vendor.id}
              vendor={vendor}
              selected={vendor.id === selectedId}
              onChoose={() => {
                choose(vendor);
                setListOpen(false);
              }}
            />
          ))}
        </View>
      </ScSheet>
    </View>
  );
}

function RoundButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  const styles = useStyles();
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={disabled && styles.dim}>
      <Glass radius={22} style={styles.round}>
        {children}
      </Glass>
    </PressScale>
  );
}

/** A step to the card either side, on the strip's edge. */
function EdgeButton({ side, onPress, ink }: { side: 'prev' | 'next'; onPress: () => void; ink: string }) {
  const t = useT();
  const styles = useStyles();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={side === 'prev' ? t('Previous garage') : t('Next garage')}
      onPress={onPress}
      style={[styles.edge, side === 'prev' ? styles.edgePrev : styles.edgeNext]}
    >
      <Glass radius={19} style={styles.edgeFace}>
        {side === 'prev' ? <IconChevronLeft size={18} color={ink} /> : <IconChevronRight size={18} color={ink} />}
      </Glass>
    </PressScale>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.surface },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  dim: { opacity: 0.5 },
  faint: { opacity: 0.3 },
  underline: { textDecorationLine: 'underline' },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  list: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15 },
  round: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  moved: { marginTop: 8, alignItems: 'center' },
  searchArea: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: c.chosenBg, paddingHorizontal: 16 },
  results: { marginTop: 'auto', gap: 8 },
  empty: { marginHorizontal: 16, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16 },
  pullUp: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 9, paddingRight: 13 },
  pager: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 3 },
  pagerStep: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pagerText: { minWidth: 44, textAlign: 'center' },
  edge: { position: 'absolute', top: 72 },
  edgePrev: { left: 10 },
  edgeNext: { right: 10 },
  edgeFace: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 7 },
  // 150, up from the web's 124: the approved whole-photo card.
  cardPhoto: { height: 150, overflow: 'hidden', borderRadius: 18, backgroundColor: c.surface },
  cardOpen: { position: 'absolute', left: 8, top: 8, maxWidth: '62%' },
  cardBadge: { position: 'absolute', right: 8, top: 8, paddingHorizontal: 8, paddingVertical: 2 },
  cardGo: { position: 'absolute', right: 8, bottom: 8 },
  cardBody: { gap: 4, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 },
  cardName: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardRating: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 4 },
  cardNew: { paddingTop: 4 },
  cardOutside: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardPrice: { marginTop: 2 },
  pin: { alignItems: 'center', maxWidth: 132, paddingBottom: 6 },
  pinBody: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 4 },
  pinTail: {
    position: 'absolute',
    bottom: 1,
    width: 10,
    height: 10,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(42,42,48,0.92)',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pinTailLight: { backgroundColor: c.surface, borderColor: c.border },
  chosen: { alignItems: 'center', gap: 11, maxWidth: 240 },
  chosenLabel: { alignItems: 'center', gap: 1, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 8 },
  chosenDotBox: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  chosenDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    backgroundColor: '#E4002B',
    shadowColor: '#E4002B',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 9,
    shadowOpacity: 0.65,
  },
  ripple: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: 'rgba(255,110,128,0.95)' },
  bubble: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.pinBg, borderWidth: 4, borderColor: 'rgba(255,255,255,0.25)', shadowColor: '#0A0A0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 5 },
  noMap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  meHalo: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: c.meHalo },
  meDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.scheme === 'light' ? '#FFFFFF' : '#0A0A0B', backgroundColor: c.meDot },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 6, paddingBottom: 12, paddingTop: 4 },
  sheetList: { gap: 8 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.scheme === 'light' ? c.border : 'rgba(255,255,255,0.07)',
    backgroundColor: c.scheme === 'light' ? c.surface : 'rgba(255,255,255,0.05)',
    padding: 8,
  },
  listRowOn: { borderColor: c.scheme === 'light' ? c.outlineStrong : 'rgba(255,255,255,0.3)', backgroundColor: c.scheme === 'light' ? c.surfaceElevated : 'rgba(255,255,255,0.09)' },
  listPhoto: { width: 64, height: 64, overflow: 'hidden', borderRadius: 13, backgroundColor: c.surface },
  listFacts: { alignItems: 'flex-end', gap: 2 },
}));
