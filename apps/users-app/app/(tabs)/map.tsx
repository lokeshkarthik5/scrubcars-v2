import { useVendorSearch } from '@repo/core/api/hooks/use-vendors';
import { BOOKING_TYPE_LABELS, bookingTypeParam, parseBookingType } from '@repo/core/booking-types';
import { categoryLabel } from '@repo/core/categories';
import { distanceAndDrive } from '@repo/core/drive-time';
import { DEFAULT_CENTER, straightLineKm } from '@repo/core/map';
import { hasStarScore, NEW_GARAGE_LABEL } from '@repo/core/ratings';
import { SERVICE_CITY } from '@repo/core/service-city';
import type { BookingType, Vendor } from '@repo/core/types';
import { IconCurrentLocation, IconList, IconRefresh, IconStarFilled } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import Constants from 'expo-constants';
import { Image, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GarageCover } from '@/components/garage/cover';
import { OpenStatus } from '@/components/garage/open-status';
import { OutsideCityChip } from '@/components/garage/tier';
import { useNavClearance } from '@/components/hub-nav';
import { coarse, isApproximate, isCitywide, useLocationStore } from '@/lib/location';
import { mapAvailable } from '@/lib/location-picker-logic';
import { framingBounds, groupPins, hasMovedMeaningfully, pinLabel, regionToBounds, regionZoom, type LatLngBounds } from '@/lib/map-view';

const PAGE_LIMIT = 50;
const CITY_RADIUS_KM = SERVICE_CITY.radiusKm;
const CITY_CENTRE = SERVICE_CITY.centre;
const CARD_GAP = 12;

const boundsToParam = (b: LatLngBounds) => `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`;
const hasPin = (v: Vendor): v is Vendor & { lat: number; lng: number } => v.lat !== null && v.lng !== null;

/**
 * The map card. THE one approved difference from the web: the whole photo always shows,
 * 150 px tall, contain over a soft blurred copy of the same photo, so a car never loses its
 * roof or wheels. The blur reads lighter in the light theme.
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
  const colors = useColors();
  const styles = useStyles();
  const approx = useLocationStore((s) => isApproximate(s.location));
  const modeParam = bookingTypeParam(mode);
  const distance = vendor.distanceKm !== null ? distanceAndDrive(vendor.distanceKm, approx) : null;
  const badge = mode === 'pickup' ? BOOKING_TYPE_LABELS.pickup : vendor.doorstepEnabled ? BOOKING_TYPE_LABELS.doorstep : null;
  const photo = vendor.photos[0];
  return (
    <PressRow
      accessibilityLabel={vendor.name}
      // A tap on a card at the side picks it first; a tap on the chosen one opens the garage.
      onPress={() => {
        if (!selected) onChoose();
        else router.push((modeParam ? `/garage/${vendor.id}?mode=${modeParam}` : `/garage/${vendor.id}`) as Href);
      }}
      style={[styles.card, { width }, selected ? styles.cardOn : styles.cardOff]}
    >
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
          <View style={styles.cardBadge}>
            <T size={11} weight={600} lh={15}>
              {badge}
            </T>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardName}>
          <T size={14} weight={600} numberOfLines={1} style={styles.flex}>
            {vendor.name}
          </T>
          {hasStarScore(vendor) ? (
            <View style={styles.cardRating}>
              <IconStarFilled size={11} color={colors.warningFill} />
              <T num size={12} weight={500} lh={16}>
                {vendor.rating.toFixed(1)}
              </T>
              <T size={12} lh={16} color={colors.textSecondary}>
                ({vendor.reviewCount})
              </T>
            </View>
          ) : (
            <T size={12} weight={500} lh={16}>
              {NEW_GARAGE_LABEL}
            </T>
          )}
        </View>
        {vendor.serviceTags.length > 0 ? (
          <T size={13} lh={18} numberOfLines={1} color={colors.textSecondary}>
            {vendor.serviceTags.map(categoryLabel).join(' · ')}
          </T>
        ) : null}
        {vendor.outsideServiceCity ? (
          <View style={styles.cardOutside}>
            <View style={styles.shrink}>
              <OutsideCityChip outside={vendor.outsideServiceCity} />
            </View>
            {distance ? (
              <T num size={12} lh={16} color={colors.textSecondary}>
                {distance}
              </T>
            ) : null}
          </View>
        ) : (
          <T size={12} lh={16} numberOfLines={1} color={colors.textSecondary}>
            <Figures text={[vendor.area, distance].filter(Boolean).join(' · ')} size={12} lh={16} color={colors.textSecondary} />
          </T>
        )}
        {vendor.startingPrice > 0 ? (
          <T size={13} lh={18} color={colors.textSecondary} style={styles.cardPrice}>
            <T num size={13} weight={700} lh={18}>
              ₹{vendor.startingPrice}
            </T>{' '}
            onwards
          </T>
        ) : null}
      </View>
    </PressRow>
  );
}

function Pin({ vendor, selected }: { vendor: Vendor; selected: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const bg = selected ? colors.redFill : colors.pinBg;
  const fg = selected ? colors.white : colors.pinText;
  return (
    <View style={[styles.pin, selected && styles.pinOn]}>
      <View style={[styles.pinBody, { backgroundColor: bg }]}>
        <T size={11} weight={600} lh={14} color={fg} numberOfLines={1}>
          {pinLabel(vendor.name)}
        </T>
        {vendor.startingPrice > 0 ? (
          <T num size={13} weight={700} lh={16} color={fg}>
            ₹{vendor.startingPrice}
          </T>
        ) : null}
      </View>
      <View style={[styles.pinTail, { backgroundColor: bg }]} />
    </View>
  );
}

/** apps/users/app/map/page.tsx on react-native-maps: Apple Maps on iOS, Google on Android. */
export default function MapScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { scheme } = useTheme();
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

  const [areaBounds, setAreaBounds] = useState<LatLngBounds | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [baseline, setBaseline] = useState<LatLngBounds | null>(null);
  const [recentred, setRecentred] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const mapRef = useRef<ComponentRef<typeof MapView>>(null);
  const cardsRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollingToCard = useRef(false);
  // Until when a move of the map is the app's own: the opening view, a fit, a bubble zooming.
  const appMovesUntil = useRef(Date.now() + 2000);

  const nearby = origin !== undefined && areaBounds === null;
  const city = origin === undefined && areaBounds === null;

  const { vendors: found, radiusKm, isLoading } = useVendorSearch({
    bookingType,
    category,
    bbox: areaBounds ? boundsToParam(areaBounds) : undefined,
    lat: origin?.lat,
    lng: origin?.lng,
    radiusKm: nearby ? CITY_RADIUS_KM : undefined,
    sort: origin ? 'distance' : 'relevance',
    includeUnlocated: false,
    limit: PAGE_LIMIT,
  });

  const vendors = useMemo(() => {
    if (!city) return found;
    return found
      .filter(hasPin)
      .map((vendor) => ({ vendor, km: straightLineKm(CITY_CENTRE, vendor) }))
      .filter(({ km }) => km <= CITY_RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .map(({ vendor }) => vendor);
  }, [city, found]);

  const selectedId = chosenId && vendors.some((v) => v.id === chosenId) ? chosenId : (vendors[0]?.id ?? null);
  const pins = useMemo(() => vendors.filter(hasPin), [vendors]);
  const cardWidth = Math.min(width * 0.78, 300);
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
      key = 'city';
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
      { edgePadding: { top: insets.top + 110, bottom: clearance + 260, left: 73, right: 73 }, animated: true }
    );
  }, [isLoading, nearby, city, origin, pins, recentred, insets.top, clearance]);

  const moved = hasMovedMeaningfully(region ? regionToBounds(region) : null, baseline);
  const zoom = region ? regionZoom(region, width) : 11;
  const groups = useMemo(() => {
    const chosen = pins.find((p) => p.id === selectedId);
    const groupsOf = groupPins(pins.filter((p) => p.id !== selectedId), zoom);
    return { chosen, groups: groupsOf };
  }, [pins, selectedId, zoom]);

  const choose = (vendor: Vendor) => {
    setChosenId(vendor.id);
    const index = vendors.findIndex((v) => v.id === vendor.id);
    scrollingToCard.current = true;
    cardsRef.current?.scrollTo({ x: index * (cardWidth + CARD_GAP), animated: true });
    setTimeout(() => {
      scrollingToCard.current = false;
    }, 500);
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

  const mapShown = mapAvailable(Platform.OS, Constants.expoConfig?.android?.config?.googleMaps?.apiKey);
  const center = location ? { latitude: location.lat, longitude: location.lng } : { latitude: DEFAULT_CENTER[1], longitude: DEFAULT_CENTER[0] };

  return (
    <View style={styles.page}>
      {mapShown ? <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={scheme}
        showsCompass={false}
        showsPointsOfInterests={false}
        initialRegion={{ ...center, latitudeDelta: 0.5, longitudeDelta: 0.5 }}
        onRegionChangeComplete={(next) => {
          setRegion(next);
          // The app put the map here: nothing new to search from this view.
          if (Date.now() < appMovesUntil.current) setBaseline(regionToBounds(next));
        }}
      >
        {origin ? (
          <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} anchor={{ x: 0.5, y: 0.5 }} accessibilityLabel="You">
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
                  ? `${group.members[0].name}, from ₹${group.members[0].startingPrice}`
                  : group.members[0].name
              }
              onPress={() => choose(group.members[0])}
            >
              <Pin vendor={group.members[0]} selected={false} />
            </Marker>
          ) : (
            <Marker
              key={`${group.key}-${scheme}`}
              coordinate={{ latitude: group.lat, longitude: group.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              accessibilityLabel={`${group.members.length} garages here. Zoom in`}
              onPress={() => {
                appMovesUntil.current = Date.now() + 1500;
                mapRef.current?.fitToCoordinates(
                  group.members.map((m) => ({ latitude: m.lat, longitude: m.lng })),
                  { edgePadding: { top: insets.top + 110, bottom: clearance + 260, left: 73, right: 73 }, animated: true }
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
            anchor={{ x: 0.5, y: 1 }}
            zIndex={10}
            accessibilityLabel={groups.chosen.name}
          >
            <Pin vendor={groups.chosen} selected />
          </Marker>
        ) : null}
      </MapView> : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.noMap]}>
          <T size={13} lh={18} align="center" color={colors.textSecondary}>
            The map isn&apos;t available in this version of the app. Garages near you are listed here.
          </T>
        </View>
      )}

      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 8 }]}>
        <View pointerEvents="box-none" style={styles.top}>
          <PressRow
            onPress={() => {
              const mode = bookingTypeParam(bookingType);
              router.navigate((mode ? `/garages?mode=${mode}` : '/garages') as Href);
            }}
            style={styles.list}
          >
            <IconList size={15} stroke={2} />
            <T size={13} weight={600} lh={18}>
              List
            </T>
          </PressRow>
          <PressRow accessibilityLabel="Centre on my location" disabled={locating} onPress={() => void centreOnMe()} style={[styles.round, locating && styles.dim]}>
            <IconCurrentLocation size={18} stroke={2} />
          </PressRow>
        </View>

        {moved ? (
          <View pointerEvents="box-none" style={styles.moved}>
            <PressRow onPress={searchThisArea} style={styles.searchArea}>
              <IconRefresh size={15} stroke={2} color={colors.chosenText} />
              <T size={13} weight={600} lh={18} color={colors.chosenText}>
                Search this area
              </T>
            </PressRow>
          </View>
        ) : null}

        <View pointerEvents="box-none" style={[styles.results, { paddingBottom: clearance - 8 }]}>
          {isLoading ? (
            <T size={12} align="center" color={colors.textSecondary}>
              {nearby ? 'Finding garages near you…' : 'Looking in this area…'}
            </T>
          ) : vendors.length === 0 ? (
            <View style={styles.empty}>
              <T size={13} align="center" color={colors.textSecondary}>
                {bookingType === 'pickup'
                  ? 'No garages pick up near you yet — try At garage or Doorstep.'
                  : bookingType === 'doorstep'
                    ? 'No garages travel to this area yet.'
                    : nearby && radiusKm !== null
                      ? `No garages within ${radiusKm} km of you yet.`
                      : 'No garages in this area. Try zooming out or moving the map.'}
              </T>
              {nearby && bookingType === 'dropin' ? (
                <Pressable accessibilityRole="link" onPress={() => router.navigate('/garages' as Href)} style={styles.seeAll}>
                  <T size={13} weight={600} style={styles.underline}>
                    See all garages
                  </T>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <>
              <ScrollView
                ref={cardsRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={cardWidth + CARD_GAP}
                snapToAlignment="start"
                onMomentumScrollEnd={onCardsScroll}
                onScrollEndDrag={onCardsScroll}
                contentContainerStyle={{ gap: CARD_GAP, paddingHorizontal: sidePad, paddingVertical: 8 }}
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
              {vendors.length === PAGE_LIMIT ? (
                <T size={11} align="center" color={colors.textMuted}>
                  {nearby ? `Showing the nearest ${PAGE_LIMIT}.` : `Showing the first ${PAGE_LIMIT} — zoom in to narrow it down.`}
                </T>
              ) : null}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.surface },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  dim: { opacity: 0.5 },
  underline: { textDecorationLine: 'underline' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  list: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceElevated, paddingHorizontal: 14 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  moved: { marginTop: 8, alignItems: 'center' },
  searchArea: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: c.chosenBg, paddingHorizontal: 16 },
  results: { marginTop: 'auto', gap: 8 },
  empty: { marginHorizontal: 16, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceElevated, paddingHorizontal: 16, paddingVertical: 12 },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  card: { overflow: 'hidden', borderRadius: 16, borderWidth: 1, backgroundColor: c.scheme === 'light' ? c.surface : c.surfaceElevated },
  cardOn: { borderColor: c.outlineStrong },
  cardOff: { borderColor: c.border },
  // 150, up from the web's 112: the approved whole-photo card.
  cardPhoto: { height: 150, backgroundColor: c.surface },
  cardOpen: { position: 'absolute', left: 8, top: 8, maxWidth: '62%' },
  cardBadge: { position: 'absolute', right: 8, top: 8, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceElevated, paddingHorizontal: 8, paddingVertical: 2 },
  cardBody: { gap: 4, padding: 12 },
  cardName: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardRating: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  cardOutside: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardPrice: { marginTop: 2 },
  pin: { alignItems: 'center', maxWidth: 132, paddingBottom: 4 },
  pinOn: { transform: [{ scale: 1.1 }, { translateY: -2 }] },
  pinBody: {
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    shadowColor: '#0A0A0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
  },
  pinTail: { position: 'absolute', bottom: 0, width: 10, height: 10, transform: [{ rotate: '45deg' }], zIndex: -1 },
  bubble: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.pinBg, shadowColor: '#0A0A0B', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.28, shadowRadius: 3 },
  noMap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  meHalo: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: c.meHalo },
  meDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.scheme === 'light' ? '#FFFFFF' : '#0A0A0B', backgroundColor: c.meDot },
}));
