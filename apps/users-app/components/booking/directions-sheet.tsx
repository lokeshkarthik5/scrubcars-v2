import { toMinutes, useTravelTime } from '@repo/core/api/hooks/use-travel-time';
import { directionsHref, googleMapsLink } from '@repo/core/contact-links';
import { formatDistance, straightLineKm } from '@repo/core/map';
import type { Booking } from '@repo/core/types';
import { formatDuration } from '@repo/core/utils';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconCircleX, IconNavigation } from '@repo/native-ui/icons';
import { ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { coarse, useLocationStore } from '@/lib/location';
import { mapAvailable } from '@/lib/location-picker-logic';
import { openLink } from '@/lib/open-link';

const AT_GARAGE_M = 200;
const FRESH_FOR_MS = 5 * 60_000;

export function describeDrive(travel: { distanceM: number; durationS: number }) {
  return {
    atGarage: travel.distanceM < AT_GARAGE_M,
    time: formatDuration(Math.max(1, toMinutes(travel.durationS))),
    distance: formatDistance(travel.distanceM / 1000),
  };
}

type Fix = { state: 'found'; lat: number; lng: number } | { state: 'denied' } | { state: 'unavailable' };

function useCurrentPosition(wanted: boolean): Fix | null {
  const [fix, setFix] = useState<Fix | null>(() => {
    const stored = useLocationStore.getState().location;
    return wanted && stored?.source === 'gps' && Date.now() - stored.updatedAt < FRESH_FOR_MS ? { state: 'found', lat: stored.lat, lng: stored.lng } : null;
  });
  const asked = fix !== null;
  useEffect(() => {
    if (!wanted || asked) return;
    let current = true;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          if (current) setFix({ state: 'denied' });
          return;
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (current) setFix({ state: 'found', lat: position.coords.latitude, lng: position.coords.longitude });
      } catch {
        if (current) setFix({ state: 'unavailable' });
      }
    })();
    return () => {
      current = false;
    };
  }, [wanted, asked]);
  return fix;
}

function DirectionsContent({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { scheme } = useTheme();
  const garage = booking.garage;
  const garageLat = garage?.lat ?? null;
  const garageLng = garage?.lng ?? null;
  const garagePoint = useMemo(() => (garageLat !== null && garageLng !== null ? { lat: garageLat, lng: garageLng } : null), [garageLat, garageLng]);
  const fix = useCurrentPosition(garagePoint !== null);
  const hereLat = fix?.state === 'found' ? fix.lat : null;
  const hereLng = fix?.state === 'found' ? fix.lng : null;
  const here = useMemo(() => (hereLat !== null && hereLng !== null ? { lat: hereLat, lng: hereLng } : null), [hereLat, hereLng]);
  // Rounded before it leaves the phone.
  const travel = useTravelTime(here ? coarse(here) : null, garagePoint);
  const fullAddress = garage?.address ? [garage.address, garage.city].filter(Boolean).join(', ') : undefined;
  const mapsHref = garage ? directionsHref({ lat: garageLat, lng: garageLng, address: fullAddress, mapsUrl: garage.mapsUrl }) : null;
  const mapShown = garagePoint && mapAvailable(Platform.OS, Constants.expoConfig?.android?.config?.googleMaps?.apiKey);

  let line: string;
  if (!garagePoint) {
    line = googleMapsLink(garage?.mapsUrl) ? 'This garage has not pinned its location yet. Google Maps opens its own listing.' : 'This garage has not pinned its location yet. Google Maps will search by its address.';
  } else if (!fix) {
    line = 'Finding your location…';
  } else if (fix.state === 'denied') {
    line = 'Allow location access to see how long the drive is.';
  } else if (fix.state === 'unavailable') {
    line = "Couldn't find your location. Google Maps can still take you there.";
  } else if (travel.data) {
    const drive = describeDrive(travel.data);
    line = drive.atGarage ? "You're at the garage." : `${drive.time} drive · ${drive.distance} from you`;
  } else if (travel.isFetching) {
    line = 'Working out the drive…';
  } else {
    const km = straightLineKm({ lat: fix.lat, lng: fix.lng }, garagePoint);
    line = km * 1000 < AT_GARAGE_M ? "You're at the garage." : `${formatDistance(km)} away in a straight line`;
  }

  return (
    <View style={styles.column}>
      <View style={styles.head}>
        <View style={styles.grow}>
          <T size={16} weight={600} lh={22}>
            Directions
          </T>
          <T size={13} lh={18} color={colors.textSecondary} style={styles.mt4}>
            {booking.vendorName}
          </T>
          {fullAddress ? (
            <T size={12} lh={16} color={colors.textMuted}>
              {fullAddress}
            </T>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
          <IconCircleX size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
      {mapShown ? (
        <View style={styles.mapBox}>
          <MapView
            style={styles.map}
            userInterfaceStyle={scheme}
            initialRegion={{ latitude: garagePoint.lat, longitude: garagePoint.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
            rotateEnabled={false}
            pitchEnabled={false}
            showsCompass={false}
            toolbarEnabled={false}
          >
            <Marker coordinate={{ latitude: garagePoint.lat, longitude: garagePoint.lng }} />
            {here ? <Marker pinColor={colors.info} coordinate={{ latitude: here.lat, longitude: here.lng }} /> : null}
          </MapView>
        </View>
      ) : null}
      <T accessibilityLiveRegion="polite" size={13} lh={18} color={colors.textSecondary}>
        <Figures size={13} color={colors.textSecondary} text={line} />
      </T>
      {mapsHref ? (
        <ScButton variant="cta" onPress={() => openLink(mapsHref)}>
          <IconNavigation size={18} color={colors.white} />
          <Label color={colors.white}>Open in Google Maps</Label>
        </ScButton>
      ) : null}
    </View>
  );
}

/** BookingDirectionsSheet (apps/users/components/booking-directions-sheet.tsx). */
export function BookingDirectionsSheet({ open, onClose, booking }: { open: boolean; onClose: () => void; booking: Booking }) {
  return (
    <ScSheet horizontalPadding={16} open={open} onClose={onClose} accessibilityLabel="Directions">
      {open ? <DirectionsContent booking={booking} onClose={onClose} /> : null}
    </ScSheet>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  mt4: { marginTop: 4 },
  close: { marginRight: -8, marginTop: -4, height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  mapBox: { height: 176, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: c.border },
  map: { flex: 1 },
}));
