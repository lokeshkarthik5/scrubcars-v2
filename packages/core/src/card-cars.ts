import { tipHash } from './car-care-tips'

/**
 * The car photos on premium cards (gift cards and revealed scratch prizes):
 * licensed Unsplash and Pexels photos with every badge, logo and lettering retouched
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

/** How much more likely a look's favourite photo is than any other of its tone (a look may have more than one). */
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
  {
    id: 'white-wing-rear',
    file: 'white-wing-rear',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'White sports car with a large rear wing, rear view',
  },
  {
    id: 'white-coupe-side',
    file: 'white-coupe-side',
    tone: 'light',
    position: '50% 50%',
    suits: ['pearl'],
    alt: 'White sports coupe in a studio, side view',
  },
  {
    id: 'white-supercar-front',
    file: 'white-supercar-front',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'White supercar in a studio, front view',
  },
  {
    id: 'silver-roadster-front',
    file: 'silver-roadster-front',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Silver roadster on white, head-on view',
  },
  {
    id: 'bronze-coupe-side',
    file: 'bronze-coupe-side',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Bronze widebody coupe in a studio, side view',
  },
  {
    id: 'green-racer',
    file: 'green-racer',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Green vintage race car, side view',
  },
  {
    id: 'black-widebody-front',
    file: 'black-widebody-front',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Black widebody sports car on pale grey, front view',
  },
  {
    id: 'black-coupe-rooftop',
    file: 'black-coupe-rooftop',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Black sports coupe on a white rooftop, side view',
  },
  {
    id: 'orange-coupe-side',
    file: 'orange-coupe-side',
    tone: 'dark',
    position: '50% 50%',
    suits: ['diwali'],
    alt: 'Orange sports coupe against a warm wall, side view',
  },
  {
    id: 'blue-coupe-rear',
    file: 'blue-coupe-rear',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Blue sports coupe outdoors, rear view',
  },
  {
    id: 'silver-supercar-close',
    file: 'silver-supercar-close',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Silver supercar in a grey studio, front close up',
  },
  {
    id: 'green-coupe-front',
    file: 'green-coupe-front',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Green sports coupe in a studio, front view',
  },
  {
    id: 'red-supercar-studio',
    file: 'red-supercar-studio',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Red supercar in a dark studio, front view',
  },
  {
    id: 'blue-supercar-outline',
    file: 'blue-supercar-outline',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Blue supercar outlined in light, side view',
  },
  {
    id: 'yellow-coupe-street',
    file: 'yellow-coupe-street',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Yellow sports coupe on a dark street, side view',
  },
  {
    id: 'white-concept-top',
    file: 'white-concept-top',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'White open-top concept car on black, from above',
  },
  {
    id: 'black-coupe-blue-light',
    file: 'black-coupe-blue-light',
    tone: 'dark',
    position: '50% 50%',
    suits: ['midnight'],
    alt: 'Black sports coupe in blue light, front view',
  },
  {
    id: 'green-grey-concept',
    file: 'green-grey-concept',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Dark green concept coupe in a studio, front view',
  },
  {
    id: 'silver-hypercar-light',
    file: 'silver-hypercar-light',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Silver hypercar in a shaft of light, side view',
  },
  {
    id: 'silver-coupe-black',
    file: 'silver-coupe-black',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Silver sports coupe on black, front view',
  },
  {
    id: 'red-concept-reflection',
    file: 'red-concept-reflection',
    tone: 'dark',
    position: '50% 50%',
    suits: ['prize_jackpot'],
    alt: 'Red concept coupe with its reflection, rear view',
  },
  {
    id: 'black-coupe-silhouette',
    file: 'black-coupe-silhouette',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Black sports coupe in silhouette, side view',
  },
  {
    id: 'grey-coupe-taillights',
    file: 'grey-coupe-taillights',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Dark grey sports coupe with glowing tail lights',
  },
  {
    id: 'white-roadster-garage',
    file: 'white-roadster-garage',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'White roadster in a dark garage, front view',
  },
  {
    id: 'purple-coupe-open-lot',
    file: 'purple-coupe-open-lot',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Purple sports coupe on an open lot, front view',
  },
  {
    id: 'purple-coupe-dusk',
    file: 'purple-coupe-dusk',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Purple sports coupe at dusk, front view',
  },
  {
    id: 'purple-coupe-overcast',
    file: 'purple-coupe-overcast',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Purple sports coupe on a grey day, front view',
  },
  {
    id: 'lavender-coupe-head-on',
    file: 'lavender-coupe-head-on',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Lavender sports coupe, head-on view',
  },
  {
    id: 'yellow-coupe-stripes',
    file: 'yellow-coupe-stripes',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Yellow coupe with black stripes, side view',
  },
  {
    id: 'yellow-coupe-above',
    file: 'yellow-coupe-above',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Yellow sports car from above, rear view',
  },
  {
    id: 'blue-coupe-white-studio',
    file: 'blue-coupe-white-studio',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Blue coupe in a white studio, rear view',
  },
  {
    id: 'blue-coupe-grey-street',
    file: 'blue-coupe-grey-street',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Blue sports coupe on a grey street, rear view',
  },
  {
    id: 'blue-classic-coupe',
    file: 'blue-classic-coupe',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Blue classic coupe in a dark studio, side view',
  },
  {
    id: 'orange-supercar-close',
    file: 'orange-supercar-close',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Orange supercar in the dark, side close up',
  },
  {
    id: 'green-coupe-rooftop',
    file: 'green-coupe-rooftop',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'Green sports coupe on a rooftop, side view',
  },
  {
    id: 'green-coupe-from-above',
    file: 'green-coupe-from-above',
    tone: 'dark',
    position: '50% 50%',
    suits: [],
    alt: 'Green sports coupe from above, in the dark',
  },
  {
    id: 'white-gold-coupe',
    file: 'white-gold-coupe',
    tone: 'light',
    position: '50% 50%',
    suits: [],
    alt: 'White and gold coupe with a rear wing, rear view',
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
