import type { ApiVendorProfile } from '@repo/core/api/types';

import type { PickedLocation } from './location-picker-logic';

/**
 * The pure parts of Settings > Location (apps/vendors/app/settings/page.tsx): the pin the
 * tab opens on, the radius box and what "Save location" sends. Kept free of react-native.
 */

/** The pin the tab opens on: the saved one, as a map pin, or none. */
export function pinFromVendor(vendor: Pick<ApiVendorProfile, 'lat' | 'lng' | 'address' | 'city' | 'pincode'>): PickedLocation | null {
  if (vendor.lat == null || vendor.lng == null) return null;
  return {
    lat: vendor.lat,
    lng: vendor.lng,
    address: vendor.address,
    city: vendor.city,
    pincode: vendor.pincode,
    source: 'map_pin',
  };
}

/** The radius box shows the saved radius, or nothing (the default 10 km applies). */
export const radiusText = (vendor: Pick<ApiVendorProfile, 'doorstepRadiusKm'>) =>
  vendor.doorstepRadiusKm != null ? String(vendor.doorstepRadiusKm) : '';

/** A radius box takes digits and a dot. */
export const radiusInput = (text: string) => text.replace(/[^\d.]/g, '');

/**
 * What "Save location" sends. Empty sends null, which clears a saved radius: the hint promises
 * "Leave empty to use 10 km", and leaving the old number in place would keep refusing customers
 * between it and the default.
 */
export function locationPayload(pin: Pick<PickedLocation, 'lat' | 'lng' | 'source'>, radiusBox: string) {
  const trimmed = radiusBox.trim();
  return {
    lat: pin.lat,
    lng: pin.lng,
    geoSource: pin.source,
    doorstepRadiusKm: trimmed ? Number(trimmed) : null,
  };
}

/** The radius text is not a number the server would take (a lone dot, "1.2.3"). */
export const radiusUnreadable = (radiusBox: string) => {
  const trimmed = radiusBox.trim();
  return trimmed !== '' && !Number.isFinite(Number(trimmed));
};
