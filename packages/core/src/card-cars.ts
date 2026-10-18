import { tipHash } from './car-care-tips'

/**
 * The car photos on premium cards (gift cards and revealed scratch prizes):
 * licensed Unsplash photos with every badge, logo and lettering retouched
 * out (apps/users/public/cards/cars, sources and edits in CREDITS.md).
 * Never name a make or model: not in an id, a file name, alt text or a
 * comment.
 *
 * Each card gets a car picked at random but for good: a hash of something
 * about the card that never changes (a scratch card's id; a gift's design,
 * amount and first name) chooses from the cars of the card's tone, so a
 * light card always has a light photo and a dark card a dark one, and the
 * same card always shows the same car. A look's favourite cars are weighted,
 * not required, so customers still see variety.
 *
 * To add a photo: put `<file>-800.webp` and `<file>-1600.webp` (cropped to
 * PHOTO_ASPECT) next to the others, add a row to CREDITS.md and an entry
 * here. Nothing else changes.
 */

/** The card looks a photo can suit (the users app's CardLook). */
export type CardCarLook =
  | 'shine'
  | 'midnight'
  | 'pearl'
  | 'birthday'
  | 'diwali'
  | 'thank_you'
  | 'prize_silver'
  | 'prize_gold'
  | 'prize_star'
  | 'prize_jackpot'

/** Light photos go on light cards, dark photos on dark ("Night") cards. */
export type CardCarTone = 'light' | 'dark'

export interface CardCar {
  id: string
  /** File name without its width: `/cards/cars/<file>-800.webp` and `-1600.webp`. */
  file: string
  tone: CardCarTone
  /** CSS object-position for the photo in the card's photo area (and the same crop on the canvas). */
  position: string
  /** The looks this photo suits best: weighted when picking, never required. */
  suits: CardCarLook[]
  /** Generic: colour, kind of car and view. Never a make or model. */
  alt: string
}

/** The photo files' width ÷ height: 1600 × 1300. */
export const PHOTO_ASPECT = 16 / 13

/** How much more likely a look's favourite photo is than any other of its tone. */
export const SUITS_WEIGHT = 3

export const CARD_CARS: readonly CardCar[] = [
  {
    id: 'red-rear',
    file: 'red-rear',
    tone: 'dark',
    position: '50% 40%',
    suits: ['prize_jackpot'],
    alt: 'Red supercar, rear view close up',
  },
  {
    id: 'grey-coupe',
    file: 'grey-coupe',
    tone: 'light',
    position: '50% 45%',
    suits: ['shine', 'prize_silver'],
    alt: 'Grey sports coupe, side view',
  },
  {
    id: 'silver-concept',
    file: 'silver-concept',
    tone: 'light',
    position: '50% 50%',
    suits: ['pearl', 'thank_you'],
    alt: 'Silver concept sports car, side view',
  },
  {
    id: 'white-track-rear',
    file: 'white-track-rear',
    tone: 'dark',
    position: '50% 50%',
    suits: ['midnight', 'prize_star'],
    alt: 'White track car with a large rear wing, rear view',
  },
  {
    id: 'white-supercar-dark',
    file: 'white-supercar-dark',
    tone: 'dark',
    position: '50% 45%',
    suits: ['diwali'],
    alt: 'White supercar, side view',
  },
  {
    id: 'purple-hypercar',
    file: 'purple-hypercar',
    tone: 'light',
    position: '50% 50%',
    suits: ['birthday', 'prize_gold'],
    alt: 'Purple hypercar on a race track, side view',
  },
]

export type CardCarWidth = 800 | 1600

/** The photo's address at a width: 800 on screen, 1600 for the shared image. */
export function cardCarSrc(car: CardCar, width: CardCarWidth): string {
  return `/cards/cars/${car.file}-${width}.webp`
}

/** Both widths, for an <img srcset>. */
export function cardCarSrcSet(car: CardCar): string {
  return `${cardCarSrc(car, 800)} 800w, ${cardCarSrc(car, 1600)} 1600w`
}

export function cardCarById(id: string): CardCar | undefined {
  return CARD_CARS.find((car) => car.id === id)
}

/**
 * The car for a card: the photos of its tone (all photos, should a tone have
 * none), each weighted SUITS_WEIGHT if it suits the look and 1 if not, one
 * chosen by the seed's hash. The same seed always gets the same car.
 */
export function pickCardCar(input: { seed: string; tone: CardCarTone; look: CardCarLook }, cars: readonly CardCar[] = CARD_CARS): CardCar {
  const ofTone = cars.filter((car) => car.tone === input.tone)
  const pool = ofTone.length > 0 ? ofTone : cars
  const weights = pool.map((car) => (car.suits.includes(input.look) ? SUITS_WEIGHT : 1))
  const total = weights.reduce((sum, w) => sum + w, 0)
  // The hash's high bits: FNV-1a's low bits vary least between similar seeds.
  let at = (tipHash(`car|${input.seed}`) >>> 7) % total
  for (let i = 0; i < pool.length; i++) {
    if (at < weights[i]) return pool[i]
    at -= weights[i]
  }
  return pool[pool.length - 1]
}
