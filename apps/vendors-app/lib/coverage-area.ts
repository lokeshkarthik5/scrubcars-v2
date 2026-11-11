import { closeRing, type CoverageRing } from '@repo/core/api/coverage';
import { DEFAULT_DOORSTEP_RADIUS_KM } from '@repo/core/doorstep';
import { msg, t } from '@repo/core/i18n/translate';

/**
 * The pure parts of the doorstep coverage editor (packages/ui/src/features/coverage-editor.tsx):
 * the ring the server holds against the corners the owner taps, the line of words under the
 * heading, what the buttons say and when they work. Free of react-native so `bun test` can load it.
 * The constants stay English (msg) for the screen's t(); the lines built here come out in the
 * language in use.
 */

/** An area needs a triangle or better; the server needs these three plus the repeated closing point. */
export const MIN_CORNERS = 3;

export const AREA_INTRO = msg(
  "Optional. Draw the exact area you'll travel to — useful when a river, highway or city boundary means a plain radius gets it wrong."
);
export const COVERAGE_SAVED = msg('Coverage area saved');
export const COVERAGE_CLEARED = msg('Coverage area cleared');
export const COVERAGE_SAVE_FAILED = msg('Could not save the area');
export const AREA_UNAVAILABLE_NOTE = msg(
  "The coverage area can't be drawn in this version of the app. Draw it on the web, or clear it here to use your radius."
);

/** The corners as tapped, [lng, lat] like the server's ring, without the closing repeat. */
export type Corners = CoverageRing;

/**
 * The saved ring as corners to edit. The repeated closing point is dropped so "Undo corner"
 * does not seem to do nothing on the first press; a ring too short to be an area is no corners.
 */
export function cornersFromRing(ring: CoverageRing | null | undefined): Corners {
  return ring && ring.length > 3 ? ring.slice(0, -1) : [];
}

/** A tap on the map, as the corner list's next entry (the ring is [lng, lat]). */
export const addCorner = (corners: Corners, lat: number, lng: number): Corners => [...corners, [lng, lat]];

export const undoCorner = (corners: Corners): Corners => corners.slice(0, -1);

/** The fill is only drawn once the corners are an area. */
export const isArea = (corners: Corners) => corners.length >= MIN_CORNERS;

/** The corners in the shape react-native-maps draws. */
export const mapCoordinates = (corners: Corners) =>
  corners.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

/** What the PUT carries: the closed ring, or null (which clears it back to the radius). */
export const savePayload = (corners: Corners): CoverageRing | null =>
  isArea(corners) ? closeRing(corners) : null;

/** One or two corners are neither an area nor a clear, so saving waits. */
export const saveBlocked = (corners: Corners) => corners.length > 0 && corners.length < MIN_CORNERS;

export function saveLabel(corners: Corners, saving: boolean): string {
  if (saving) return t('Saving…');
  return isArea(corners) ? t('Save coverage area') : t('Clear area and use radius');
}

export const savedToast = (corners: Corners) => (isArea(corners) ? COVERAGE_SAVED : COVERAGE_CLEARED);

/** The sentence under the intro: what applies now, or how many corners there are. */
export function cornerMessage(count: number, fallbackRadiusKm?: number | null): string {
  if (count === 0) {
    return fallbackRadiusKm
      ? t('Tap the map to draw the area you travel to. Until you do, your {km} km radius applies.', { km: fallbackRadiusKm })
      : // No radius set: the default applies, the same one the server measures with.
        t('Tap the map to draw the area you travel to. Until you do, the default {km} km radius applies.', {
          km: DEFAULT_DOORSTEP_RADIUS_KM,
        });
  }
  // MIN_CORNERS is 3, written into the sentence.
  if (count < MIN_CORNERS) return t('{count} of 3 corners — an area needs at least three.', { count });
  return t('{count} corners. Tap to add more, or save.', { count });
}

/** Corners in a saved ring (its closing repeat is not a corner), for the no-map status line. */
export const savedCornerCount = (ring: CoverageRing | null | undefined) => cornersFromRing(ring).length;

/** Without a map: what is on file, and what applies instead when nothing is. */
export function savedStatus(count: number, fallbackRadiusKm?: number | null): string {
  if (count > 0) return t('A coverage area with {count} corners is saved.', { count });
  return fallbackRadiusKm
    ? t('No coverage area is drawn. Your {km} km radius applies.', { km: fallbackRadiusKm })
    : t('No coverage area is drawn. The default {km} km radius applies.', { km: DEFAULT_DOORSTEP_RADIUS_KM });
}
