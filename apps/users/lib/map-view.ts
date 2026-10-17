/**
 * The garage map's arithmetic: what a pin says, what the opening view
 * frames, how much of the screen the controls cover, and which pins are
 * close enough on screen to be drawn as one count bubble.
 *
 * Pure, so each rule is unit-tested without a map (map-view.test.ts).
 */

export interface LatLng {
  lat: number
  lng: number
}

/** Same shape as MapBounds in @repo/ui/features/map-controller. */
export interface LatLngBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

/** How many characters of a garage's name fit on its pin. */
export const PIN_NAME_CHARS = 14

/**
 * The widest a pin is drawn, in pixels. The pin's CSS caps it here
 * (components/map/garage-pins.tsx reads this constant), and the overlap test
 * and the fit's side padding are worked out from it, so the three cannot
 * drift apart. A 14-character name over a price is about 108 px.
 */
export const PIN_MAX_WIDTH_PX = 132

/** How much the chosen garage's pin grows, so it stands out from the rest. */
export const PIN_SELECTED_SCALE = 1.1

/**
 * Half the widest pin, chosen: how far a pin reaches either side of its spot,
 * since it is drawn centred over it. 73 px.
 */
const PIN_HALF_SPAN_PX = Math.ceil((PIN_MAX_WIDTH_PX * PIN_SELECTED_SCALE) / 2)

/**
 * A garage's name, short enough for its pin: "Sri Murugan Car Wash" reads
 * "Sri Murugan C…". Cut at a character count rather than left to CSS, so the
 * pin's width (and with it the overlap test below) stays predictable.
 */
export function pinLabel(name: string, max = PIN_NAME_CHARS): string {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

const KM_PER_DEGREE_LAT = 111.32

/**
 * A box around every point, at least `minSpanKm` across each way.
 *
 * The minimum keeps a fit from diving to street level: framing one garage, or
 * a customer with nothing nearby, would otherwise zoom as far in as the map
 * allows. Null when there is nothing to frame.
 */
export function framingBounds(points: LatLng[], minSpanKm: number): LatLngBounds | null {
  if (points.length === 0) return null

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const point of points) {
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  }

  const midLat = (minLat + maxLat) / 2
  const minLatSpan = minSpanKm / KM_PER_DEGREE_LAT
  // A degree of longitude shrinks towards the poles; Chennai is at 13°N, so
  // it is about 3% shorter than a degree of latitude there.
  const minLngSpan = minSpanKm / (KM_PER_DEGREE_LAT * Math.cos((midLat * Math.PI) / 180))

  if (maxLat - minLat < minLatSpan) {
    const pad = (minLatSpan - (maxLat - minLat)) / 2
    minLat -= pad
    maxLat += pad
  }
  if (maxLng - minLng < minLngSpan) {
    const pad = (minLngSpan - (maxLng - minLng)) / 2
    minLng -= pad
    maxLng += pad
  }

  return { minLng, minLat, maxLng, maxLat }
}

export interface FitPadding {
  top: number
  bottom: number
  left: number
  right: number
}

/** Map left visible between the controls, so a fit never squeezes to nothing. */
const MIN_CLEAR_PX = 120

/**
 * Padding for a fit, so no pin lands under the controls on top or the card
 * strip along the bottom, or hangs off either side of the screen.
 *
 * `chrome.top` is where the top controls end and `chrome.bottom` how much of
 * the screen the cards cover, both in pixels from that edge. A pin is drawn
 * above its point (its tail marks the spot), so the top needs a pin's height
 * of room beyond the controls; the bottom needs a little air above the cards.
 * The pin is also centred on its point, so the sides need half the widest
 * pin: with less, the westmost and eastmost garages (often a lone outlier,
 * never folded into a bubble) lost the first letters of their name and price
 * to the screen edge. On a short screen top and bottom shrink together, and
 * on a narrow one the sides do, rather than leave MapLibre a negative area to
 * fit into, which it refuses without moving at all.
 */
export function fitPadding(
  view: { width: number; height: number },
  chrome: { top: number; bottom: number },
  side = PIN_HALF_SPAN_PX
): FitPadding {
  let top = chrome.top + 56
  let bottom = chrome.bottom + 24
  const room = view.height - MIN_CLEAR_PX
  if (top + bottom > room) {
    const scale = Math.max(0, room) / (top + bottom)
    top = Math.floor(top * scale)
    bottom = Math.floor(bottom * scale)
  }
  const sides = Math.max(0, Math.min(side, Math.floor((view.width - MIN_CLEAR_PX) / 2)))
  return { top, bottom, left: sides, right: sides }
}

/** MapLibre's tiles are 512 px, so the world is 512 × 2^zoom pixels wide. */
const TILE_PX = 512

/** A point's position in Web Mercator pixels at `zoom`, as MapLibre draws it. */
export function worldPixel(point: LatLng, zoom: number): { x: number; y: number } {
  const size = TILE_PX * 2 ** zoom
  const sin = Math.sin((point.lat * Math.PI) / 180)
  return {
    x: ((point.lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  }
}

/**
 * How close two pins' points can be on screen before the pins overlap: one of
 * the widest pins across plus a little air, and one pin high (44 px tall plus
 * its tail). Measured against the widest pin rather than a typical one, so two
 * long names are never printed over each other. The chosen pin is kept out of
 * grouping and drawn 10% larger, so it can still cover a neighbour's edge;
 * it is lifted above the rest for exactly that reason.
 */
export const PIN_OVERLAP_PX = { x: PIN_MAX_WIDTH_PX + 4, y: 50 }

export interface PinGroup<T> {
  /** Stable while the same garages are grouped, for a React key. */
  key: string
  members: T[]
  /** Where the group is drawn: the middle of its members. */
  lat: number
  lng: number
}

/**
 * Groups pins that would overlap at this zoom into one, drawn as a count
 * bubble ("3") that zooms in when tapped. A group of one is a plain pin.
 *
 * Greedy, in the order given (nearest first, from the list), each pin joins
 * the first group whose first pin it would overlap, or starts its own. It
 * depends on the zoom alone, not on where the map is panned, so panning never
 * reshuffles the groups. The map is a page of at most 50 garages, so this
 * stays a few thousand comparisons and needs no index.
 */
export function groupPins<T extends { id: string; lat: number; lng: number }>(
  pins: T[],
  zoom: number,
  overlap = PIN_OVERLAP_PX
): PinGroup<T>[] {
  const groups: Array<{ anchor: { x: number; y: number }; members: T[] }> = []

  for (const pin of pins) {
    const at = worldPixel(pin, zoom)
    const group = groups.find(
      (g) => Math.abs(g.anchor.x - at.x) < overlap.x && Math.abs(g.anchor.y - at.y) < overlap.y
    )
    if (group) group.members.push(pin)
    else groups.push({ anchor: at, members: [pin] })
  }

  return groups.map(({ members }) => ({
    key: members.map((m) => m.id).join('|'),
    members,
    lat: members.reduce((sum, m) => sum + m.lat, 0) / members.length,
    lng: members.reduce((sum, m) => sum + m.lng, 0) / members.length,
  }))
}

/** The least zoom-in worth animating; below it the camera barely moves. */
const MIN_ZOOM_STEP = 0.1

/**
 * What tapping a count bubble does, given the zoom the map is at and the zoom
 * fitting its garages would reach (MapLibre's cameraForBounds; undefined when
 * it cannot say).
 *
 * It zooms in when that gets meaningfully closer, and it brings a garage's
 * card up when zooming would not split the bubble. Garages on the same street
 * or in one complex can stay one bubble at the closest zoom a fit reaches on a
 * phone (about 16.3 at 375 px wide); a bubble that only tried to zoom would
 * then fit the same box, not move, and do nothing on every tap.
 */
export function bubbleTap<T extends { id: string; lat: number; lng: number }>(
  members: T[],
  fromZoom: number,
  toZoom: number | undefined
): { zoomTo: number | null; select: boolean } {
  const zoomTo = toZoom !== undefined && toZoom - fromZoom > MIN_ZOOM_STEP ? toZoom : null
  const splits = toZoom !== undefined && groupPins(members, toZoom).length > 1
  return { zoomTo, select: zoomTo === null || !splits }
}

/**
 * Which garage of a bubble to choose: the first one after the current choice
 * in list order (nearest first), wrapping round. The chosen garage leaves its
 * bubble, so always taking the bubble's first member would bounce between
 * two garages and never reach a third.
 */
export function nextInBubble<T extends { id: string }>(
  members: T[],
  order: string[],
  selectedId: string | null
): T {
  const at = selectedId ? order.indexOf(selectedId) : -1
  return members.find((member) => order.indexOf(member.id) > at) ?? members[0]
}

/**
 * Whether a point on screen is in the part of the map the controls and cards
 * leave clear. Used before panning to a chosen garage, so a pin already in
 * view is left exactly where the customer is looking at it.
 */
export function isInFrame(
  point: { x: number; y: number },
  view: { width: number; height: number },
  padding: FitPadding
): boolean {
  return (
    point.x >= padding.left &&
    point.x <= view.width - padding.right &&
    point.y >= padding.top &&
    point.y <= view.height - padding.bottom
  )
}

/**
 * Where the clear part of the map is centred, relative to the middle of the
 * screen, as MapLibre's `offset` takes it. Panning with an offset rather than
 * `padding` leaves the camera's own padding alone, which MapLibre would
 * otherwise keep for every later move.
 */
export function frameCentreOffset(padding: FitPadding): [number, number] {
  return [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2]
}
