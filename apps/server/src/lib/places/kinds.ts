/**
 * What the zone finder looks for (0064): the kinds of business the team
 * signs, each with the words it is searched by. The labels are twinned in
 * packages/core/src/leads.ts (PLACE_KIND_LABELS, leads.parity.test.ts).
 *
 * One search per kind per source, so each kind costs one Google request:
 * the queries are kept to one each on purpose.
 */
export const PLACE_KINDS = [
  'car_wash',
  'detailing',
  'doorstep',
  'workshop',
  'tyres',
] as const
export type PlaceKind = (typeof PLACE_KINDS)[number]

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  car_wash: 'Car wash',
  detailing: 'Detailing studio',
  doorstep: 'Doorstep wash',
  workshop: 'Workshop / service centre',
  tyres: 'Tyres & accessories',
}

/** The words each kind is searched by, at both sources. */
export const PLACE_KIND_QUERIES: Record<PlaceKind, string> = {
  car_wash: 'car wash',
  detailing: 'car detailing studio',
  doorstep: 'doorstep car wash',
  workshop: 'car repair service centre workshop',
  tyres: 'car tyres and accessories',
}

/** Free words typed in the search box: at most this long. */
export const PLACE_TEXT_MAX = 80
