/**
 * apps/users/lib/map-3d.ts, with what the phone adds at the end.
 *
 * The arithmetic of the two 3D touches of the customer UI round (Nov 2026):
 * the garage list's map peek (a small map tilted back in CSS, its dots
 * standing upright over it) and the map screen's route, an arc that lifts
 * off the map with its shadow left on the ground.
 *
 * Pure, so the projections are unit-tested without a browser or a map
 * (map-3d.test.ts). The components only feed them sizes and points.
 */

import type { LatLng } from './map-view';

/** Web Mercator's world pixel at a zoom, in 512-point tiles (apps/users/lib/map-view.ts worldPixel). */
const TILE_PX = 512;

export function worldPixel(point: LatLng, zoom: number): { x: number; y: number } {
  const size = TILE_PX * 2 ** zoom;
  const sin = Math.sin((point.lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

export interface Point {
  x: number;
  y: number;
}

// ─── The map peek ────────────────────────────────────────────────────────────

/** The peek's map: a square plane larger than the card, so its tilt never shows an edge. */
export const PEEK_PLANE_PX = 520;

/**
 * The zoom the peek is drawn at: the closest whole-ish zoom at which every
 * point sits inside the plane's middle `reach` (0–1) around `centre`, so
 * the dots spread over the card rather than bunch or fall off it. Kept to a
 * neighbourhood-to-city range (11–15).
 */
export function peekZoom(centre: LatLng, points: readonly LatLng[], reach = 0.36): number {
  const at = (zoom: number) => worldPixel(centre, zoom);
  for (let zoom = 15; zoom > 11; zoom -= 0.25) {
    const c = at(zoom);
    const fits = points.every((p) => {
      const q = worldPixel(p, zoom);
      return Math.abs(q.x - c.x) <= PEEK_PLANE_PX * reach && Math.abs(q.y - c.y) <= PEEK_PLANE_PX * reach;
    });
    if (fits) return zoom;
  }
  return 11;
}

/** Where a point sits on the plane, in plane pixels, with `centre` at `anchor`. */
export function planePoint(point: LatLng, centre: LatLng, zoom: number, anchor: Point): Point {
  const p = worldPixel(point, zoom);
  const c = worldPixel(centre, zoom);
  return { x: anchor.x + (p.x - c.x), y: anchor.y + (p.y - c.y) };
}

/**
 * Where a point of a plane tilted back by `tiltDeg` (CSS rotateX about
 * `origin`, seen with `perspective` px from `eye`) lands on screen. All in
 * the container's pixels: `origin` is where the transform origin sits in the
 * container, `point` is relative to the same origin before the tilt.
 *
 * CSS rotateX(θ) with y down and z towards the viewer: y' = y·cos θ,
 * z' = y·sin θ, so what lies below the origin comes nearer and grows; the
 * perspective divides by (d − z').
 */
export function tiltProject(offset: Point, origin: Point, tiltDeg: number, perspective: number, eye: Point): Point {
  const theta = (tiltDeg * Math.PI) / 180;
  const x = origin.x + offset.x;
  const y = origin.y + offset.y * Math.cos(theta);
  const z = offset.y * Math.sin(theta);
  const k = perspective / (perspective - z);
  return { x: eye.x + (x - eye.x) * k, y: eye.y + (y - eye.y) * k };
}

/** The peek's tilt: 52° once it has opened, up to 14° more as the list scrolls. */
export function peekTilt(opened: number, scrollY: number): number {
  return 52 * Math.min(1, Math.max(0, opened)) + Math.min(14, Math.max(0, scrollY) * 0.06);
}

// ─── The route arc on the map screen ─────────────────────────────────────────

/** How many points the arc is drawn with. */
export const ARC_STEPS = 48;

/**
 * The route from the customer to the garage as a gentle curve on the ground
 * (a quadratic bend to one side, so it never reads as a straight ruler
 * line), sampled ARC_STEPS + 1 times. In map coordinates, so the screen
 * overlay can project each point with the map itself on every move.
 */
export function groundCurve(from: LatLng, to: LatLng, bend = 0.22): LatLng[] {
  const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
  const control = {
    lat: mid.lat + (to.lng - from.lng) * bend,
    lng: mid.lng - (to.lat - from.lat) * bend,
  };
  const points: LatLng[] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS;
    const u = 1 - t;
    points.push({
      lat: u * u * from.lat + 2 * u * t * control.lat + t * t * to.lat,
      lng: u * u * from.lng + 2 * u * t * control.lng + t * t * to.lng,
    });
  }
  return points;
}

/**
 * The arc's height over each ground point, in screen pixels: none at either
 * end, highest in the middle, in proportion to how long the route looks on
 * screen (capped, so a long route does not leave the screen), and more as
 * the map is pitched (a flat map shows little of a lift).
 */
export function arcLift(ground: readonly Point[], pitchDeg: number): number[] {
  const first = ground[0];
  const last = ground[ground.length - 1];
  if (!first || !last) return [];
  const span = Math.hypot(last.x - first.x, last.y - first.y);
  const height = Math.min(160, 0.32 * span) * Math.max(0.42, Math.sin((pitchDeg * Math.PI) / 180));
  const n = ground.length - 1;
  return ground.map((_, i) => (n === 0 ? 0 : height * Math.sin((Math.PI * i) / n)));
}

/** An SVG path through the points ("M x y L …"), one decimal each. */
export function pathThrough(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
}

// ─── The phone's own ─────────────────────────────────────────────────────────

/** The part of the map on screen, as react-native-maps reports it. */
export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Where a point of the map is on screen, for a flat (unpitched) map showing `region`
 * across `size`: the route arc is an overlay drawn over react-native-maps, which has
 * no 3D line either. Mercator in latitude, so a tall view stays on its streets.
 */
export function regionPoint(point: LatLng, region: Region, size: { width: number; height: number }): Point {
  const merc = (lat: number) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    return Math.log((1 + sin) / (1 - sin)) / 2;
  };
  const west = region.longitude - region.longitudeDelta / 2;
  const top = merc(region.latitude + region.latitudeDelta / 2);
  const bottom = merc(region.latitude - region.latitudeDelta / 2);
  return {
    x: ((point.lng - west) / region.longitudeDelta) * size.width,
    y: ((top - merc(point.lat)) / (top - bottom)) * size.height,
  };
}

/** The length of a drawn line through the points, for drawing it in with a dash. */
export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/**
 * The points a light travelling the line passes, with how far along (0–1) it is at
 * each: what the tip of Route draw follows. A line of no length is its first point.
 */
export function stopsAlong(points: readonly Point[]): { at: number[]; x: number[]; y: number[] } {
  const total = pathLength(points);
  const at: number[] = [];
  let run = 0;
  points.forEach((point, i) => {
    if (i > 0) run += Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y);
    at.push(total > 0 ? run / total : i / Math.max(1, points.length - 1));
  });
  return { at, x: points.map((p) => p.x), y: points.map((p) => p.y) };
}

/**
 * The route's arc in map coordinates, for the phone's map (react-native-maps draws its
 * lines natively, under the pins, and keeps them on their streets through every pan).
 * The web lifts each point up the screen by arcLift; on a flat, north-up map "up the
 * screen" is north, and the lift grows with the route's length on screen exactly as the
 * route itself does with the zoom, so the lifted line is a fixed line on the map. Only
 * the web's 160-point cap needs the scale, `pxPerLng` (screen points per degree of
 * longitude), taken when the garage is chosen.
 */
export function liftedCurve(ground: readonly LatLng[], pxPerLng: number, pitchDeg = 0): LatLng[] {
  const first = ground[0];
  const last = ground[ground.length - 1];
  if (!first || !last) return [];
  const cos = Math.cos((((first.lat + last.lat) / 2) * Math.PI) / 180);
  // On screen, a degree of latitude is 1/cos as tall as a degree of longitude is wide.
  const span = Math.hypot(last.lng - first.lng, (last.lat - first.lat) / cos);
  const cap = pxPerLng > 0 ? 160 / pxPerLng : Infinity;
  const height = Math.min(cap, 0.32 * span) * Math.max(0.42, Math.sin((pitchDeg * Math.PI) / 180));
  const n = ground.length - 1;
  return ground.map((point, i) => ({
    lat: point.lat + (n === 0 ? 0 : height * Math.sin((Math.PI * i) / n)) * cos,
    lng: point.lng,
  }));
}
