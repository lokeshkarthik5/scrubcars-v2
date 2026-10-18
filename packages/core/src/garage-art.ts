/**
 * The Detlio Garage (0057): each fictional hypercar's default picture,
 * drawn from numbers alone, so every one of the 40 cards looks finished
 * before (or without) AI or uploaded art. Pure: `garageCarSvg` returns a
 * whole SVG document as a string, which the apps show as an <img> (a data
 * URL, so each picture's gradients and filters are its own) and the share
 * image draws onto its canvas.
 *
 * A side profile of a low coupé, lit like a studio shot: sky on the upper
 * surfaces, a sharp horizon line in the flank's reflection, softbox hot
 * spots on the fender tops, a rim light on the silhouette, dark glass with
 * a streak, a floor shadow and the car's reflection in a polished floor.
 * The shape is seeded by the series and the card's number (mid-engined or
 * long-bonnet, length, nose, roof, deck, wing, intake, lights, wheels and
 * rims), the colour by its paint, so each of the 40 is its own car and
 * stays the same car when its name or words are edited. No badges, logos,
 * letters or plates: nothing that could be read as a real make or model.
 */

export type ArtTone = 'light' | 'dark'
export type ArtRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface CarShape {
  /** Mid-engined wedge (cabin forward) or a long-bonnet grand tourer (cabin back). */
  family: 'mid' | 'front'
  /** Body length, in picture units (the picture is 1200 × 520). */
  length: number
  wheelRadius: number
  /** Heights above the floor, as a share of the length. */
  nose: number
  roof: number
  deck: number
  tail: number
  /** Nudges the cabin forward (−) or back (+), as a share of the length. */
  cabinShift: number
  wing: 'none' | 'ducktail' | 'fixed' | 'swan'
  intake: 'blade' | 'scoop' | 'twin'
  headlight: 'strip' | 'split' | 'arrow'
  rim: 'five' | 'seven' | 'ten' | 'y' | 'turbine'
  rimFinish: 'silver' | 'graphite' | 'black' | 'bronze' | 'gold'
  stripe: 'none' | 'pin' | 'band'
  /** Sills, splitter and diffuser in carbon (otherwise satin black, smaller). */
  carbon: boolean
  /** The roof and pillars in gloss black, a floating canopy (two-tone). */
  blackRoof: boolean
}

export interface CarArtInput {
  /** The card's number in its series, 1–40: seeds the shape. */
  number: number
  /** The series number: a later series draws other shapes from the same numbers. */
  series?: number
  /** The paint, #RRGGBB. */
  paint: string
  tone: ArtTone
  rarity: ArtRarity
}

// ─── Small helpers ───────────────────────────────────────────────────────────

/** FNV-1a: a string to 32 bits. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: the same numbers for the same seed, on every device. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const v = m ? parseInt(m[1], 16) : 0x777777
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function mix(a: string, b: string, t: number): string {
  const x = rgb(a)
  const y = rgb(b)
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const lighten = (hex: string, t: number) => mix(hex, '#ffffff', t)
const darken = (hex: string, t: number) => mix(hex, '#000000', t)

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length) % items.length]
}

const between = (rand: () => number, lo: number, hi: number) => lo + (hi - lo) * rand()

const RARITY_RANK: Record<ArtRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }

// ─── The shape ───────────────────────────────────────────────────────────────

/**
 * The car's shape for a card: fixed by its series and number, so it never
 * changes when the team edits the name, the words or the paint. Rarer cards
 * lean lower and wilder (mid-engined, wings, bigger wheels).
 */
export function carShape(input: Pick<CarArtInput, 'number' | 'series' | 'rarity'>): CarShape {
  const rand = seeded(hash(`detlio-garage:${input.series ?? 1}:${input.number}`))
  const rank = RARITY_RANK[input.rarity]
  const family: CarShape['family'] = rand() < 0.42 - rank * 0.12 ? 'front' : 'mid'
  const wings =
    rank >= 2
      ? (['fixed', 'swan', 'fixed', 'ducktail'] as const)
      : rank === 1
        ? (['ducktail', 'fixed', 'none', 'swan'] as const)
        : (['none', 'ducktail', 'none', 'ducktail'] as const)
  const finishes =
    input.rarity === 'legendary'
      ? (['gold', 'bronze'] as const)
      : input.rarity === 'epic'
        ? (['black', 'graphite', 'bronze', 'silver'] as const)
        : (['silver', 'graphite', 'black', 'silver'] as const)
  const roof = between(rand, 0.218, 0.254) - rank * 0.006
  return {
    family,
    length: between(rand, 880, 940),
    wheelRadius: between(rand, 70, 76) + rank * 1.5,
    nose: between(rand, 0.058, 0.074),
    roof,
    deck: roof - between(rand, 0.058, 0.08),
    tail: between(rand, 0.118, 0.15) - rank * 0.004,
    cabinShift: between(rand, -0.025, 0.025),
    wing: family === 'front' && rank < 2 ? pick(rand, ['none', 'ducktail'] as const) : pick(rand, wings),
    intake: pick(rand, ['blade', 'scoop', 'twin'] as const),
    headlight: pick(rand, ['strip', 'split', 'arrow'] as const),
    rim: pick(rand, ['five', 'seven', 'ten', 'y', 'turbine'] as const),
    rimFinish: pick(rand, finishes),
    stripe: rank >= 2 ? pick(rand, ['pin', 'band', 'none'] as const) : pick(rand, ['none', 'none', 'pin'] as const),
    carbon: rand() < 0.4 + rank * 0.15,
    blackRoof: rand() < 0.3 + rank * 0.12,
  }
}

// ─── Geometry ────────────────────────────────────────────────────────────────

type Pt = [number, number]

/** A Catmull-Rom spline through the points, as cubic Bézier segments (no leading M). */
function spline(points: Pt[], tension = 0.5): string {
  let d = ''
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const t = tension / 3
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t]
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`
  }
  return d
}

const moveTo = (p: Pt) => `M${r1(p[0])} ${r1(p[1])}`

/** The height of a polyline at x (the points run front to back, x falling). */
function yAt(points: Pt[], x: number): number {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    if ((x <= x1 && x >= x2) || (x >= x1 && x <= x2)) return x1 === x2 ? y1 : y1 + ((x - x1) / (x2 - x1)) * (y2 - y1)
  }
  return points[points.length - 1][1]
}

const W = 1200
const H = 520
/** The floor line. */
const GROUND = 420
const CX = 600

interface Layout {
  L: number
  front: number
  rear: number
  xf: number
  xr: number
  R: number
  arch: number
  sill: number
  /** The top line, nose to tail. */
  top: Pt[]
  /** The side glass outline, front low corner first. */
  glass: Pt[]
  /** The shoulder: from the front fender back to the rear haunch. */
  shoulder: Pt[]
  /** Where the flank's reflection turns from sky to ground. */
  horizon: number
  cowl: Pt
  roofY: number
  tailTop: Pt
  /** The top line from the windscreen's foot to the roof's end. */
  canopy: Pt[]
}

function layout(s: CarShape): Layout {
  const L = s.length
  const front = CX + L / 2
  const rear = CX - L / 2
  const P = (fx: number, fh: number): Pt => [front - fx * L, GROUND - fh * L]
  const R = s.wheelRadius
  const mid = s.family === 'mid'
  const xf = front - L * (mid ? 0.185 : 0.2)
  const xr = front - L * (mid ? 0.77 : 0.785)
  const fender = (2 * R + 8) / L
  const c = s.cabinShift
  const roofEnd = mid ? 0.57 + c : 0.66 + c
  const top: Pt[] = mid
    ? [
        P(0, s.nose),
        P(0.055, s.nose + 0.03),
        P(0.17, fender),
        P(0.285 + c, fender + 0.012),
        P(0.4 + c, s.roof - 0.012),
        P(0.475 + c, s.roof),
        P(roofEnd, s.roof - 0.012),
        P(0.69, (s.roof + s.deck) / 2 - 0.012),
        P(0.8, s.deck),
        P(0.985, s.tail),
      ]
    : [
        P(0, s.nose),
        P(0.065, s.nose + 0.034),
        P(0.19, fender),
        P(0.34 + c, fender + 0.008),
        P(0.415 + c, fender + 0.022),
        P(0.53 + c, s.roof - 0.01),
        P(0.59 + c, s.roof),
        P(roofEnd, s.roof - 0.016),
        P(0.8, s.deck),
        P(0.985, s.tail),
      ]
  const cowl = mid ? top[3] : top[4]
  const roofY = GROUND - s.roof * L
  const beltFront = GROUND - (fender + 0.006) * L
  const beltRear = GROUND - (s.deck - 0.012) * L
  const inset = 9
  const aTop = mid ? top[4] : top[5]
  const peak = mid ? top[5] : top[6]
  const cEnd = mid ? top[6] : top[7]
  const cPillar: Pt = [front - (roofEnd + (mid ? 0.075 : 0.07)) * L, beltRear - 3]
  const glass: Pt[] = [
    [cowl[0] - 10, beltFront + 2],
    [cowl[0] - 22, cowl[1] - 4 + inset * 0.6],
    [aTop[0] - 4, aTop[1] + inset],
    [peak[0], peak[1] + inset],
    [cEnd[0] + 6, cEnd[1] + inset + 1],
    cPillar,
  ]
  const shoulder: Pt[] = [
    [xf + R * 0.6, GROUND - (fender - 0.024) * L],
    [xf - R * 1.4, GROUND - (fender - 0.04) * L],
    [(xf + xr) / 2, GROUND - (fender - 0.05) * L],
    [xr + R * 1.3, GROUND - (s.deck - 0.05) * L],
    [xr - R * 0.4, GROUND - (s.deck - 0.03) * L],
    [rear + L * 0.03, GROUND - (s.tail - 0.022) * L],
  ]
  return {
    L,
    front,
    rear,
    xf,
    xr,
    R,
    arch: R + 7,
    sill: GROUND - Math.max(28, R * 0.42),
    top,
    glass,
    shoulder,
    horizon: GROUND - (fender - 0.075) * L,
    cowl,
    roofY,
    tailTop: top[top.length - 1],
    canopy: [cowl, aTop, peak, cEnd],
  }
}

/** The whole body's outline: top line, tail, sills with both wheel arches, the nose. */
function bodyPath(g: Layout): string {
  const { front, rear, xf, xr, R, arch, sill, top, L } = g
  const tail = top[top.length - 1]
  const nose = top[0]
  const archY = GROUND - R
  const dy = sill - archY
  const dx = Math.sqrt(Math.max(0, arch * arch - dy * dy))
  return [
    moveTo(nose),
    spline(top, 0.5),
    // The tail: a short, undercut rear face down to the diffuser.
    `C${r1(tail[0] - 8)} ${r1(tail[1] + 10)} ${r1(rear - 4)} ${r1(GROUND - L * 0.085)} ${r1(rear + 10)} ${r1(GROUND - L * 0.052)}`,
    `C${r1(rear + 12)} ${r1(sill + 2)} ${r1(rear + 30)} ${r1(sill + 4)} ${r1(rear + 50)} ${r1(sill + 3)}`,
    `L${r1(xr - dx)} ${r1(sill)}`,
    `A${r1(arch)} ${r1(arch)} 0 0 1 ${r1(xr + dx)} ${r1(sill)}`,
    `L${r1(xf - dx)} ${r1(sill)}`,
    `A${r1(arch)} ${r1(arch)} 0 0 1 ${r1(xf + dx)} ${r1(sill)}`,
    `L${r1(front - 46)} ${r1(sill + 2)}`,
    // The nose: the bumper's lower lip, then up to the tip.
    `C${r1(front - 18)} ${r1(sill + 3)} ${r1(front - 2)} ${r1(GROUND - L * 0.04)} ${r1(nose[0])} ${r1(nose[1])}`,
    'Z',
  ].join('')
}

function glassPath(g: Layout): string {
  const p = g.glass
  const last = p[p.length - 1]
  // Back along the beltline, rising gently to the rear.
  return `${moveTo(p[0])}${spline(p, 0.45)}C${r1(last[0] + 80)} ${r1(last[1] + 2)} ${r1(p[0][0] - 90)} ${r1(p[0][1] + 2)} ${r1(p[0][0])} ${r1(p[0][1])}Z`
}

// ─── Wheels ──────────────────────────────────────────────────────────────────

const RIM_METAL: Record<CarShape['rimFinish'], [string, string, string]> = {
  silver: ['#F4F6F9', '#AEB5BF', '#59606A'],
  graphite: ['#A3A9B3', '#50555E', '#22252B'],
  black: ['#62666E', '#24262B', '#0C0D10'],
  bronze: ['#EAC896', '#A97A44', '#4C3318'],
  gold: ['#FFF2BF', '#D9AB3F', '#6B4A10'],
}

function spokes(kind: CarShape['rim'], r: number, hub: number): string {
  const out: string[] = []
  const poly = (pts: Pt[]) => `M${pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L')}Z`
  const at = (a: number, d: number): Pt => [Math.cos(a) * d, Math.sin(a) * d]
  const n = kind === 'five' ? 5 : kind === 'seven' ? 7 : kind === 'ten' ? 10 : kind === 'y' ? 5 : 12
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    if (kind === 'turbine') {
      const w = 0.12
      const p = (da: number, d: number) => at(a + da, d)
      const [a0, a1, a2, a3, a4, a5] = [p(-w, hub), p(0.22, r * 0.6), p(0.4, r), p(0.58, r), p(0.33, r * 0.55), p(w, hub)]
      out.push(`M${r1(a0[0])} ${r1(a0[1])}Q${r1(a1[0])} ${r1(a1[1])} ${r1(a2[0])} ${r1(a2[1])}L${r1(a3[0])} ${r1(a3[1])}Q${r1(a4[0])} ${r1(a4[1])} ${r1(a5[0])} ${r1(a5[1])}Z`)
    } else if (kind === 'y') {
      const w = 0.075
      out.push(poly([at(a - w * 1.5, hub), at(a - w, r * 0.52), at(a - 0.22, r), at(a - 0.1, r), at(a, r * 0.62), at(a + 0.1, r), at(a + 0.22, r), at(a + w, r * 0.52), at(a + w * 1.5, hub)]))
    } else {
      const inner = kind === 'ten' ? 0.1 : kind === 'seven' ? 0.15 : 0.21
      const outer = kind === 'ten' ? 0.055 : kind === 'seven' ? 0.085 : 0.13
      out.push(poly([at(a - inner, hub), at(a - outer, r), at(a + outer, r), at(a + inner, hub)]))
    }
  }
  return out.join('')
}

function wheel(cx: number, s: CarShape, id: string, accent: string, turn: number): string {
  const R = s.wheelRadius
  const rim = R * 0.76
  const [, mid, lo] = RIM_METAL[s.rimFinish]
  const disc = rim * 0.84
  return `<g transform="translate(${r1(cx)} ${r1(GROUND - R)})">
    <circle r="${r1(R)}" fill="url(#${id}-tyre)"/>
    <circle r="${r1(R - 2.5)}" fill="none" stroke="#33363C" stroke-width="1.2" opacity="0.7"/>
    <circle r="${r1(rim + 1.5)}" fill="#060708"/>
    <circle r="${r1(disc)}" fill="url(#${id}-disc)"/>
    <circle r="${r1(disc * 0.72)}" fill="none" stroke="#2B2E33" stroke-width="${r1(disc * 0.1)}" stroke-dasharray="2 5" opacity="0.6"/>
    <path d="M${r1(-disc * 0.72)} ${r1(-disc * 0.66)}A${r1(disc * 0.98)} ${r1(disc * 0.98)} 0 0 1 ${r1(disc * 0.3)} ${r1(-disc * 0.93)}L${r1(disc * 0.2)} ${r1(-disc * 0.66)}A${r1(disc * 0.7)} ${r1(disc * 0.7)} 0 0 0 ${r1(-disc * 0.5)} ${r1(-disc * 0.46)}Z" fill="${accent}"/>
    <g transform="rotate(${turn})"><path d="${spokes(s.rim, rim * 0.96, rim * 0.22)}" fill="url(#${id}-rim)" stroke="${lo}" stroke-width="0.7"/></g>
    <circle r="${r1(rim * 0.98)}" fill="none" stroke="url(#${id}-lip)" stroke-width="${r1(rim * 0.075)}"/>
    <circle r="${r1(rim * 0.2)}" fill="url(#${id}-rim)" stroke="${lo}" stroke-width="1"/>
    <circle r="${r1(rim * 0.08)}" fill="${mid}"/>
    <path d="M${r1(-R * 0.86)} ${r1(-R * 0.2)}A${r1(R * 0.88)} ${r1(R * 0.88)} 0 0 1 ${r1(-R * 0.2)} ${r1(-R * 0.86)}" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="2"/>
  </g>`
}

// ─── The picture ─────────────────────────────────────────────────────────────

/** The calipers' and stripe's colour: one that suits the paint. */
function accentFor(paint: string, rarity: ArtRarity): string {
  if (rarity === 'legendary') return '#E2B455'
  const lum = luminance(paint)
  const [r, g, b] = rgb(paint)
  if (lum > 0.55) return '#C8312F'
  if (r > b + 40 && r > g) return '#EDE6D6'
  if (g > r && g >= b) return '#F2C14E'
  return '#F06A3B'
}

/**
 * The card's car as a whole SVG document (1200 × 520). `silhouette` draws
 * the shape alone in shadow with a faint rim light: a card not collected
 * yet (no colour, no details).
 */
export function garageCarSvg(input: CarArtInput, options: { silhouette?: boolean } = {}): string {
  const s = carShape(input)
  const g = layout(s)
  const id = `c${input.number}`
  const dark = input.tone === 'dark'
  const L = g.L
  const R = g.R
  const body = bodyPath(g)
  const topLine = `${moveTo(g.top[0])}${spline(g.top, 0.5)}`

  const defsCommon = `
    <filter id="${id}-blur" x="-20%" y="-150%" width="140%" height="400%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="${id}-contact" x="-30%" y="-300%" width="160%" height="700%"><feGaussianBlur stdDeviation="4"/></filter>`
  const shadows = `
  <ellipse cx="${r1((g.front + g.rear) / 2)}" cy="${GROUND + 3}" rx="${r1(L * 0.5)}" ry="18" fill="#000" opacity="${dark ? 0.75 : 0.34}" filter="url(#${id}-blur)"/>
  <ellipse cx="${r1(g.xf)}" cy="${GROUND}" rx="${r1(R * 0.9)}" ry="6" fill="#000" opacity="0.9" filter="url(#${id}-contact)"/>
  <ellipse cx="${r1(g.xr)}" cy="${GROUND}" rx="${r1(R * 0.9)}" ry="6" fill="#000" opacity="0.9" filter="url(#${id}-contact)"/>`

  if (options.silhouette) {
    const fill = dark ? '#16171B' : '#C3C7CE'
    const wheelFill = dark ? '#0B0C0E' : '#A9AEB6'
    const edge = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)'
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>${defsCommon}
    <linearGradient id="${id}-sil" x1="0" y1="${r1(g.roofY)}" x2="0" y2="${GROUND}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${dark ? '#202228' : '#B3B8C0'}"/><stop offset="1" stop-color="${fill}"/>
    </linearGradient>
  </defs>${shadows}
  <circle cx="${r1(g.xf)}" cy="${r1(GROUND - R)}" r="${r1(g.arch)}" fill="${wheelFill}"/>
  <circle cx="${r1(g.xr)}" cy="${r1(GROUND - R)}" r="${r1(g.arch)}" fill="${wheelFill}"/>
  <path d="${body}" fill="url(#${id}-sil)"/>
  <circle cx="${r1(g.xf)}" cy="${r1(GROUND - R)}" r="${r1(R)}" fill="${wheelFill}"/>
  <circle cx="${r1(g.xr)}" cy="${r1(GROUND - R)}" r="${r1(R)}" fill="${wheelFill}"/>
  <path d="${topLine}" fill="none" stroke="${edge}" stroke-width="2"/>
</svg>`
  }

  const paint = /^#[0-9a-f]{6}$/i.test(input.paint) ? input.paint : '#8A9099'
  const lum = luminance(paint)
  const pale = lum > 0.5
  const accent = accentFor(paint, input.rarity)
  const glass = glassPath(g)
  const [hi, mid, lo] = RIM_METAL[s.rimFinish]
  const black = '#0E0F12'

  // Studio paint, by height: sky on the upper surfaces, the paint itself
  // under the shoulder, a sharp horizon line in the flank's reflection, the
  // floor's darker reflection below it, and a lighter band just over the sills.
  const span = GROUND - g.roofY
  const at = (y: number) => Math.min(1, Math.max(0, (y - g.roofY) / span)).toFixed(3)
  const sky = pale ? lighten(paint, 0.7) : lighten(paint, 0.5)
  const upper = pale ? lighten(paint, 0.35) : lighten(paint, 0.22)
  const flank = pale ? paint : lighten(paint, 0.06)
  const below = darken(paint, pale ? 0.28 : 0.42)
  const deep = darken(paint, pale ? 0.42 : 0.62)
  const floor = darken(paint, pale ? 0.2 : 0.38)
  const shoulderY = yAt(g.shoulder, (g.xf + g.xr) / 2)
  const paintStops = [
    [0, sky],
    [at(g.cowl[1] + 4), upper],
    [at(shoulderY - 6), lighten(flank, 0.1)],
    [at(shoulderY + 4), flank],
    [at(g.horizon - 14), flank],
    [at(g.horizon - 1.5), mix(flank, '#ffffff', pale ? 0.3 : 0.32)],
    [at(g.horizon + 1), below],
    [at((g.horizon + g.sill) / 2), deep],
    [at(g.sill - 12), floor],
    [at(g.sill - 5), mix(floor, '#ffffff', 0.12)],
    [1, darken(paint, 0.85)],
  ]
    .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
    .join('')

  const nose = g.top[0]
  const headlight = (() => {
    const p1 = g.top[1]
    const dx = p1[0] - nose[0]
    const dy = p1[1] - nose[1]
    const pt = (t: number, off: number): Pt => [nose[0] + dx * t, nose[1] + dy * t + off]
    if (s.headlight === 'split') {
      const a = pt(0.12, 5), b = pt(0.85, 3), c = pt(0.85, 7), d = pt(0.1, 9)
      const e = pt(0.2, 15), f = pt(0.6, 13)
      return `<path d="M${a.map(r1).join(' ')}L${b.map(r1).join(' ')}L${c.map(r1).join(' ')}L${d.map(r1).join(' ')}Z" fill="#fff"/><path d="M${e.map(r1).join(' ')}L${f.map(r1).join(' ')}" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`
    }
    if (s.headlight === 'arrow') {
      const a = pt(0.08, 4), b = pt(1.05, 1), c = pt(0.6, 7), d = pt(0.75, 12)
      return `<path d="M${a.map(r1).join(' ')}L${b.map(r1).join(' ')}L${c.map(r1).join(' ')}L${d.map(r1).join(' ')}Z" fill="#fff"/>`
    }
    const a = pt(0.06, 4), b = pt(1.15, 2), c = pt(1.15, 6), d = pt(0.06, 9)
    return `<path d="M${a.map(r1).join(' ')}L${b.map(r1).join(' ')}L${c.map(r1).join(' ')}L${d.map(r1).join(' ')}Z" fill="#fff"/>`
  })()

  const tailTop = g.tailTop
  const tailLamp = `<path d="M${r1(tailTop[0] - 3)} ${r1(tailTop[1] + 6)}L${r1(tailTop[0] + 46)} ${r1(yAt(g.top, tailTop[0] + 46) + 3)}L${r1(tailTop[0] + 46)} ${r1(yAt(g.top, tailTop[0] + 46) + 7)}L${r1(tailTop[0] - 1)} ${r1(tailTop[1] + 11)}Z" fill="#FF3D33"/>`

  const intake = (() => {
    if (s.family === 'front') {
      // A long bonnet: one long vent behind the front wheel instead of an engine intake.
      const x = g.xf - R - 18
      const y = (shoulderY + g.sill) / 2 - 2
      return `<path d="M${r1(x)} ${r1(y - 18)}C${r1(x - 40)} ${r1(y - 10)} ${r1(x - 90)} ${r1(y + 2)} ${r1(x - 150)} ${r1(y + 6)}L${r1(x - 150)} ${r1(y + 10)}C${r1(x - 80)} ${r1(y + 8)} ${r1(x - 30)} ${r1(y + 2)} ${r1(x + 4)} ${r1(y - 8)}Z" fill="url(#${id}-intake)"/><path d="M${r1(x)} ${r1(y - 18)}C${r1(x - 40)} ${r1(y - 10)} ${r1(x - 90)} ${r1(y + 2)} ${r1(x - 150)} ${r1(y + 6)}" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="1" transform="translate(0 -1.5)"/>`
    }
    const x0 = g.glass[g.glass.length - 1][0] + 18
    const y0 = shoulderY + 10
    const x1 = g.xr + R + 14
    const y1 = g.sill - 14
    if (s.intake === 'scoop') {
      return `<path d="M${r1(x0)} ${r1(y0)}C${r1(x0 - 50)} ${r1(y0 + 6)} ${r1(x1 + 20)} ${r1(y1 - 34)} ${r1(x1)} ${r1(y1)}L${r1(x1 + 30)} ${r1(y1 - 4)}C${r1(x1 + 70)} ${r1(y1 - 40)} ${r1(x0 + 16)} ${r1(y0 + 26)} ${r1(x0)} ${r1(y0)}Z" fill="url(#${id}-intake)"/>`
    }
    if (s.intake === 'twin') {
      return `<path d="M${r1(x0)} ${r1(y0)}L${r1(x1 + 4)} ${r1(y0 + 24)}L${r1(x1 + 8)} ${r1(y0 + 32)}L${r1(x0 - 18)} ${r1(y0 + 12)}Z" fill="url(#${id}-intake)"/><path d="M${r1(x0 - 26)} ${r1(y0 + 34)}L${r1(x1 + 6)} ${r1(y1 - 12)}L${r1(x1 + 12)} ${r1(y1 - 3)}L${r1(x0 - 48)} ${r1(y0 + 46)}Z" fill="url(#${id}-intake)"/>`
    }
    return `<path d="M${r1(x0)} ${r1(y0)}C${r1(x0 - 80)} ${r1(y0 + 4)} ${r1(x1 + 50)} ${r1(y1 - 20)} ${r1(x1)} ${r1(y1)}L${r1(x1 + 24)} ${r1(y1 - 2)}C${r1(x1 + 80)} ${r1(y1 - 30)} ${r1(x0 - 20)} ${r1(y0 + 16)} ${r1(x0)} ${r1(y0)}Z" fill="url(#${id}-intake)"/>`
  })()

  const wing = (() => {
    const t = tailTop
    if (s.wing === 'ducktail') {
      const x2 = t[0] + 70
      return `<path d="M${r1(t[0] - 6)} ${r1(t[1] + 2)}C${r1(t[0] - 2)} ${r1(t[1] - 14)} ${r1(t[0] + 30)} ${r1(t[1] - 12)} ${r1(x2)} ${r1(yAt(g.top, x2) - 1)}L${r1(x2 + 10)} ${r1(yAt(g.top, x2 + 10) + 2)}C${r1(t[0] + 30)} ${r1(t[1] - 2)} ${r1(t[0] + 6)} ${r1(t[1] + 2)} ${r1(t[0] - 6)} ${r1(t[1] + 8)}Z" fill="url(#${id}-paint)"/><path d="M${r1(t[0] - 4)} ${r1(t[1] - 1)}C${r1(t[0] + 4)} ${r1(t[1] - 12)} ${r1(t[0] + 30)} ${r1(t[1] - 11)} ${r1(x2)} ${r1(yAt(g.top, x2) - 1)}" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.7 : 0.85}" stroke-width="1.6"/>`
    }
    if (s.wing === 'none') return ''
    const wx0 = t[0] + 4
    const wx1 = t[0] + L * 0.15
    const wy = Math.min(t[1], yAt(g.top, wx1)) - 26
    const legX = s.wing === 'fixed' ? [t[0] + L * 0.04, t[0] + L * 0.11] : [t[0] + L * 0.06]
    const legs = legX
      .map((x) => {
        const base = yAt(g.top, x) + 2
        return s.wing === 'fixed'
          ? `<path d="M${r1(x - 6)} ${r1(base)}L${r1(x - 1)} ${r1(wy + 6)}L${r1(x + 9)} ${r1(wy + 6)}L${r1(x + 8)} ${r1(base)}Z" fill="url(#${id}-carbon)"/>`
          : `<path d="M${r1(x)} ${r1(base)}C${r1(x - 10)} ${r1(wy + 20)} ${r1(x - 4)} ${r1(wy - 14)} ${r1(x + 12)} ${r1(wy - 6)}L${r1(x + 16)} ${r1(wy - 2)}C${r1(x + 2)} ${r1(wy - 6)} ${r1(x)} ${r1(wy + 20)} ${r1(x + 8)} ${r1(base)}Z" fill="${black}"/>`
      })
      .join('')
    const blade = `<path d="M${r1(wx0)} ${r1(wy + 3)}C${r1(wx0 + 50)} ${r1(wy - 9)} ${r1(wx1 - 40)} ${r1(wy - 8)} ${r1(wx1)} ${r1(wy - 1)}L${r1(wx1 - 2)} ${r1(wy + 6)}C${r1(wx1 - 60)} ${r1(wy + 3)} ${r1(wx0 + 40)} ${r1(wy + 9)} ${r1(wx0)} ${r1(wy + 11)}Z" fill="url(#${id}-carbon)"/><path d="M${r1(wx0 + 4)} ${r1(wy + 2)}C${r1(wx0 + 50)} ${r1(wy - 8)} ${r1(wx1 - 40)} ${r1(wy - 7)} ${r1(wx1 - 4)} ${r1(wy - 1)}" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.6 : 0.45}" stroke-width="1.6"/><path d="M${r1(wx0 - 2)} ${r1(wy - 2)}L${r1(wx0 + 3)} ${r1(wy - 2)}L${r1(wx0 + 4)} ${r1(wy + 16)}L${r1(wx0 - 1)} ${r1(wy + 14)}Z" fill="${black}"/>`
    return legs + blade
  })()

  const stripe = (() => {
    if (s.stripe === 'none') return ''
    const p = g.shoulder.map(([x, y]) => [x, y + 16] as Pt)
    if (s.stripe === 'pin') return `<path d="${moveTo(p[0])}${spline(p, 0.5)}" fill="none" stroke="${accent}" stroke-width="2.4" opacity="0.95"/>`
    return `<path d="${moveTo(p[0])}${spline(p, 0.5)}" fill="none" stroke="${accent}" stroke-width="9" opacity="0.9"/>`
  })()

  const shoulderLine = `${moveTo(g.shoulder[0])}${spline(g.shoulder, 0.5)}`
  const doorX = s.family === 'mid' ? g.glass[g.glass.length - 1][0] + 14 : g.glass[g.glass.length - 1][0] + 6
  const doorLine = `<path d="M${r1(doorX)} ${r1(g.glass[g.glass.length - 1][1] + 4)}C${r1(doorX + 8)} ${r1(shoulderY + 30)} ${r1(doorX - 6)} ${r1(g.sill - 34)} ${r1(doorX + 4)} ${r1(g.sill - 2)}" fill="none" stroke="${darken(paint, 0.7)}" stroke-width="1.5" opacity="0.75"/>`
  const mirrorBase: Pt = [g.glass[0][0] - 6, g.glass[0][1] - 6]
  const mirror = `<path d="M${r1(mirrorBase[0] + 4)} ${r1(mirrorBase[1] + 4)}L${r1(mirrorBase[0] - 10)} ${r1(mirrorBase[1] - 10)}" stroke="${black}" stroke-width="3"/><path d="M${r1(mirrorBase[0] - 4)} ${r1(mirrorBase[1] - 12)}c-4 -9 -28 -10 -34 -1c-3 5 1 9 7 9l22 0c5 0 7 -3 5 -8z" fill="url(#${id}-paint)" stroke="${darken(paint, 0.5)}" stroke-width="0.8"/>`

  const sideTrim = s.carbon
    ? `<path d="M${r1(g.rear + 48)} ${r1(g.sill + 3)}L${r1(g.front - 48)} ${r1(g.sill + 2)}L${r1(g.front - 56)} ${r1(g.sill - 12)}L${r1(g.rear + 56)} ${r1(g.sill - 10)}Z" fill="url(#${id}-carbon)"/>`
    : `<path d="M${r1(g.xr + R + 8)} ${r1(g.sill + 2)}L${r1(g.xf - R - 8)} ${r1(g.sill + 2)}L${r1(g.xf - R - 12)} ${r1(g.sill - 6)}L${r1(g.xr + R + 12)} ${r1(g.sill - 6)}Z" fill="${black}"/>`
  const splitter = `<path d="M${r1(g.front - 70)} ${r1(g.sill + 1)}L${r1(g.front + 6)} ${r1(g.sill + 2)}L${r1(g.front + 8)} ${r1(g.sill + 6)}L${r1(g.front - 72)} ${r1(g.sill + 7)}Z" fill="${s.carbon ? `url(#${id}-carbon)` : black}"/>`
  const diffuser = `<path d="M${r1(g.rear + 8)} ${r1(GROUND - L * 0.055)}L${r1(g.rear + 64)} ${r1(g.sill + 2)}L${r1(g.rear + 64)} ${r1(g.sill + 8)}L${r1(g.rear + 4)} ${r1(GROUND - L * 0.05)}Z" fill="${black}"/>`

  // Fender tops catch the softbox: two long, soft hot spots.
  const hotFront: Pt = [g.xf - R * 0.1, yAt(g.top, g.xf - R * 0.1) + 10]
  const hotRear: Pt = [g.xr + R * 0.3, yAt(g.shoulder, g.xr + R * 0.3) + 4]

  const car = `
    <circle cx="${r1(g.xf)}" cy="${r1(GROUND - R)}" r="${r1(g.arch)}" fill="#050506"/>
    <circle cx="${r1(g.xr)}" cy="${r1(GROUND - R)}" r="${r1(g.arch)}" fill="#050506"/>
    <path d="${body}" fill="url(#${id}-paint)"/>
    <g clip-path="url(#${id}-clip)">
      <path d="${body}" fill="url(#${id}-side)"/>
      <ellipse cx="${r1(hotFront[0])}" cy="${r1(hotFront[1])}" rx="${r1(R * 1.5)}" ry="9" fill="#fff" opacity="${pale ? 0.75 : 0.5}" filter="url(#${id}-soft)"/>
      <ellipse cx="${r1(hotRear[0])}" cy="${r1(hotRear[1])}" rx="${r1(R * 1.7)}" ry="8" fill="#fff" opacity="${pale ? 0.7 : 0.42}" filter="url(#${id}-soft)"/>
      <path d="${shoulderLine}" fill="none" stroke="${darken(paint, 0.45)}" stroke-width="5" opacity="0.5" filter="url(#${id}-hair)" transform="translate(0 4)"/>
      <path d="${shoulderLine}" fill="none" stroke="#fff" stroke-width="1.6" opacity="${pale ? 0.9 : 0.6}"/>
      ${stripe}
      ${intake}
      ${doorLine}
      <circle cx="${r1(g.xf)}" cy="${r1(GROUND - R)}" r="${r1(g.arch + 2)}" fill="none" stroke="${darken(paint, 0.7)}" stroke-width="4" opacity="0.55" filter="url(#${id}-hair)"/>
      <circle cx="${r1(g.xr)}" cy="${r1(GROUND - R)}" r="${r1(g.arch + 2)}" fill="none" stroke="${darken(paint, 0.7)}" stroke-width="4" opacity="0.55" filter="url(#${id}-hair)"/>
    </g>
    ${sideTrim}${splitter}${diffuser}
    ${s.blackRoof ? `<path d="${moveTo(g.glass[0])}L${r1(g.canopy[0][0])} ${r1(g.canopy[0][1])}${spline(g.canopy, 0.5)}L${r1(g.glass[g.glass.length - 1][0] - 6)} ${r1(g.glass[g.glass.length - 1][1] + 2)}Z" fill="url(#${id}-roof)"/>` : ''}
    <path d="${glass}" fill="url(#${id}-glass)"/>
    <g clip-path="url(#${id}-glassclip)">
      <path d="M${r1(g.glass[2][0] + 10)} ${r1(g.roofY)}L${r1(g.glass[2][0] + 46)} ${r1(g.roofY)}L${r1(g.glass[2][0] - 40)} ${r1(g.glass[0][1] + 4)}L${r1(g.glass[2][0] - 76)} ${r1(g.glass[0][1] + 4)}Z" fill="#fff" opacity="0.16"/>
      <path d="M${r1(g.glass[2][0] + 60)} ${r1(g.roofY)}L${r1(g.glass[2][0] + 70)} ${r1(g.roofY)}L${r1(g.glass[2][0] - 16)} ${r1(g.glass[0][1] + 4)}L${r1(g.glass[2][0] - 26)} ${r1(g.glass[0][1] + 4)}Z" fill="#fff" opacity="0.1"/>
      <path d="${moveTo(g.glass[1])}${spline(g.glass.slice(1, 5), 0.45)}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="3" transform="translate(0 4)"/>
    </g>
    <path d="${glass}" fill="none" stroke="${darken(paint, 0.75)}" stroke-width="2"/>
    ${mirror}
    ${wing}
    <g filter="url(#${id}-glow)" opacity="0.9">${headlight}${tailLamp}</g>
    ${headlight}${tailLamp}
    <path d="${topLine}" fill="none" stroke="url(#${id}-rimlight)" stroke-width="${dark ? 2.4 : 1.8}"/>
    ${wheel(g.xr, s, id, accent, -14)}
    ${wheel(g.xf, s, id, accent, 11)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>${defsCommon}
    <linearGradient id="${id}-paint" x1="0" y1="${r1(g.roofY)}" x2="0" y2="${GROUND}" gradientUnits="userSpaceOnUse">${paintStops}</linearGradient>
    <linearGradient id="${id}-side" x1="${r1(g.rear)}" y1="0" x2="${r1(g.front)}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000" stop-opacity="0.5"/>
      <stop offset="0.12" stop-color="#000" stop-opacity="0.08"/>
      <stop offset="0.45" stop-color="#fff" stop-opacity="0.07"/>
      <stop offset="0.88" stop-color="#000" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="${id}-rimlight" x1="${r1(g.rear)}" y1="0" x2="${r1(g.front)}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.12" stop-color="#fff" stop-opacity="${dark ? 0.7 : 0.9}"/>
      <stop offset="0.85" stop-color="#fff" stop-opacity="${dark ? 0.75 : 0.95}"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}-glass" x1="0" y1="${r1(g.roofY)}" x2="0" y2="${r1(g.glass[0][1])}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${dark ? '#3A4150' : '#4A5263'}"/>
      <stop offset="0.5" stop-color="#151820"/>
      <stop offset="1" stop-color="#050608"/>
    </linearGradient>
    <linearGradient id="${id}-roof" x1="0" y1="${r1(g.roofY)}" x2="0" y2="${r1(g.glass[0][1])}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5A5F69"/><stop offset="0.25" stop-color="#1C1E23"/><stop offset="1" stop-color="#0A0B0D"/>
    </linearGradient>
    <linearGradient id="${id}-intake" x1="0" y1="${r1(shoulderY)}" x2="0" y2="${r1(g.sill)}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#202228"/><stop offset="1" stop-color="#050506"/>
    </linearGradient>
    <linearGradient id="${id}-carbon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2E3036"/><stop offset="0.5" stop-color="#121317"/><stop offset="1" stop-color="#24262B"/>
    </linearGradient>
    <radialGradient id="${id}-tyre" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.72" stop-color="#18191C"/><stop offset="0.94" stop-color="#0A0B0D"/><stop offset="1" stop-color="#2A2C31"/>
    </radialGradient>
    <radialGradient id="${id}-disc" cx="0.42" cy="0.36" r="0.72">
      <stop offset="0" stop-color="#6A6F77"/><stop offset="0.7" stop-color="#2E3136"/><stop offset="1" stop-color="#16181B"/>
    </radialGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${hi}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/>
    </linearGradient>
    <linearGradient id="${id}-lip" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${hi}"/><stop offset="0.5" stop-color="${lo}"/><stop offset="1" stop-color="${mid}"/>
    </linearGradient>
    <linearGradient id="${id}-fade" x1="0" y1="${GROUND}" x2="0" y2="${GROUND + 130}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="${id}-mask" maskUnits="userSpaceOnUse" x="0" y="${GROUND}" width="${W}" height="${H - GROUND}">
      <rect x="0" y="${GROUND}" width="${W}" height="${H - GROUND}" fill="url(#${id}-fade)"/>
    </mask>
    <clipPath id="${id}-clip"><path d="${body}"/></clipPath>
    <clipPath id="${id}-glassclip"><path d="${glass}"/></clipPath>
    <filter id="${id}-soft" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="${id}-hair" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>
    <filter id="${id}-glow" x="-50%" y="-300%" width="200%" height="700%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <g mask="url(#${id}-mask)" opacity="${dark ? 0.24 : 0.16}">
    <g transform="translate(0 ${GROUND * 2}) scale(1 -1)">${car}</g>
  </g>${shadows}
  ${car}
</svg>`
}

/** The picture as a data URL, for an <img> or a canvas. */
export function garageCarDataUrl(input: CarArtInput, options: { silhouette?: boolean } = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(garageCarSvg(input, options))}`
}
