import type { GarageOwnedCar } from '@repo/core/api/garage'
import { CARD_CARS, cardCarById, cardCarSrc, type CardCar, type CardCarTone, type CardCarWidth } from '@repo/core/card-cars'
import { RARITY_LOOKS, type GarageRarity } from '@repo/core/garage'

/**
 * The Detlio Garage's card (0057): every number of its layout, shared by
 * the screen (components/garage/garage-card.tsx, in CSS container units)
 * and the Instagram picture (lib/garage-card-image.ts, in canvas pixels ÷
 * 100), so both draw the same card. The card is 100 wide and
 * GARAGE_CARD.height tall.
 *
 * The picture is one of the licensed card photos (packages/core/src/
 * card-cars.ts), by the card's `photoId`, at 800 px in album tiles and
 * 1600 px on the card and in the shared image; a future series' uploaded
 * picture replaces it. Never a make or model in any word, and every place a
 * card is shown carries the illustration line (ILLUSTRATION_LINE).
 */

export const GARAGE_CARD = {
  height: 134,
  radius: 5,
  /** The rarity frame's width. */
  frame: 1.5,
  pad: 6,
  /** The photo: edge to edge across the top, fading into the card's ground. */
  photo: { height: 78 },
  pill: { top: 69, height: 5.6, size: 2.6 },
  name: { top: 77, size: 8.6, line: 9.6 },
  chips: { top: 90, height: 6.4, size: 2.75, gap: 1.4 },
  lore: { top: 100.5, size: 3.25, line: 4.7, lines: 3 },
  foot: { top: 124.5, size: 2.6 },
} as const

/** The card's ground and words by the photo's tone: a light gallery card, or the dark night one. */
export const TONE_LOOKS: Record<CardCarTone, { ground: [string, string, string]; ink: string; sub: string; muted: string; chipBg: string; chipEdge: string; chipText: string }> = {
  dark: {
    ground: ['#16171C', '#111216', '#0A0B0E'],
    ink: '#F5F6F8',
    sub: '#9EA3AD',
    muted: '#767B85',
    chipBg: 'rgba(255,255,255,0.07)',
    chipEdge: 'rgba(255,255,255,0.12)',
    chipText: '#E6E8EC',
  },
  light: {
    ground: ['#F3F4F6', '#ECEEF1', '#DFE2E7'],
    ink: '#0E0F12',
    sub: '#5F646D',
    muted: '#8A8F98',
    chipBg: 'rgba(255,255,255,0.85)',
    chipEdge: 'rgba(14,15,18,0.08)',
    chipText: '#2A2D33',
  },
}

/** The card's photo in the pool (the first photo if the id is unknown, so a card is never empty). */
export function cardPhoto(photoId: string): CardCar {
  return cardCarById(photoId) ?? CARD_CARS[0]
}

/** The picture's address: the team's upload for a future series, else the pool photo at that width. */
export function carArtSrc(car: Pick<GarageOwnedCar, 'photoId' | 'art'>, width: CardCarWidth): string {
  if (car.art.source === 'upload' && car.art.url) return car.art.url
  return cardCarSrc(cardPhoto(car.photoId), width)
}

/** The frame's metal, as a CSS gradient (light catching it from the top left). */
export function frameGradient(rarity: GarageRarity): string {
  const [a, b, c, d] = RARITY_LOOKS[rarity].metal
  return `linear-gradient(135deg, ${a} 0%, ${b} 28%, ${c} 52%, ${d} 78%, ${b} 100%)`
}

/** What a share says: never anything personal but the first name when the sharer ticks it. */
export const GARAGE_SHARE = {
  collected: 'Collected on Detlio',
  book: 'Book on detlio.com',
} as const
