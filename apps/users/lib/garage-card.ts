import type { GarageAlbumCar, GarageOwnedCar } from '@repo/core/api/garage'
import { garageCarDataUrl } from '@repo/core/garage-art'
import { cardNumber, RARITY_LOOKS, type GarageRarity, type GarageTone } from '@repo/core/garage'

/**
 * The Detlio Garage's card (0057): every number of its layout, shared by
 * the screen (components/garage/garage-card.tsx, in CSS container units)
 * and the Instagram picture (lib/garage-card-image.ts, in canvas pixels ÷
 * 100), so both draw the same card. The card is 100 wide and CARD.height
 * tall.
 *
 * The car is always a fictional one: its drawn picture (garage-art.ts), or
 * the AI or uploaded art the team chose for it. Never a photo of a real
 * car, a make, a model or a badge.
 */

export const GARAGE_CARD = {
  height: 134,
  radius: 5,
  /** The rarity frame's width. */
  frame: 1.5,
  pad: 6,
  mark: { top: 6.2, size: 3.3 },
  /** The picture: the art is 1200 × 520; drawn a little wider than the card, so the car fills it. */
  art: { top: 12.5, left: -11, width: 122, aspect: 1200 / 520 },
  pill: { top: 62, height: 5.6, size: 2.6 },
  name: { top: 70.5, size: 8.6, line: 9.6 },
  chips: { top: 83.5, height: 6.4, size: 2.75, gap: 1.4, row: 7.8 },
  lore: { top: 101, size: 3.25, line: 4.7, lines: 3 },
  foot: { top: 124.5, size: 2.6 },
} as const

/** The card's ground by tone: a studio light behind the car and a floor under it. */
export const TONE_LOOKS: Record<GarageTone, { ground: [string, string, string]; light: string; floor: string; ink: string; sub: string; muted: string; chipBg: string; chipEdge: string; chipText: string }> = {
  dark: {
    ground: ['#1D1F25', '#121318', '#0A0B0E'],
    light: 'rgba(170,182,210,0.30)',
    floor: 'rgba(255,255,255,0.05)',
    ink: '#F5F6F8',
    sub: '#9EA3AD',
    muted: '#767B85',
    chipBg: 'rgba(255,255,255,0.07)',
    chipEdge: 'rgba(255,255,255,0.12)',
    chipText: '#E6E8EC',
  },
  light: {
    ground: ['#F7F8FA', '#ECEEF1', '#DFE2E7'],
    light: 'rgba(255,255,255,0.98)',
    floor: 'rgba(14,15,18,0.05)',
    ink: '#0E0F12',
    sub: '#5F646D',
    muted: '#8A8F98',
    chipBg: 'rgba(255,255,255,0.8)',
    chipEdge: 'rgba(14,15,18,0.08)',
    chipText: '#2A2D33',
  },
}

/** The picture of an owned card: the team's art when there is some, else the drawn one. */
export function carArtSrc(car: Pick<GarageOwnedCar, 'number' | 'series' | 'paint' | 'tone' | 'rarity' | 'art'>): string {
  if (car.art.url) return car.art.url
  return garageCarDataUrl({ number: car.number, series: car.series, paint: car.paint, tone: car.tone, rarity: car.rarity })
}

/** The shape of a card not collected yet, in shadow: never its colour or name. */
export function silhouetteSrc(car: Pick<GarageAlbumCar, 'number' | 'series' | 'tone' | 'rarity'>): string {
  return garageCarDataUrl({ number: car.number, series: car.series, paint: '#000000', tone: 'dark', rarity: car.rarity }, { silhouette: true })
}

/** The frame's metal, as a CSS gradient (light catching it from the top left). */
export function frameGradient(rarity: GarageRarity): string {
  const [a, b, c, d] = RARITY_LOOKS[rarity].metal
  return `linear-gradient(135deg, ${a} 0%, ${b} 28%, ${c} 52%, ${d} 78%, ${b} 100%)`
}

/** "#07/40 · Series 1" */
export function cardFoot(car: Pick<GarageOwnedCar, 'number' | 'total' | 'series'>): string {
  return `${cardNumber(car.number, car.total)} · Series ${car.series}`
}

/** What a share says: never anything personal but the first name when the sharer ticks it. */
export const GARAGE_SHARE = {
  collected: 'Collected on Detlio',
  book: 'Book on detlio.com',
} as const
