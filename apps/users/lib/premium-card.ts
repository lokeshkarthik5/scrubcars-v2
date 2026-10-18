import type { GiftDesign } from '@repo/core/api/gifts'
import { PHOTO_ASPECT, pickCardCar, type CardCar, type CardCarTone } from '@repo/core/card-cars'
import { istMonth, pickCarCareTip } from '@repo/core/car-care-tips'
import { rewardDay, rewardRupees, type ScratchOutcome } from '@repo/core/rewards'
import { giftArtFor, giftRupees, type GiftArt } from './gifts'
import { prizeTier, type PrizeTier } from './scratch-prize'

/**
 * Premium cards: Detlio's gift cards and revealed scratch-card prizes, drawn
 * as collectible car cards (a light "gallery" card, or the darker "night"
 * one) that read well on a phone and as an Instagram image. Pure, so the
 * words are unit-tested and the screen (components/premium-card) and the
 * shared image (lib/premium-card-image.ts) draw exactly the same card from
 * the same numbers.
 *
 * Every length here is in card units: the card is 100 wide and CARD.height
 * tall, whatever its size on screen (CSS container units) or in the image
 * (pixels ÷ 100).
 *
 * The car is a licensed photo (public/cards/cars, CREDITS.md) with every
 * badge retouched out, picked for good per card from the photos of the
 * card's tone (packages/core/src/card-cars.ts). No card names, badges or
 * hints at a make or model: the chips describe the gift, never the car.
 */

export type CardLook = GiftArt | 'prize_silver' | 'prize_gold' | 'prize_star' | 'prize_jackpot'
export type CardTone = 'gallery' | 'night'
export type ChipIcon = 'gift' | 'user' | 'calendar' | 'sparkles' | 'star' | 'pin' | 'ticket' | 'confetti' | 'heart' | 'flame' | 'clock'

export interface CardChip {
  icon: ChipIcon
  text: string
  /** The one chip that gives way (cut with "…") when the row is too long: a name. */
  fluid?: boolean
}

export interface PremiumCardSpec {
  look: CardLook
  /** The photo on the card, picked for good from the photos of its tone. */
  car: CardCar
  chips: CardChip[]
  /** Line one in ink, line two in grey: "Happy Diwali" / "₹2,000 of car care". */
  title: [string, string]
  tip: string
}

/** The card's layout, in card units (100 wide). */
export const CARD = {
  height: 132,
  radius: 3.6,
  pad: 6.4,
  mark: { x: 6.4, y: 6.6, size: 3.9 },
  chips: { top: 77.4, height: 6.8, font: 2.85, icon: 3, padX: 2.2, gap: 1.4, iconGap: 1 },
  title: { top: 89.4, size: 8.2, line: 8.9, maxWidth: 87.2 },
  tip: { top: 110.6, size: 3.3, line: 4.85, lines: 3, labelGap: 1.4 },
} as const

/**
 * The photo: across the top of the card, edge to edge and flush with the
 * top, its own height at the files' aspect (16:13). Its lower part fades
 * into the card's ground, so it reads as the card's hero image (the chips
 * sit on the faded edge), and its top edge softens a little. A soft wash behind the wordmark keeps it legible
 * on any photo.
 */
export const PHOTO = {
  height: 100 / PHOTO_ASPECT,
  /**
   * The fade's stops down the photo: [share of its height, opacity]. The
   * top edge softens a little into the card too, under the wordmark.
   */
  fade: [
    [0, 0.42],
    [0.13, 0.84],
    [0.24, 1],
    [0.6, 1],
    [0.76, 0.78],
    [0.89, 0.3],
    [1, 0],
  ] as ReadonlyArray<readonly [number, number]>,
  /** The wash behind the wordmark: an ellipse, centre and radii in card units. */
  wash: { x: 12, y: 6.4, rx: 34, ry: 17 },
} as const

/** A card's tone picks its photos: light cards get light photos, Night cards dark ones. */
export const PHOTO_TONE: Record<CardTone, CardCarTone> = { gallery: 'light', night: 'dark' }

export interface LookStyle {
  tone: CardTone
  /** The card's ground, top to bottom. */
  ground: [string, string, string]
  /** The light behind the car (a soft radial). */
  light: string
  /** A second, coloured light high on the card, or null. */
  glow: { x: number; y: number; color: string } | null
  /** A colour laid over the photo in soft light (Diwali's gold), or null. */
  tint: string | null
  /** The wash behind the wordmark. */
  wash: string
  accent: 'confetti' | 'sparks' | 'ribbon' | null
  /** The sparks' colour, where there are sparks. */
  spark?: string
  /** The share image's backdrop around the card: centre, edge. */
  backdrop: [string, string]
}

const GALLERY_GROUND: [string, string, string] = ['#F6F7F8', '#ECEDF0', '#E3E5E9']

const LIGHT_WASH = 'rgba(246,247,248,0.72)'
const DARK_WASH = 'rgba(8,9,11,0.78)'
const NIGHT_GROUND: [string, string, string] = ['#1E2026', '#131418', '#0B0C0E']
/** Diwali and the jackpot: Night cards lit warm, with gold sparks. */
const WARM_GROUND: [string, string, string] = ['#261B0F', '#171009', '#0C0805']

export const LOOKS: Record<CardLook, LookStyle> = {
  shine: { tone: 'gallery', ground: GALLERY_GROUND, light: 'rgba(255,255,255,0.95)', glow: null, tint: null, wash: LIGHT_WASH, accent: null, backdrop: ['#F1F2F4', '#CDD0D6'] },
  midnight: { tone: 'night', ground: NIGHT_GROUND, light: 'rgba(150,165,195,0.30)', glow: { x: 78, y: 10, color: 'rgba(120,140,190,0.22)' }, tint: 'rgba(110,130,190,0.35)', wash: DARK_WASH, accent: null, backdrop: ['#1C1D22', '#050506'] },
  pearl: { tone: 'gallery', ground: ['#F8F6F3', '#EFEBE6', '#E6E1DA'], light: 'rgba(255,253,250,0.95)', glow: { x: 88, y: 6, color: 'rgba(214,222,255,0.55)' }, tint: 'rgba(255,232,206,0.45)', wash: 'rgba(248,246,243,0.72)', accent: null, backdrop: ['#F4F1ED', '#D6D0C8'] },
  birthday: { tone: 'gallery', ground: ['#F7F6F9', '#EEEDF2', '#E5E4EB'], light: 'rgba(255,255,255,0.95)', glow: { x: 86, y: 8, color: 'rgba(255,214,232,0.55)' }, tint: 'rgba(255,170,215,0.30)', wash: 'rgba(247,246,249,0.72)', accent: 'confetti', backdrop: ['#F3F1F6', '#D3D0DB'] },
  diwali: { tone: 'night', ground: WARM_GROUND, light: 'rgba(255,190,100,0.22)', glow: { x: 80, y: 4, color: 'rgba(255,176,72,0.30)' }, tint: 'rgba(255,158,56,0.60)', wash: 'rgba(14,9,4,0.78)', accent: 'sparks', spark: '#F2C46B', backdrop: ['#2B1E10', '#080503'] },
  thank_you: { tone: 'gallery', ground: ['#F4F6F7', '#EAEDEF', '#E0E4E7'], light: 'rgba(255,255,255,0.95)', glow: null, tint: null, wash: 'rgba(244,246,247,0.72)', accent: 'ribbon', backdrop: ['#EFF2F4', '#C9D0D5'] },
  prize_silver: { tone: 'gallery', ground: GALLERY_GROUND, light: 'rgba(255,255,255,0.95)', glow: null, tint: null, wash: LIGHT_WASH, accent: null, backdrop: ['#F1F2F4', '#CDD0D6'] },
  prize_gold: { tone: 'gallery', ground: ['#F9F4EA', '#F0E7D6', '#E7DBC3'], light: 'rgba(255,232,180,0.85)', glow: { x: 82, y: 6, color: 'rgba(255,206,120,0.40)' }, tint: 'rgba(255,212,130,0.40)', wash: 'rgba(249,244,234,0.72)', accent: null, backdrop: ['#F6EFE1', '#D8C7A4'] },
  prize_star: { tone: 'night', ground: NIGHT_GROUND, light: 'rgba(170,180,205,0.30)', glow: { x: 80, y: 8, color: 'rgba(220,225,236,0.18)' }, tint: 'rgba(170,185,220,0.30)', wash: DARK_WASH, accent: 'sparks', spark: '#DCE1EC', backdrop: ['#1C1D22', '#050506'] },
  prize_jackpot: { tone: 'night', ground: WARM_GROUND, light: 'rgba(255,200,110,0.22)', glow: { x: 80, y: 4, color: 'rgba(255,190,80,0.30)' }, tint: 'rgba(255,186,90,0.45)', wash: 'rgba(14,9,4,0.78)', accent: 'sparks', spark: '#F2C46B', backdrop: ['#2A1D0F', '#080503'] },
}

/** The words' colours on each tone. */
export const INKS: Record<CardTone, { title: string; sub: string; tip: string; label: string; chipBg: string; chipEdge: string; chipText: string; chipIcon: string; mark: string }> = {
  gallery: {
    title: '#0E0F12',
    sub: '#A1A5AD',
    tip: '#6B7079',
    label: '#0E0F12',
    chipBg: 'rgba(255,255,255,0.88)',
    chipEdge: 'rgba(14,15,18,0.08)',
    chipText: '#2A2D33',
    chipIcon: '#6B7079',
    mark: '#0E0F12',
  },
  night: {
    title: '#F6F7F9',
    sub: '#7E838D',
    tip: '#A4A9B2',
    label: '#F6F7F9',
    chipBg: 'rgba(255,255,255,0.07)',
    chipEdge: 'rgba(255,255,255,0.12)',
    chipText: '#E8EAEE',
    chipIcon: '#A4A9B2',
    mark: '#F6F7F9',
  },
}

/**
 * Birthday confetti, Diwali's sparks and Thank you's ribbon, in card units.
 * Soft gold, pink, silver and teal: never red (red is the page's button).
 */
export const CONFETTI: ReadonlyArray<{ x: number; y: number; w: number; h: number; r: number; c: string }> = [
  { x: 9, y: 22, w: 3.4, h: 1.3, r: 28, c: '#E9B85A' },
  { x: 16, y: 13, w: 1.5, h: 1.5, r: 0, c: '#EE8FB8' },
  { x: 24, y: 24, w: 3, h: 1.2, r: -34, c: '#9FB1C9' },
  { x: 12, y: 32, w: 1.3, h: 1.3, r: 0, c: '#4FC9B4' },
  { x: 31, y: 10, w: 2.8, h: 1.1, r: 62, c: '#4FC9B4' },
  { x: 40, y: 18, w: 1.4, h: 1.4, r: 0, c: '#E9B85A' },
  { x: 72, y: 85.5, w: 3, h: 1.2, r: -22, c: '#EE8FB8' },
  { x: 84, y: 80, w: 1.4, h: 1.4, r: 0, c: '#E9B85A' },
  { x: 93, y: 86, w: 2.8, h: 1.1, r: 48, c: '#4FC9B4' },
  { x: 88, y: 93, w: 1.2, h: 1.2, r: 0, c: '#9FB1C9' },
  { x: 79, y: 95.5, w: 2.6, h: 1, r: 18, c: '#E9B85A' },
  { x: 95, y: 99, w: 1.3, h: 1.3, r: 0, c: '#EE8FB8' },
]

export const SPARKS: ReadonlyArray<{ x: number; y: number; s: number; o: number }> = [
  { x: 14, y: 17, s: 2.6, o: 0.9 },
  { x: 24, y: 10, s: 1.5, o: 0.7 },
  { x: 33, y: 22, s: 1.1, o: 0.55 },
  { x: 90, y: 93, s: 2.1, o: 0.8 },
  { x: 95.5, y: 100, s: 1.1, o: 0.6 },
]

/** A four-point spark of size s at x, y, as a path. */
export function sparkPath(x: number, y: number, s: number): string {
  const k = s * 0.24
  return `M${x} ${y - s}Q${x + k} ${y - k} ${x + s} ${y}Q${x + k} ${y + k} ${x} ${y + s}Q${x - k} ${y + k} ${x - s} ${y}Q${x - k} ${y - k} ${x} ${y - s}Z`
}

/**
 * Thank you's satin ribbon: a sash across the top-right corner with a bow
 * on it, lit across its width like satin. Paths in card units, so the
 * screen (SVG) and the image (Path2D) draw the same ribbon.
 */
export const RIBBON = {
  band: 'M65 0L75 0L100 25L100 35Z',
  /** The satin's light runs across the band, edge to edge. */
  across: { from: [82.5, 17.5], to: [87.5, 12.5] } as { from: [number, number]; to: [number, number] },
  bow: [
    'M86.5 14.5C81 6.5 73.5 8.5 75.5 14C77 18 82 17.6 86.5 14.5Z',
    'M86.5 14.5C93.5 9.5 99.5 14 96 19C94 21.6 89.5 19.5 86.5 14.5Z',
    'M86.5 14.5L81.5 25L83.6 24.2L84.4 26.4Z',
    'M86.5 14.5L91 24.5L89 23.9L88 26Z',
  ],
  bowLight: { from: [86.5, 7], to: [86.5, 24] } as { from: [number, number]; to: [number, number] },
  knot: { x: 86.5, y: 14.5, r: 1.9 },
  stops: [
    [0, '#8E98A2'],
    [0.42, '#F6F8FA'],
    [0.62, '#D3D9DF'],
    [1, '#848E99'],
  ] as Array<[number, string]>,
}

/**
 * Tabler outline icons (MIT), in their 24-unit box, stroked at 2: the same
 * paths on screen (an <svg>) and in the image (Path2D).
 */
export const CHIP_ICON_PATHS: Record<ChipIcon, string[]> = {
  gift: [
    'M3 9a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1l0 -2',
    'M12 8l0 13',
    'M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7',
    'M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5',
  ],
  user: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2'],
  calendar: ['M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12', 'M16 3l0 4', 'M8 3l0 4', 'M4 11l16 0', 'M8 15h2v2h-2l0 -2'],
  sparkles: [
    'M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6',
  ],
  star: ['M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245'],
  pin: ['M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0', 'M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0'],
  ticket: ['M15 5l0 2', 'M15 11l0 2', 'M15 17l0 2', 'M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2'],
  confetti: ['M4 5h2', 'M5 4v2', 'M11.5 4l-.5 2', 'M18 5h2', 'M19 4v2', 'M15 9l-1 1', 'M18 13l2 -.5', 'M18 19h2', 'M19 18v2', 'M14 16.518l-6.518 -6.518l-4.39 9.58a1 1 0 0 0 1.329 1.329l9.579 -4.39'],
  heart: ['M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572'],
  flame: [
    'M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235',
  ],
  clock: ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 7v5l3 3'],
}

/** The label before the tip, small and bold. */
export const TIP_LABEL = 'Car care tip'

/**
 * A title line's size: the card's title size, smaller for a line longer
 * than 19 letters so it stays on one line ("Off your next booking").
 */
export function titleSize(line: string): number {
  return line.length > 19 ? (CARD.title.size * 19) / line.length : CARD.title.size
}

/** Figures and words apart, so figures can be set in the numeric face: "₹2,000 of car care". */
export const FIGURES = /(₹?\d[\d,.]*)/

/** A name's first word, for the card ("For Meena"), at most 14 letters. */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? ''
  return first.length > 14 ? `${first.slice(0, 13)}…` : first
}

const GIFT_TITLES: Record<GiftArt, string> = {
  shine: 'A gift for you',
  midnight: 'A gift for you',
  pearl: 'A gift for you',
  birthday: 'Happy birthday',
  diwali: 'Happy Diwali',
  thank_you: 'Thank you',
}

const OCCASION_CHIPS: Partial<Record<GiftArt, CardChip>> = {
  birthday: { icon: 'confetti', text: 'Birthday' },
  diwali: { icon: 'flame', text: 'Diwali' },
  thank_you: { icon: 'heart', text: 'Thank you' },
}

/**
 * A gift's card. The tip is picked from what the card shows and never
 * changes (its design, amount and the recipient's name) and the month it
 * was bought (the expiry's month: a gift lasts whole months), so the buyer's
 * preview, the share screen and the recipient's page show the same tip.
 * `showName: false` leaves the name off (the shared image, unless the
 * sharer turns it on); the tip stays the same either way. Never the code,
 * the link or the message.
 */
export function giftCardSpec(gift: {
  design: GiftDesign
  amount: string | number | null
  recipientName?: string | null
  expiresAt?: string | null
  validMonths?: number | null
  showName?: boolean
  now?: Date
}): PremiumCardSpec {
  const art = giftArtFor(gift.design)
  const hasAmount = gift.amount !== null && gift.amount !== '' && Number(gift.amount) > 0
  const rupees = hasAmount ? giftRupees(gift.amount as string | number) : null
  const name = firstName(gift.recipientName)
  const chips: CardChip[] = [{ icon: 'gift', text: rupees ?? 'Gift card' }]
  if (name && gift.showName !== false) chips.push({ icon: 'user', text: `For ${name}`, fluid: true })
  chips.push(OCCASION_CHIPS[art] ?? { icon: 'calendar', text: `Valid ${gift.validMonths ?? 12} months` })
  const month = istMonth(gift.expiresAt ?? gift.now ?? new Date())
  const tip = pickCarCareTip({
    seed: `gift|${art}|${hasAmount ? Number(gift.amount) : ''}|${name.toLowerCase()}`,
    month,
    occasion: art === 'diwali' ? 'diwali' : null,
  })
  return {
    look: art,
    // The same words as the tip's seed, so the buyer's preview, the share
    // screen and the recipient's page (which is never sent the gift's id)
    // all show the same car.
    car: pickCardCar({ seed: `gift|${art}|${hasAmount ? Number(gift.amount) : ''}|${name.toLowerCase()}`, tone: PHOTO_TONE[LOOKS[art].tone], look: art }),
    chips,
    title: [GIFT_TITLES[art], rupees ? `${rupees} of car care` : 'Car care, gifted'],
    tip: tip.text,
  }
}

const PRIZE_LOOKS: Record<PrizeTier, CardLook> = {
  silver: 'prize_silver',
  gold: 'prize_gold',
  stamp: 'prize_star',
  jackpot: 'prize_jackpot',
}

/** The revealed prize's two title lines: "₹100 off" / "Off your next booking". */
export function prizeTitle(prize: { outcome: ScratchOutcome; amount: string | null }): [string, string] {
  switch (prize.outcome) {
    case 'bonus_stamp':
      return ['Bonus star', 'On your Shine Card']
    case 'free_wash':
      return ['Free wash', 'Jackpot']
    default:
      return [`${rewardRupees(prize.amount)} off`, 'Off your next booking']
  }
}

/**
 * A revealed scratch card's prize card: "Scratch card" (a free wash: how
 * much it covers), the garage, the voucher's last day, the
 * prize, and a tip picked by the card's id and the month it was made.
 * Never the voucher's code.
 */
export function prizeCardSpec(card: {
  id: string
  createdAt: string
  outcome: ScratchOutcome
  amount: string | null
  vendorName?: string | null
  /** The voucher's last day ("2026-12-17"), while it can be used. */
  useBy?: string | null
}): PremiumCardSpec {
  // A free wash leads with what it covers; every other prize with "Scratch card".
  const chips: CardChip[] =
    card.outcome === 'free_wash' && card.amount
      ? [{ icon: 'sparkles', text: `Up to ${rewardRupees(card.amount)}` }]
      : [{ icon: 'ticket', text: 'Scratch card' }]
  if (card.vendorName) chips.push({ icon: 'pin', text: card.vendorName, fluid: true })
  if (card.useBy) chips.push({ icon: 'calendar', text: `Use by ${rewardDay(card.useBy)}` })
  else if (card.outcome === 'bonus_stamp') chips.push({ icon: 'star', text: 'Shine Card' })
  const look = PRIZE_LOOKS[prizeTier(card.outcome)]
  return {
    look,
    car: pickCardCar({ seed: `scratch|${card.id}`, tone: PHOTO_TONE[LOOKS[look].tone], look }),
    chips: chips.slice(0, 3),
    title: prizeTitle(card),
    tip: pickCarCareTip({ seed: `scratch|${card.id}`, month: istMonth(card.createdAt) }).text,
  }
}

/** The shared image's two sizes: an Instagram story and a portrait post. */
export const SHARE_FORMATS = {
  story: { width: 1080, height: 1920, label: 'Story' },
  post: { width: 1080, height: 1350, label: 'Post' },
} as const
export type ShareFormat = keyof typeof SHARE_FORMATS

/** The line every shared image carries, on its pill. */
export const SHARE_LINE = 'Book on detlio.com'

/**
 * The line under a gift card on the share screen and the recipient's page
 * (and in the gift terms): the photos are real cars, so the card must not
 * read as a maker's offer.
 */
export const CARS_ILLUSTRATION_LINE = 'Cars shown for illustration only. Not affiliated with any car maker.'
