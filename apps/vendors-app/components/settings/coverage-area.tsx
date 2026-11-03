import { getDoorstepArea, setDoorstepArea } from '@repo/core/api/coverage';
import Constants from 'expo-constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import MapView, { type MapPressEvent, Marker, Polygon } from 'react-native-maps';

import { IconTrash } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import { RectButton } from '@/components/rect-button';
import { SectionHeader } from '@/components/rows';
import {
  addCorner,
  AREA_INTRO,
  AREA_UNAVAILABLE_NOTE,
  cornerMessage,
  cornersFromRing,
  COVERAGE_CLEARED,
  COVERAGE_SAVE_FAILED,
  type Corners,
  isArea,
  mapCoordinates,
  saveBlocked,
  saveLabel,
  savedCornerCount,
  savedStatus,
  savedToast,
  savePayload,
  undoCorner,
} from '@/lib/coverage-area';
import { errorText } from '@/lib/error-text';
import { mapAvailable, regionFor } from '@/lib/location-picker-logic';

/** The web's h-64. */
const MAP_HEIGHT = 256;
/** The web opens its map at zoom 12. */
const COVERAGE_ZOOM = 12;
/** A custom marker view is drawn once, then left alone: re-reading it every frame is slow. */
const MARKER_SETTLE_MS = 600;

/** A small round handle on the map: the web's h-2.5 w-2.5 corner dots and h-3 w-3 garage dot. */
function DotMarker({
  latitude,
  longitude,
  size,
  color,
}: {
  latitude: number;
  longitude: number;
  size: number;
  color: string;
}) {
  const [tracking, setTracking] = useState(true);
  const colors = useColors();
  useEffect(() => {
    const timer = setTimeout(() => setTracking(false), MARKER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      tracksViewChanges={tracking}
      anchor={{ x: 0.5, y: 0.5 }}
      centerOffset={{ x: 0, y: 0 }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: colors.white,
          backgroundColor: color,
        }}
      />
    </Marker>
  );
}

/**
 * Settings > Location's "Doorstep coverage area" (apps/vendors/app/settings/page.tsx with
 * packages/ui/src/features/coverage-editor.tsx): optional, drawn by tapping corners on the map,
 * saved as a closed ring that overrides the radius. Offered once the garage is pinned. Where
 * the map can't be drawn (Android with no maps key) the area can't be edited, only checked and
 * cleared back to the radius.
 */
export function CoverageArea({
  center,
  fallbackRadiusKm,
}: {
  /** The garage's own pin, so the map opens where the garage is. */
  center: { lat: number; lng: number };
  /** Shown when no area is drawn, to say what applies instead. */
  fallbackRadiusKm?: number | null;
}) {
  const colors = useColors();
  const { scheme } = useTheme();
  const styles = useStyles();
  const mapShown = mapAvailable(Platform.OS, Constants.expoConfig?.android?.config?.googleMaps?.apiKey);
  /** Corners as tapped, without the closing repeat: that is added on save. */
  const [corners, setCorners] = useState<Corners>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Corners on file, for the no-map status line. */
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    let live = true;
    getDoorstepArea()
      .then((area) => {
        if (!live) return;
        setCorners(cornersFromRing(area.ring));
        setSavedCount(savedCornerCount(area.ring));
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const { width: windowWidth } = useWindowDimensions();
  const mapWidth = useRef(Math.max(windowWidth - 64, 200));
  const initialRegion = useMemo(
    () => regionFor(center, COVERAGE_ZOOM, mapWidth.current, MAP_HEIGHT),
    // Read once: after that the map is the owner's to move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const onMapPress = (e: MapPressEvent) => {
    if (e.nativeEvent.action === 'marker-press') return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCorners((current) => addCorner(current, latitude, longitude));
  };

  const save = async () => {
    setSaving(true);
    try {
      const ring = savePayload(corners);
      await setDoorstepArea(ring);
      setSavedCount(savedCornerCount(ring));
      toast.success(savedToast(corners));
    } catch (err) {
      toast.error(errorText(err, COVERAGE_SAVE_FAILED));
    } finally {
      setSaving(false);
    }
  };

  /** Without a map the one thing to do is clear the area on file. */
  const clearSaved = async () => {
    setSaving(true);
    try {
      await setDoorstepArea(null);
      setCorners([]);
      setSavedCount(0);
      toast.success(COVERAGE_CLEARED);
    } catch (err) {
      toast.error(errorText(err, COVERAGE_SAVE_FAILED));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader title="Doorstep coverage area" />
      <ScCard style={styles.section}>
        {mapShown ? (
          <>
            <T size={12} color={colors.textSecondary}>
              {AREA_INTRO}
            </T>
            <View style={styles.editor}>
              <T size={11} color={colors.textMuted}>
                {cornerMessage(corners.length, fallbackRadiusKm)}
              </T>

              <View
                style={styles.mapBox}
                onLayout={(e) => {
                  mapWidth.current = e.nativeEvent.layout.width;
                }}
              >
                <MapView
                  style={styles.map}
                  initialRegion={initialRegion}
                  userInterfaceStyle={scheme}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  showsCompass={false}
                  toolbarEnabled={false}
                  onPress={onMapPress}
                >
                  {isArea(corners) ? (
                    <Polygon
                      coordinates={mapCoordinates(corners)}
                      fillColor={`${colors.red}2E`}
                      strokeColor={colors.red}
                      strokeWidth={2}
                    />
                  ) : null}

                  {/* Corners stay visible as handles even once the fill is drawn, so it is obvious
                      what a tap added and what "Undo corner" will remove. */}
                  {corners.map(([lng, lat], index) => (
                    <DotMarker
                      key={`${lng}-${lat}-${index}`}
                      latitude={lat}
                      longitude={lng}
                      size={14}
                      color={colors.red}
                    />
                  ))}

                  <DotMarker
                    key={`garage-${scheme}`}
                    latitude={center.lat}
                    longitude={center.lng}
                    size={16}
                    color={colors.textPrimary}
                  />
                </MapView>
              </View>

              <View style={styles.row}>
                <RectButton
                  tone="secondary"
                  small
                  fullWidth={false}
                  disabled={corners.length === 0}
                  onPress={() => setCorners(undoCorner)}
                  style={styles.flex}
                >
                  Undo corner
                </RectButton>
                <RectButton
                  tone="secondary"
                  small
                  fullWidth={false}
                  disabled={corners.length === 0}
                  onPress={() => setCorners([])}
                  style={styles.flex}
                >
                  <IconTrash size={14} color={colors.textPrimary} />
                  <T size={12} weight={600} lh={18}>
                    Clear
                  </T>
                </RectButton>
              </View>

              {/* Secondary: it sits under the Location tab's own Save location, which is that
                  tab's one red. */}
              <RectButton
                tone="secondary"
                disabled={saving || loading || saveBlocked(corners)}
                onPress={() => void save()}
              >
                {saveLabel(corners, saving)}
              </RectButton>
            </View>
          </>
        ) : (
          <>
            <T size={12} color={colors.textSecondary}>
              {AREA_UNAVAILABLE_NOTE}
            </T>
            <T size={11} color={colors.textMuted}>
              {loading ? 'Checking for a saved coverage area…' : savedStatus(savedCount, fallbackRadiusKm)}
            </T>
            <RectButton tone="secondary" disabled={saving || loading} onPress={() => void clearSaved()}>
              {saving ? 'Saving…' : 'Clear area and use radius'}
            </RectButton>
          </>
        )}
      </ScCard>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  section: { gap: 12 },
  editor: { gap: 12 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  mapBox: {
    height: MAP_HEIGHT,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
}));
