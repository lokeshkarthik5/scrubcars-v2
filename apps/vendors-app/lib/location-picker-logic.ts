import type { MapsLinkResult, MapsLinkWarning } from '@repo/core/api/geo';
import { msg, t } from '@repo/core/i18n/translate';

/**
 * The pure parts of the map picker (packages/ui/src/features/location-picker.tsx): the words
 * for a pasted link, when to search, the map's zoom maths and the location timeout. Kept free
 * of react-native so `bun test` can load it. Its words are English constants (msg) for the
 * screen's t(); linkOutcome's notice comes out in the language in use.
 */
export interface PickedLocation {
  lat: number;
  lng: number;
  /** Formatted address from the provider. The caller may let the user edit it. */
  address: string;
  city: string;
  pincode: string;
  /** How the coordinates were arrived at, for the server's `geoSource`. */
  source: 'gps' | 'map_pin';
}

export const DEBOUNCE_MS = 300;
export const MIN_QUERY_LENGTH = 3;
/** The search box's own words, for its placeholder and its label. */
export const SEARCH_PLACEHOLDER = msg('Search for area, street or landmark');
/** The web waits 15 s for a real fix: this coordinate is stored for good. */
export const LOCATION_TIMEOUT_MS = 15_000;
export const OPEN_ZOOM = 11;

export const LINK_WARNINGS: Record<MapsLinkWarning, string> = {
  place_share_link: msg(
    'That looks like a Google place-share link, which carries no location. We placed the pin from its address — check it before saving.'
  ),
  directions_link: msg('That was a directions link, so we used its destination. Check the pin before saving.'),
  no_location_found: msg('Could not read a location from that link. Search above, or drop the pin by hand.'),
  unreachable: msg('Could not open that link. Search above, or drop the pin by hand.'),
};

export const LOOKUP_FAILED = msg('Could not look up that address — you can type it below.');
export const SUGGESTION_FAILED = msg('Could not locate that address. Try dropping the pin instead.');
export const LOCATION_BLOCKED = msg('Location access was blocked. Search or drop the pin instead.');

/** A search runs for three letters or more. */
export const isSearchable = (query: string) => query.trim().length >= MIN_QUERY_LENGTH;

/**
 * The suggestions show while the text is searchable, there are some, and the text is not the
 * label of the suggestion just picked (writing that label into the box is not typing).
 */
export const suggestionsVisible = (query: string, count: number, committedLabel: string | null) =>
  isSearchable(query) && count > 0 && query.trim() !== committedLabel;

/** Groups one picker's keystrokes into one provider session. Not a secret: any unique text will do. */
export function makeSessionToken(random: () => number = Math.random): string {
  const part = () =>
    Math.floor(random() * 0x100000000)
      .toString(16)
      .padStart(8, '0');
  return `${part()}-${part()}-${Date.now().toString(16)}`;
}

/** Does the place the link resolved to read as the city on the form? Unknown reads as fine. */
export function linkMatchesCity(resolvedPlace: string | null, expectedCity?: string): boolean {
  const place = (resolvedPlace ?? '').trim();
  const city = (expectedCity ?? '').trim();
  if (!place || !city) return true;
  return place.toLowerCase().includes(city.toLowerCase());
}

/**
 * What a resolved Google Maps link means for the picker: where to put the pin (null when the
 * link gave none) and the one non-blocking note to show under the box. Nothing about the link
 * is rejected: a wrong kind of link gets a warning and whatever could be salvaged.
 */
export function linkOutcome(
  result: MapsLinkResult,
  expectedCity?: string
): { point: { lat: number; lng: number } | null; notice: string | null } {
  if (result.lat === null || result.lng === null) {
    return { point: null, notice: t(LINK_WARNINGS[result.warning ?? 'no_location_found']) };
  }
  const notices: string[] = [];
  if (result.warning) notices.push(t(LINK_WARNINGS[result.warning]));
  const resolvedCity = result.address ?? '';
  if (!linkMatchesCity(resolvedCity, expectedCity)) {
    notices.push(
      t('This link points to “{place}”, which does not look like {city}. Check the pin.', {
        place: resolvedCity.slice(0, 60),
        city: expectedCity ?? '',
      })
    );
  } else if (result.source === 'geocoded') {
    notices.push(t('Pin placed from the link’s address — check it before saving.'));
  }
  return { point: { lat: result.lat, lng: result.lng }, notice: notices.length > 0 ? notices.join(' ') : null };
}

/** Rejects after `ms` if the work has not finished; the work itself is not cancelled. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Longitude degrees across a map `widthPt` points wide at a web-mercator zoom (256px tiles). */
export const longitudeDeltaFor = (zoom: number, widthPt: number) => (360 * (widthPt / 256)) / 2 ** zoom;

/** The zoom a map `widthPt` wide shows when it spans `longitudeDelta` degrees. */
export const zoomFor = (longitudeDelta: number, widthPt: number) =>
  Math.log2((360 * (widthPt / 256)) / Math.max(longitudeDelta, 1e-9));

/** A region centred on a point at a zoom; the map is `widthPt` by `heightPt`. */
export function regionFor(
  center: { lat: number; lng: number },
  zoom: number,
  widthPt: number,
  heightPt: number
) {
  const longitudeDelta = longitudeDeltaFor(zoom, widthPt);
  return {
    latitude: center.lat,
    longitude: center.lng,
    longitudeDelta,
    // Close enough to square pixels at the city scale this picker works at.
    latitudeDelta: longitudeDelta * (heightPt / widthPt),
  };
}

/** The zoom to fly to: in to `target`, but never back out from where the owner already is. */
export const flyZoom = (currentZoom: number | null, target: number) =>
  currentZoom === null ? target : Math.max(currentZoom, target);

/**
 * Whether the map can be drawn. iOS uses Apple Maps, which needs no key. Android draws Google
 * Maps, which with no API key in the build shows grey tiles or crashes the screen: then the
 * picker leaves the map out and keeps the address search, "Use my current location" and the
 * pasted link or coordinates, which place the pin without it.
 */
export const mapAvailable = (os: string, androidMapsKey: string | null | undefined): boolean =>
  os !== 'android' || Boolean(androidMapsKey && androidMapsKey.trim());

export const MAP_UNAVAILABLE_NOTE = msg(
  'The map is not available in this version of the app. Search for the address, use your current location, or paste a link or coordinates.'
);
