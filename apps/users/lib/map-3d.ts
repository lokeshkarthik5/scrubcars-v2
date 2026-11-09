/**
 * The arithmetic of the two 3D touches of the customer UI round (Nov 2026):
 * the garage list's map peek (a small map tilted back in CSS, its dots
 * standing upright over it) and the map screen's route, an arc that lifts
 * off the map with its shadow left on the ground.
 *
 * Pure, so the projections are unit-tested without a browser or a map
 * (map-3d.test.ts). The components only feed them sizes and points.
 */

import { worldPixel, type LatLng } from './map-view'

export interface Point {
  x: number
  y: number
}

// ─── The map peek ────────────────────────────────────────────────────────────

/** The peek's map: a square plane larger than the card, so its tilt never shows an edge. */
export const PEEK_PLANE_PX = 520

/**
 * The zoom the peek is drawn at: the closest whole-ish zoom at which every
 * point sits inside the plane's middle `reach` (0–1) around `centre`, so
 * the dots spread over the card rather than bunch or fall off it. Kept to a
 * neighbourhood-to-city range (11–15).
 */
export function peekZoom(centre: LatLng, points: readonly LatLng[], reach = 0.36): number {
  const at = (zoom: number) => worldPixel(centre, zoom)
  for (let zoom = 15; zoom > 11; zoom -= 0.25) {
    const c = at(zoom)
    const fits = points.every((p) => {
      const q = worldPixel(p, zoom)
      return Math.abs(q.x - c.x) <= PEEK_PLANE_PX * reach && Math.abs(q.y - c.y) <= PEEK_PLANE_PX * reach
    })
    if (fits) return zoom
  }
  return 11
}

/** Where a point sits on the plane, in plane pixels, with `centre` at `anchor`. */
export function planePoint(point: LatLng, centre: LatLng, zoom: number, anchor: Point): Point {
  const p = worldPixel(point, zoom)
  const c = worldPixel(centre, zoom)
  return { x: anchor.x + (p.x - c.x), y: anchor.y + (p.y - c.y) }
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
export function tiltProject(
  offset: Point,
  origin: Point,
  tiltDeg: number,
  perspective: number,
  eye: Point
): Point {
  const theta = (tiltDeg * Math.PI) / 180
  const x = origin.x + offset.x
  const y = origin.y + offset.y * Math.cos(theta)
  const z = offset.y * Math.sin(theta)
  const k = perspective / (perspective - z)
  return { x: eye.x + (x - eye.x) * k, y: eye.y + (y - eye.y) * k }
}

/** The peek's tilt: 52° once it has opened, up to 14° more as the list scrolls. */
export function peekTilt(opened: number, scrollY: number): number {
  return 52 * Math.min(1, Math.max(0, opened)) + Math.min(14, Math.max(0, scrollY) * 0.06)
}

// ─── The route arc on the map screen ─────────────────────────────────────────

/** How many points the arc is drawn with. */
export const ARC_STEPS = 48

/**
 * The route from the customer to the garage as a gentle curve on the ground
 * (a quadratic bend to one side, so it never reads as a straight ruler
 * line), sampled ARC_STEPS + 1 times. In map coordinates, so the screen
 * overlay can project each point with the map itself on every move.
 */
export function groundCurve(from: LatLng, to: LatLng, bend = 0.22): LatLng[] {
  const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }
  const control = {
    lat: mid.lat + (to.lng - from.lng) * bend,
    lng: mid.lng - (to.lat - from.lat) * bend,
  }
  const points: LatLng[] = []
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS
    const u = 1 - t
    points.push({
      lat: u * u * from.lat + 2 * u * t * control.lat + t * t * to.lat,
      lng: u * u * from.lng + 2 * u * t * control.lng + t * t * to.lng,
    })
  }
  return points
}

/**
 * The arc's height over each ground point, in screen pixels: none at either
 * end, highest in the middle, in proportion to how long the route looks on
 * screen (capped, so a long route does not leave the screen), and more as
 * the map is pitched (a flat map shows little of a lift).
 */
export function arcLift(ground: readonly Point[], pitchDeg: number): number[] {
  const first = ground[0]
  const last = ground[ground.length - 1]
  if (!first || !last) return []
  const span = Math.hypot(last.x - first.x, last.y - first.y)
  const height = Math.min(160, 0.32 * span) * Math.max(0.42, Math.sin((pitchDeg * Math.PI) / 180))
  const n = ground.length - 1
  return ground.map((_, i) => (n === 0 ? 0 : height * Math.sin((Math.PI * i) / n)))
}

/** An SVG path through the points ("M x y L …"), one decimal each. */
export function pathThrough(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
}
