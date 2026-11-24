import { msg } from '@repo/core/i18n/translate';
import { cityLocation, placeLocation, type ActiveLocation, type PermissionState } from '@repo/core/stores/location-store';
import * as Location from 'expo-location';
import { create } from 'zustand';

import { devicePrefs } from './device-prefs';

export type { ActiveLocation } from '@repo/core/stores/location-store';
export {
  cityCentreParams,
  coarse,
  isApproximate,
  isCitywide,
  isStale,
  shouldOfferLocationPrompt,
} from '@repo/core/stores/location-store';

/**
 * Where the customer is, for sorting garages by distance: core's location store with the
 * phone's storage and GPS in place of the browser's. The same two rules: nothing here ever
 * blocks the app, and coordinates are rounded (`coarse`) before they leave the phone. What
 * is remembered is the area chosen and the last "Not now"; the permission belongs to the
 * phone and is asked again each launch.
 */
const KEY = 'detlio.location';
const STALE_AFTER_MS = 5 * 60 * 1000;

interface Stored {
  location: ActiveLocation | null;
  promptDismissedAt: number | null;
}

function read(): Stored {
  try {
    const stored = devicePrefs.getItem(KEY);
    if (stored) return JSON.parse(stored) as Stored;
  } catch {
    // Unreadable: as if nothing was kept.
  }
  return { location: null, promptDismissedAt: null };
}

interface LocationState extends Stored {
  permission: PermissionState;
  locating: boolean;
  dismissPrompt: () => void;
  setArea: (zone: { slug: string; name: string; lat: number; lng: number }) => void;
  /** Any place in the city found by the sheet's search: an area with no zone (placeLocation). */
  setPlace: (place: { name: string; lat: number; lng: number }) => void;
  /** A whole city picked in the sheet (0070): its centre, named for it, with its id. */
  selectCity: (city: { id: string; name: string; centre: { lat: number; lng: number } }) => void;
  refreshPermission: () => Promise<void>;
  requestGpsLocation: () => Promise<ActiveLocation | null>;
  /** Signing out or deleting: the next person, or a guest, starts with no place of this one's. */
  reset: () => void;
}

export const useLocationStore = create<LocationState>()((set, get) => {
  const keep = () => {
    const { location, promptDismissedAt } = get();
    devicePrefs.setItem(KEY, JSON.stringify({ location, promptDismissedAt }));
  };
  const setLocation = (location: ActiveLocation) => {
    set({ location });
    keep();
  };
  return {
    ...read(),
    permission: 'unknown',
    locating: false,
    dismissPrompt: () => {
      set({ promptDismissedAt: Date.now() });
      keep();
    },
    setArea: (zone) =>
      setLocation({
        lat: zone.lat,
        lng: zone.lng,
        label: zone.name,
        source: 'area',
        zone: zone.slug,
        updatedAt: Date.now(),
      }),
    setPlace: (place) => setLocation(placeLocation(place)),
    selectCity: (city) => setLocation(cityLocation(city)),
    reset: () => {
      set({ location: null, promptDismissedAt: null, locating: false });
      keep();
    },
    async refreshPermission() {
      try {
        const status = await Location.getForegroundPermissionsAsync();
        set({ permission: status.granted ? 'granted' : status.canAskAgain ? 'prompt' : 'denied' });
      } catch {
        // Not knowing only costs predicting the prompt.
      }
    },
    async requestGpsLocation() {
      set({ locating: true });
      try {
        const asked = await Location.requestForegroundPermissionsAsync();
        if (!asked.granted) {
          set({ locating: false, permission: asked.canAskAgain ? 'prompt' : 'denied' });
          return null;
        }
        // Sorting a list needs no GPS lock: a recent or coarse fix is kinder to the battery.
        const recent = await Location.getLastKnownPositionAsync({ maxAge: STALE_AFTER_MS });
        const fix = recent ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
        const location: ActiveLocation = {
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          label: msg('Current location'),
          source: 'gps',
          updatedAt: Date.now(),
        };
        set({ permission: 'granted', locating: false });
        setLocation(location);
        return location;
      } catch {
        set({ locating: false });
        return null;
      }
    },
  };
});
