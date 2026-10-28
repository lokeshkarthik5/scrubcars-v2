import { BOOKING_TYPE_LABELS, offeredBookingTypes } from './booking-types'
import { garageAreaName } from './localities'
import { SERVICE_CITY } from './service-city'
import type { Vendor } from './types'

/**
 * The designed cover a garage gets until it uploads a photo (the "no-photo
 * look"): its initials, its area and the ways it can be booked, on one of
 * five brand colours. Pure, so the same garage always gets the same cover on
 * every screen and every device; the drawing is
 * packages/ui/src/features/garage-cover.tsx.
 */

/** The five brand colours a cover can be, in the order the hash picks them. */
export const COVER_TONES = ['red', 'blue', 'green', 'bronze', 'plum'] as const
export type CoverTone = (typeof COVER_TONES)[number]

/**
 * FNV-1a over the id's UTF-16 code units, 32-bit. Stable across runtimes,
 * so a garage keeps its colour on the server's render, the phone and the
 * next deploy. Not for anything secret.
 */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** A garage's cover colour, from its id: the same garage, the same colour. */
export function coverToneFor(id: string): CoverTone {
  return COVER_TONES[fnv1a(id) % COVER_TONES.length]
}

/**
 * Little words that make poor initials ("Point to Point" is PP, not PT).
 * Never a single capital: "A.J Auto Garage" is AJ.
 */
const SKIP_WORDS = new Set([
  'and',
  'of',
  'the',
  'to',
  'by',
  'at',
  'for',
  'in',
  'on',
])
const isLittleWord = (word: string) =>
  SKIP_WORDS.has(word.toLowerCase()) || word === 'n'

/**
 * Two letters for a garage's monogram: the first letters of its first two
 * words ("Glossy Doorstep" → GD, "A.J Auto Garage" → AJ, the dot splitting
 * "A.J"), or the first two letters of a one-word name ("Shine" → SH).
 * Punctuation and emoji are not letters; little words are skipped while
 * there are others. Empty when the name has no letter or digit at all.
 */
export function garageInitials(name: string): string {
  // "Raj's" is one word, not Raj and s.
  const words =
    name.replace(/['’]/g, '').match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) ?? []
  if (words.length === 0) return ''
  const meaningful = words.filter((word) => !isLittleWord(word))
  const picked = meaningful.length > 0 ? meaningful : words
  const first = (word: string) => Array.from(word)[0] ?? ''
  const initials =
    picked.length >= 2
      ? first(picked[0]) + first(picked[1])
      : Array.from(picked[0].replace(/\p{M}/gu, '')).slice(0, 2).join('')
  return initials.toUpperCase()
}

/**
 * The small-caps line at the cover's top-left: where the garage is, then
 * how it can be booked ("Anna Nagar", "Doorstep"). The area is the listed
 * neighbourhood its pin is near, else its town, else the service city.
 */
export function coverMetaParts(
  vendor: Pick<
    Vendor,
    | 'area'
    | 'lat'
    | 'lng'
    | 'outsideServiceCity'
    | 'dropinEnabled'
    | 'doorstepEnabled'
  > &
    Partial<Pick<Vendor, 'pickupEnabled'>>
): string[] {
  const place = garageAreaName({
    city: vendor.area?.trim() || SERVICE_CITY.name,
    lat: vendor.lat,
    lng: vendor.lng,
    outsideServiceCity: vendor.outsideServiceCity,
  })
  return [
    place,
    ...offeredBookingTypes(vendor).map((type) => BOOKING_TYPE_LABELS[type]),
  ]
}
