/**
 * The bottom bar orb's two lights as react-native-svg can draw them (NavOrb in
 * finish.tsx). The web paints each light as a conic gradient (packages/ui/styles/
 * finish.css, `.hub-orb__spec` and `.hub-orb__hot`); react-native-svg has no conic
 * gradient, so a ring is drawn as a few arcs of at most 60°, each stroked with a linear
 * gradient along its chord. Every stop of the web's gradient is placed where its angle
 * falls on that chord, so the colours land where the web has them, and arcs that meet
 * share the colour at the seam. Pure, so it is tested without a phone.
 *
 * Angles are the web's: degrees clockwise from the top.
 */

/** A stop of a light: at `at` degrees, `color` (#RRGGBB) at `alpha`. */
export interface LightStop {
  at: number;
  color: string;
  alpha: number;
}

/**
 * The red spectrum (the web's `.hub-orb__spec`): a crimson base with two hot spots,
 * warm and pink at their edges. Its near-black gaps are the web's rgb(20 0 4 / .55)
 * over the graphite well's rim (#0E0E10), made solid, so arcs can overlap at their seams
 * without a darker line. Starts at 28° and runs once round, to 388°.
 */
const GAP = '#11060A';
export const SPECTRUM: LightStop[] = [
  { at: 28, color: GAP, alpha: 1 },
  { at: 50, color: '#7A0018', alpha: 1 },
  { at: 66, color: '#FF2A3D', alpha: 1 },
  { at: 80, color: '#FF7A3A', alpha: 1 },
  { at: 90, color: '#FFB070', alpha: 1 },
  { at: 99, color: '#FFF1EA', alpha: 1 },
  { at: 104, color: '#FFFFFF', alpha: 1 },
  { at: 111, color: '#FFD0DC', alpha: 1 },
  { at: 122, color: '#FF5C8A', alpha: 1 },
  { at: 136, color: '#E8125A', alpha: 1 },
  { at: 152, color: '#7A0019', alpha: 1 },
  { at: 172, color: GAP, alpha: 1 },
  { at: 206, color: GAP, alpha: 1 },
  { at: 226, color: '#7A0018', alpha: 1 },
  { at: 244, color: '#FF4A3A', alpha: 1 },
  { at: 258, color: '#FF9466', alpha: 1 },
  { at: 272, color: '#FFF4EF', alpha: 1 },
  { at: 284, color: '#FF9AB4', alpha: 1 },
  { at: 296, color: '#FF2D6F', alpha: 1 },
  { at: 314, color: '#7A0019', alpha: 1 },
  { at: 334, color: GAP, alpha: 1 },
  { at: 388, color: GAP, alpha: 1 },
];

/**
 * The white light (the web's `.hub-orb__hot`): a bright spot at 100° and a fainter one
 * at 262°, transparent everywhere else. Two arcs, one for each spot, so nothing overlaps.
 */
export const WHITE_LIGHT: LightStop[][] = [
  [
    { at: 70, color: '#FFECEC', alpha: 0 },
    { at: 84, color: '#FFECEC', alpha: 0 },
    { at: 100, color: '#FFF6F6', alpha: 0.95 },
    { at: 122, color: '#FFD2DC', alpha: 0 },
    { at: 130, color: '#FFD2DC', alpha: 0 },
  ],
  [
    { at: 226, color: '#FFE1E6', alpha: 0 },
    { at: 230, color: '#FFE1E6', alpha: 0 },
    { at: 262, color: '#FFE1E6', alpha: 0.55 },
    { at: 284, color: '#FFE1E6', alpha: 0 },
    { at: 286, color: '#FFE1E6', alpha: 0 },
  ],
];

/** One arc of a ring: its path and the linear gradient (in the same user space) it is stroked with. */
export interface LightArc {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: { offset: number; color: string; alpha: number }[];
}

const RAD = Math.PI / 180;
const round = (n: number) => Math.round(n * 1000) / 1000;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((c) => Math.round(c).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** The light at `deg`, between its two neighbouring stops (the gradient's own blend). */
export function lightAt(light: LightStop[], deg: number): { color: string; alpha: number } {
  const first = light[0]!;
  const last = light[light.length - 1]!;
  if (deg <= first.at) return { color: first.color, alpha: first.alpha };
  if (deg >= last.at) return { color: last.color, alpha: last.alpha };
  const i = light.findIndex((stop) => stop.at >= deg);
  const b = light[i]!;
  const a = light[i - 1]!;
  const k = b.at === a.at ? 1 : (deg - a.at) / (b.at - a.at);
  const ca = rgb(a.color);
  const cb = rgb(b.color);
  return {
    color: hex([ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k]),
    alpha: a.alpha + (b.alpha - a.alpha) * k,
  };
}

/** Where `deg` (clockwise from the top) falls on a circle of radius `r` round (c, c). */
function point(c: number, r: number, deg: number): [number, number] {
  return [c + r * Math.sin(deg * RAD), c - r * Math.cos(deg * RAD)];
}

/**
 * The arcs that draw `light` from its first stop to its last on a circle of radius `r`
 * round (c, c): at most `span` degrees each, every arc but the last running `overlap`
 * degrees into the next so no hairline shows at the seam (safe where the light is solid,
 * as the spectrum is; pass 0 for a see-through light).
 */
export function lightArcs(light: LightStop[], c: number, r: number, span = 60, overlap = 0.6): LightArc[] {
  const from = light[0]!.at;
  const to = light[light.length - 1]!.at;
  const count = Math.max(1, Math.ceil((to - from) / span - 1e-9));
  const step = (to - from) / count;
  const arcs: LightArc[] = [];
  for (let i = 0; i < count; i++) {
    const a0 = from + step * i;
    const a1 = i === count - 1 ? to : a0 + step + overlap;
    const phi = a1 - a0;
    // A point at angle θ along the arc lands at this share of the chord.
    const along = (deg: number) => 0.5 + (0.5 * Math.sin((deg - a0 - phi / 2) * RAD)) / Math.sin((phi / 2) * RAD);
    const angles = [a0, ...light.map((stop) => stop.at).filter((at) => at > a0 && at < a1), a1];
    const [x1, y1] = point(c, r, a0);
    const [x2, y2] = point(c, r, a1);
    arcs.push({
      d: `M${round(x1)} ${round(y1)}A${r} ${r} 0 0 1 ${round(x2)} ${round(y2)}`,
      x1: round(x1),
      y1: round(y1),
      x2: round(x2),
      y2: round(y2),
      stops: angles.map((deg) => ({
        offset: round(along(deg)),
        ...lightAt(light, deg),
      })),
    });
  }
  return arcs;
}
