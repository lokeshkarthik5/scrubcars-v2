import {
  parseCoordinatePair,
  resolveMapsLink,
  resolvePlace,
  reverseGeocode,
  searchPlaces,
  type GeoPlace,
} from '@repo/core/api/geo';
import { DEFAULT_CENTER, PICKER_ZOOM } from '@repo/core/map';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { type MapPressEvent, Marker } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';

import {
  DEBOUNCE_MS,
  flyZoom,
  isSearchable,
  LINK_WARNINGS,
  linkOutcome,
  LOCATION_BLOCKED,
  LOCATION_TIMEOUT_MS,
  LOOKUP_FAILED,
  makeSessionToken,
  MAP_UNAVAILABLE_NOTE,
  mapAvailable,
  OPEN_ZOOM,
  type PickedLocation,
  regionFor,
  SEARCH_PLACEHOLDER,
  SUGGESTION_FAILED,
  suggestionsVisible,
  withTimeout,
  zoomFor,
} from '@/lib/location-picker-logic';
import { colors } from '@/lib/theme';

import { IconCurrentLocation, IconMapPin, IconSearch } from './icons';
import { RectButton } from './rect-button';
import { font, T } from './text';

export type { PickedLocation };

const MAP_HEIGHT = 224;

interface LocationPickerProps {
  /** Existing pin to open on, when editing rather than setting for the first time. */
  value?: { lat: number; lng: number } | null;
  onChange: (picked: PickedLocation) => void;
  /** Hide the search box for flows where the user is already at the address. */
  showSearch?: boolean;
  /**
   * The city the form already has. Used only to warn when a pasted link lands
   * somewhere else entirely.
   */
  expectedCity?: string;
}

/** The web's red filled IconMapPin, drawn solid so it reads on a map. */
function PinDrawing() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill={colors.brandRed} stroke={colors.brandRed} strokeWidth={2}>
      <Path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" />
    </Svg>
  );
}

/** A custom marker view is drawn once, then left alone: re-reading it every frame is slow. */
function PinMarker({
  coordinate,
  onDragEnd,
}: {
  coordinate: { latitude: number; longitude: number };
  onDragEnd: (lat: number, lng: number) => void;
}) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracking(false), 600);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Marker
      draggable
      coordinate={coordinate}
      tracksViewChanges={tracking}
      anchor={{ x: 0.5, y: 0.9 }}
      centerOffset={{ x: 0, y: -13 }}
      accessibilityLabel="Garage pin. Drag to place it exactly."
      onDragEnd={(e) => onDragEnd(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
    >
      <PinDrawing />
    </Marker>
  );
}

/**
 * Pick a precise location (packages/ui/src/features/location-picker.tsx): search to get
 * close, then tap the map or drag the pin to get it right, then reverse-geocode the final
 * pin for the address text. Without a map-provider key on the API (/geo/* answers 503)
 * search and the address line quietly do nothing, and tapping, dragging and a pasted
 * "lat, lng" still place the pin, as on the web.
 */
export function LocationPicker({ value, onChange, showSearch = true, expectedCity }: LocationPickerProps) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(value ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  /** The suggestion text currently sitting in the input, if one was picked. */
  const [committedLabel, setCommittedLabel] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  /** Non-blocking by design: a wrong kind of link is told what happened and left to carry on. */
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Where the map should recentre to, and nothing else; never set by a drag. */
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);

  // One token per picker session, so a provider that prices by session bills this whole
  // interaction once rather than once per keystroke.
  const sessionToken = useMemo(() => makeSessionToken(), []);

  // Guards against a slow earlier request overwriting a newer one's results.
  const searchSeq = useRef(0);
  const placeSeq = useRef(0);
  const locateSeq = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const mapRef = useRef<MapView>(null);
  const mapShown = mapAvailable(Platform.OS, Constants.expoConfig?.android?.config?.googleMaps?.apiKey);
  const { width: windowWidth } = useWindowDimensions();
  const mapWidth = useRef(Math.max(windowWidth - 64, 200));
  const zoom = useRef<number | null>(null);

  const initialRegion = useMemo(
    () =>
      regionFor(
        pin ?? { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] },
        pin ? PICKER_ZOOM : OPEN_ZOOM,
        mapWidth.current,
        MAP_HEIGHT
      ),
    // Read once: after that the map is the owner's to move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const trimmedQuery = query.trim();
  const queryIsSearchable = isSearchable(query);
  const showResults = suggestionsVisible(query, results.length, committedLabel);

  /**
   * Moves the pin and looks up what is there. The reverse call is what fills the address
   * fields, so it runs on every placement, a drag included: dragging 200 m down the road can
   * change the pincode.
   */
  const placePin = async (lat: number, lng: number, source: 'gps' | 'map_pin') => {
    const seq = ++placeSeq.current;
    setPin({ lat, lng });
    setError(null);
    setResults([]);
    setResolving(true);
    try {
      const place = await reverseGeocode(lat, lng);
      if (seq !== placeSeq.current) return;
      setAddress(place?.formatted ?? null);
      onChangeRef.current({
        lat,
        lng,
        address: place?.formatted ?? '',
        city: place?.city ?? '',
        pincode: place?.pincode ?? '',
        source,
      });
    } catch {
      if (seq !== placeSeq.current) return;
      // The pin is the thing that matters and we already have it. A failed lookup costs the
      // prefilled address text, not the coordinates.
      setAddress(null);
      setError(LOOKUP_FAILED);
      onChangeRef.current({ lat, lng, address: '', city: '', pincode: '', source });
    } finally {
      if (seq === placeSeq.current) setResolving(false);
    }
  };

  // Debounced search. Below the minimum length we do not call at all.
  useEffect(() => {
    if (!queryIsSearchable) return;
    // Nothing to look up for text we just wrote ourselves.
    if (trimmedQuery === committedLabel) return;

    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      // Set once the debounce has actually elapsed, so a fast typist never sees a flicker.
      setSearching(true);
      try {
        const places = await searchPlaces(trimmedQuery, pin ?? undefined, sessionToken);
        if (seq === searchSeq.current) setResults(places);
      } catch {
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `pin` is read for search bias only; re-running on every nudge would re-issue the same search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, queryIsSearchable, committedLabel, sessionToken]);

  // Recentre the map when search, the current location or a pasted point asks.
  useEffect(() => {
    if (!flyTo) return;
    const target = flyZoom(zoom.current, PICKER_ZOOM);
    mapRef.current?.animateToRegion(regionFor(flyTo, target, mapWidth.current, MAP_HEIGHT), 600);
  }, [flyTo]);

  const pickSuggestion = async (place: GeoPlace) => {
    setResults([]);
    setQuery(place.label);
    // Marks this text as ours, not typed.
    setCommittedLabel(place.label);
    setResolving(true);
    try {
      // Some providers return autocomplete rows without coordinates; `resolve` is a no-op
      // for the ones that do.
      const resolved =
        place.lat !== null && place.lng !== null
          ? place
          : place.providerPlaceId
            ? await resolvePlace(place.providerPlaceId, sessionToken)
            : place;

      if (resolved.lat === null || resolved.lng === null) {
        setError(SUGGESTION_FAILED);
        return;
      }

      setPin({ lat: resolved.lat, lng: resolved.lng });
      setFlyTo({ lat: resolved.lat, lng: resolved.lng });
      setAddress(resolved.formatted ?? place.label);
      setError(null);

      // Autocomplete predictions carry no address components, so ask the point for the
      // city and pincode: the same call a pin drop makes, so both paths fill the form alike.
      let { city, pincode } = resolved;
      if (!city || !pincode) {
        const atPoint = await reverseGeocode(resolved.lat, resolved.lng).catch(() => null);
        city = city || (atPoint?.city ?? null);
        pincode = pincode || (atPoint?.pincode ?? null);
      }

      onChangeRef.current({
        lat: resolved.lat,
        lng: resolved.lng,
        address: resolved.formatted ?? place.label,
        city: city ?? '',
        pincode: pincode ?? '',
        // A searched result is still a pin the owner is expected to check.
        source: 'map_pin',
      });
    } catch {
      setError(SUGGESTION_FAILED);
    } finally {
      setResolving(false);
    }
  };

  /**
   * Places the pin from a pasted Google Maps link, or from raw coordinates. Nothing about the
   * input is validated: a wrong kind of link produces a warning and whatever could be salvaged.
   */
  const applyLink = async () => {
    const input = linkInput.trim();
    if (!input) return;

    setLinkNotice(null);
    setError(null);

    // Raw "lat, lng" needs no round trip, and no geocoder to get it wrong.
    const pasted = parseCoordinatePair(input);
    if (pasted) {
      setFlyTo(pasted);
      void placePin(pasted.lat, pasted.lng, 'map_pin');
      return;
    }

    setLinkBusy(true);
    try {
      const outcome = linkOutcome(await resolveMapsLink(input), expectedCity);
      if (outcome.point) {
        setFlyTo(outcome.point);
        void placePin(outcome.point.lat, outcome.point.lng, 'map_pin');
      }
      setLinkNotice(outcome.notice);
    } catch {
      setLinkNotice(LINK_WARNINGS.unreachable);
    } finally {
      setLinkBusy(false);
    }
  };

  const useCurrentLocation = async () => {
    const seq = ++locateSeq.current;
    setLocating(true);
    setError(null);
    setResults([]);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('blocked');
      // Unlike browsing, this coordinate is stored permanently and drives doorstep radius
      // checks, so it is worth waiting for a real fix.
      const position = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        LOCATION_TIMEOUT_MS
      );
      if (seq !== locateSeq.current) return;
      const { latitude, longitude } = position.coords;
      setFlyTo({ lat: latitude, lng: longitude });
      void placePin(latitude, longitude, 'gps');
    } catch {
      if (seq === locateSeq.current) setError(LOCATION_BLOCKED);
    } finally {
      if (seq === locateSeq.current) setLocating(false);
    }
  };

  const onMapPress = (e: MapPressEvent) => {
    if (e.nativeEvent.action === 'marker-press') return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    void placePin(latitude, longitude, 'map_pin');
  };

  return (
    <View style={styles.root}>
      {showSearch ? (
        <View>
          <View style={styles.search}>
            <IconSearch size={17} color={colors.textSecondary} />
            <TextInput
              accessibilityLabel={SEARCH_PLACEHOLDER}
              value={query}
              onChangeText={setQuery}
              placeholder={SEARCH_PLACEHOLDER}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance="dark"
              autoCorrect={false}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {searching ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
          </View>

          {showResults ? (
            // In the column, not floating over the map as on the web: a floating list would
            // not take touches on Android once it ran past the box that holds it.
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.results}
              accessibilityLabel="Place suggestions"
            >
              {results.map((place, index) => (
                <Pressable
                  key={place.providerPlaceId ?? `${place.label}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={place.label}
                  onPress={() => void pickSuggestion(place)}
                  style={[styles.result, index > 0 && styles.resultBorder]}
                >
                  <View style={styles.resultIcon}>
                    <IconMapPin size={15} color={colors.textSecondary} />
                  </View>
                  <View style={styles.flex}>
                    <T size={13} numberOfLines={1}>
                      {place.label}
                    </T>
                    {place.formatted && place.formatted !== place.label ? (
                      <T size={11} color={colors.textSecondary} numberOfLines={1}>
                        {place.formatted}
                      </T>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      <View
        style={mapShown ? styles.mapBox : undefined}
        onLayout={(e) => {
          mapWidth.current = e.nativeEvent.layout.width;
        }}
      >
        {!mapShown ? (
          <T size={12} color={colors.textSecondary}>
            {MAP_UNAVAILABLE_NOTE}
          </T>
        ) : null}
        {mapShown ? <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          userInterfaceStyle="dark"
          rotateEnabled={false}
          pitchEnabled={false}
          showsCompass={false}
          toolbarEnabled={false}
          onPress={onMapPress}
          onRegionChangeComplete={(region) => {
            zoom.current = zoomFor(region.longitudeDelta, mapWidth.current);
          }}
        >
          {pin ? (
            <PinMarker
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              onDragEnd={(lat, lng) => void placePin(lat, lng, 'map_pin')}
            />
          ) : null}
        </MapView> : null}

        {resolving && mapShown ? (
          <View style={styles.lookup}>
            <T size={11} color={colors.textSecondary} align="center">
              Looking up this location…
            </T>
          </View>
        ) : null}
      </View>

      {/* The fallback that always works: owners can find their own garage on Google even when
          our geocoder cannot, and a long-press there gives raw coordinates that need no
          interpretation at all. */}
      <View style={styles.linkBlock}>
        <View style={styles.linkRow}>
          <TextInput
            accessibilityLabel="Google Maps link or coordinates"
            value={linkInput}
            onChangeText={setLinkInput}
            onSubmitEditing={() => void applyLink()}
            onFocus={() => setResults([])}
            placeholder="Paste Google Maps link or 13.0043, 80.2554"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance="dark"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            style={styles.linkInput}
          />
          <RectButton
            tone="secondary"
            small
            fullWidth={false}
            disabled={!linkInput.trim() || linkBusy}
            onPress={() => void applyLink()}
            style={styles.use}
          >
            {linkBusy ? 'Locating…' : 'Use'}
          </RectButton>
        </View>
        {linkNotice ? (
          <T size={11} color={colors.warning}>
            {linkNotice}
          </T>
        ) : null}
      </View>

      <RectButton tone="secondary" disabled={locating} onPress={() => void useCurrentLocation()}>
        {locating ? (
          <ActivityIndicator size="small" color={colors.brandWhite} />
        ) : (
          <IconCurrentLocation size={15} color={colors.brandWhite} />
        )}
        <T size={14} weight={600} lh={20}>
          {locating ? 'Finding you…' : 'Use my current location'}
        </T>
      </RectButton>

      {!pin ? (
        <T size={11} color={colors.textSecondary}>
          Search above, tap the map, or use your current location. Drag the pin to place it exactly.
        </T>
      ) : null}

      {address ? (
        <T size={11} color={colors.textSecondary}>
          <T size={11} color={colors.textMuted}>
            Pin is at:
          </T>{' '}
          {address}
        </T>
      ) : null}

      {error ? (
        <T accessibilityRole="alert" size={11} color={colors.error}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    minHeight: 46,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontFamily: font(400), fontSize: 13, color: colors.textPrimary },
  results: {
    maxHeight: 240,
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  resultBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  resultIcon: { marginTop: 2 },
  mapBox: {
    height: MAP_HEIGHT,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  lookup: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,20,22,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  linkBlock: { gap: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: font(400),
    fontSize: 12,
    color: colors.textPrimary,
  },
  use: { flexShrink: 0 },
});
