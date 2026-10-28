import { normalisePhone } from './leads.js'
import { straightLineKm } from './service-city.js'

/**
 * "Is this the same place?" for leads and the zone finder (0064): one rule
 * for the duplicate warning on Add lead and Paste a list, for marking what
 * the finder found that the team already knows, and (with a tighter
 * distance) for merging Google's and Ola's answers into one list. Pure,
 * unit-tested in lead-match.test.ts.
 *
 * Two places are the same when:
 *   - they share a phone number (after normalisePhone), or
 *   - they share a Google or Ola place id, or
 *   - their names are similar (similarNames) and their pins are within the
 *     given distance, or
 *   - one has no pin, and their names are the same words in the same zone.
 */

/**
 * Words that say what a business is rather than which one it is. Left out
 * when names are compared, so "Speed Car Wash" and "Speed Wash" match while
 * "Sri Murugan Auto Works" and "Sri Krishna Car Wash" do not.
 */
const GENERIC_WORDS = new Set([
  'a',
  'and',
  'the',
  'of',
  'n',
  'car',
  'cars',
  'wash',
  'washing',
  'washer',
  'detailing',
  'detailer',
  'detailers',
  'detail',
  'studio',
  'auto',
  'autos',
  'automobile',
  'automobiles',
  'service',
  'services',
  'servicing',
  'centre',
  'center',
  'care',
  'spa',
  'garage',
  'workshop',
  'works',
  'motor',
  'motors',
  'point',
  'zone',
  'hub',
  'shop',
  'pvt',
  'ltd',
  'private',
  'limited',
  'co',
  'company',
  'enterprises',
  'enterprise',
  'sri',
  'shri',
  'sree',
  'new',
  'chennai',
])

/** A name's words, lower-case, without punctuation. */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      diagonal = above
    }
  }
  return previous[b.length]
}

/**
 * Whether two business names are probably the same business: the same
 * words; or, leaving out the generic words, half the words shared, all of
 * one's words in the other ("Speed" and "Speed Anna Nagar"), or a typo or
 * two apart. Two names of only generic words ("Car Wash") match only when
 * they are the same words.
 */
export function similarNames(a: string, b: string): boolean {
  const wordsA = nameWords(a)
  const wordsB = nameWords(b)
  if (wordsA.length === 0 || wordsB.length === 0) return false
  if (wordsA.join(' ') === wordsB.join(' ')) return true

  const coreA = [...new Set(wordsA.filter((word) => !GENERIC_WORDS.has(word)))]
  const coreB = [...new Set(wordsB.filter((word) => !GENERIC_WORDS.has(word)))]
  if (coreA.length === 0 || coreB.length === 0) return false

  const shared = coreA.filter((word) => coreB.includes(word)).length
  const union = new Set([...coreA, ...coreB]).size
  if (shared / union >= 0.5) return true
  if (shared > 0 && (shared === coreA.length || shared === coreB.length))
    return true

  const joinedA = coreA.join('')
  const joinedB = coreB.join('')
  const longest = Math.max(joinedA.length, joinedB.length)
  return (
    longest >= 5 &&
    editDistance(joinedA, joinedB) <= Math.max(1, Math.floor(longest * 0.15))
  )
}

export type MatchReason =
  'phone' | 'place_id' | 'name_nearby' | 'same_name_zone'

/** Something that might be the same place: a lead, a garage or a search result. */
export interface PlaceLike {
  name: string | null
  /** Every number it is known by (a garage's phone and WhatsApp), raw or normalised. */
  phones: ReadonlyArray<string | null | undefined>
  lat: number | null
  lng: number | null
  zoneId?: string | null
  googlePlaceId?: string | null
  olaPlaceId?: string | null
}

/** Why two places look like the same one, or null when they do not. */
export function samePlace(
  a: PlaceLike,
  b: PlaceLike,
  radiusM: number
): MatchReason | null {
  if (a.googlePlaceId && a.googlePlaceId === b.googlePlaceId) return 'place_id'
  if (a.olaPlaceId && a.olaPlaceId === b.olaPlaceId) return 'place_id'

  const phonesA = new Set(
    a.phones.map(normalisePhone).filter((p): p is string => p !== null)
  )
  if (
    phonesA.size > 0 &&
    b.phones.some((phone) => {
      const normal = normalisePhone(phone)
      return normal !== null && phonesA.has(normal)
    })
  ) {
    return 'phone'
  }

  if (!a.name || !b.name) return null
  const bothPinned =
    a.lat !== null && a.lng !== null && b.lat !== null && b.lng !== null
  if (bothPinned) {
    const km = straightLineKm(
      { lat: a.lat!, lng: a.lng! },
      { lat: b.lat!, lng: b.lng! }
    )
    return km * 1000 <= radiusM && similarNames(a.name, b.name)
      ? 'name_nearby'
      : null
  }
  if (
    a.zoneId &&
    a.zoneId === b.zoneId &&
    nameWords(a.name).join(' ') === nameWords(b.name).join(' ')
  ) {
    return 'same_name_zone'
  }
  return null
}

/** Every known place that looks like the candidate, with why, in the order given. */
export function findDuplicates<K extends PlaceLike>(
  candidate: PlaceLike,
  known: readonly K[],
  radiusM: number
): Array<{ match: K; reason: MatchReason }> {
  return known.flatMap((match) => {
    const reason = samePlace(candidate, match, radiusM)
    return reason ? [{ match, reason }] : []
  })
}
