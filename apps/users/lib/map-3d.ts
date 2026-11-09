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

/** The zooms the peek may use: a neighbourhood down to the whole city. */
export const PEEK_MAX_ZOOM = 15
export const PEEK_MIN_ZOOM = 10

/**
 * What the customer sees of the tilted plane: the card's size, where the
 * plane's middle (the customer) is pinned on it, the CSS perspective and its
 * eye, the tilt, and the margins a dot must keep clear of (the dark fade at
 * the top, the two glass chips at the bottom, the rounded sides).
 */
export interface PeekFrame {
  width: number
  height: number
  anchorY: number
  eyeY: number
  perspective: number
  tilt: number
  inset: { top: number; right: number; bottom: number; left: number }
}

/**
 * Where a point lands on the card, or null when it is so far towards the
 * viewer that it is behind the eye (the perspective has no picture of it).
 */
export function peekScreenPoint(
  point: LatLng,
  centre: LatLng,
  zoom: number,
  frame: PeekFrame,
  drift = 0
): Point | null {
  const offset = planePoint(point, centre, zoom, { x: 0, y: 0 })
  const z = offset.y * Math.sin((frame.tilt * Math.PI) / 180)
  if (z >= frame.perspective * 0.8) return null
  return tiltProject(
    offset,
    { x: frame.width / 2, y: frame.anchorY + drift },
    frame.tilt,
    frame.perspective,
    { x: frame.width / 2, y: frame.eyeY }
  )
}

/** Whether a projected point is inside the card's clear area (grown by `slack` px each side). */
export function inPeekFrame(at: Point | null, frame: PeekFrame, slack = 0): at is Point {
  return (
    !!at &&
    at.x >= frame.inset.left - slack &&
    at.x <= frame.width - frame.inset.right + slack &&
    at.y >= frame.inset.top - slack &&
    at.y <= frame.height - frame.inset.bottom + slack
  )
}

/**
 * The zoom the peek is drawn at: the closest zoom (in quarter steps, within
 * the neighbourhood-to-city range) at which every garage, projected through
 * the tilt exactly as it is drawn, lands inside the card's clear area. Where
 * no zoom shows them all (garages spread across the city), the closest zoom
 * that shows the most of them, so the ones around the customer are there;
 * the rest are off the card. With none that ever fit, the city view.
 */
export function peekZoom(centre: LatLng, points: readonly LatLng[], frame: PeekFrame): number {
  const shownAt = (zoom: number) => {
    let count = 0
    for (const p of points) if (inPeekFrame(peekScreenPoint(p, centre, zoom, frame), frame)) count++
    return count
  }
  let best = PEEK_MAX_ZOOM
  let bestCount = -1
  for (let zoom = PEEK_MAX_ZOOM; zoom >= PEEK_MIN_ZOOM; zoom -= 0.25) {
    const count = shownAt(zoom)
    if (count > bestCount) {
      best = zoom
      bestCount = count
    }
    if (count === points.length) break
  }
  if (bestCount <= 0) return points.length === 0 ? PEEK_MAX_ZOOM : PEEK_MIN_ZOOM
  // Half a step further out, when that keeps every one of them: the dots
  // then sit inside the card rather than along its edges.
  const roomy = Math.max(PEEK_MIN_ZOOM, best - PEEK_ROOM)
  return shownAt(roomy) >= bestCount ? roomy : best
}

/** How much further out than the tightest fit the peek is drawn. */
const PEEK_ROOM = 0.5

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
