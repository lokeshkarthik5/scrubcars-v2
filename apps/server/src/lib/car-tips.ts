/**
 * The car-care tip at the bottom of Home: one a day, the same all day.
 *
 * These are the thirteen tips the owner vetted, word for word. Others were
 * dropped because they could not be stated with confidence (a "safe" water
 * depth, how many hours bird droppings take to mark paint, how long a coating
 * lasts); do not add a tip here without the same check.
 *
 * Some tips matter more in a season. In its season a tip comes round twice as
 * often, and the season's tips lead the rotation from its first day, so on
 * 1 October the monsoon tips come first. Chennai seasons, decided in IST.
 */
import { daysBetween, istDateKey, istParts } from './ist.js'

export type TipSeason =
  | 'all_year'
  /** March to June: the hot months. */
  | 'summer'
  /** September, before the monsoon. */
  | 'pre_monsoon'
  /** October to December: the north-east monsoon. */
  | 'monsoon'

export interface CarTip {
  id: string
  category: string
  season: TipSeason
  text: string
}

export const CAR_TIPS: readonly CarTip[] = [
  {
    id: 'wash-often',
    category: 'Washing',
    season: 'all_year',
    text: 'Most cars in Chennai stay in good shape with a wash every one to two weeks. Wash sooner after rain, a beach trip or a dusty drive.',
  },
  {
    id: 'no-dry-wipe',
    category: 'Dust',
    season: 'all_year',
    text: 'Never dry-wipe a dusty car. Dust rubs like fine sandpaper and leaves swirl marks, so rinse it off first.',
  },
  {
    id: 'no-sun-wash',
    category: 'Washing',
    season: 'all_year',
    text: "Don't wash or wipe the car in direct afternoon sun. Soap and water dry too fast and leave spots.",
  },
  {
    id: 'droppings-sap',
    category: 'Bird droppings & sap',
    season: 'all_year',
    text: 'Clean bird droppings and tree sap off soon, with water and a soft microfibre cloth. Left in the heat, they get harder to remove and can mark the paint.',
  },
  {
    id: 'park-shade',
    category: 'Sun',
    season: 'summer',
    text: 'Park in the shade or use a windscreen sunshade when you can. Strong sun fades paint and dries out the dashboard over time.',
  },
  {
    id: 'flooded-road',
    category: 'Monsoon',
    season: 'monsoon',
    text: "If you can't see the road under the water or can't judge how deep it is, don't drive through it. Water pulled into the engine can cause costly damage.",
  },
  {
    id: 'underbody-rinse',
    category: 'Monsoon',
    season: 'monsoon',
    text: 'After driving through flooded or muddy roads, get the underbody rinsed. Trapped mud holds moisture and speeds up rust.',
  },
  {
    id: 'wet-mats',
    category: 'Interior',
    season: 'monsoon',
    text: 'Wet floor mats? Take them out and dry them fully. Damp mats cause a musty smell in the cabin.',
  },
  {
    id: 'ac-filter',
    category: 'AC',
    season: 'all_year',
    text: 'Ask for the AC cabin filter to be checked at every service. A clogged filter weakens airflow and can make the cabin smell.',
  },
  {
    id: 'salty-air',
    category: 'Coast',
    season: 'all_year',
    text: 'Live near the sea, like ECR or Besant Nagar? Salty air settles on the car, so regular washes and an underbody rinse help slow rust.',
  },
  {
    id: 'tyre-pressure',
    category: 'Tyres',
    season: 'all_year',
    text: "Check tyre pressure once a month, when the tyres are cold. Use the pressure on the sticker by the driver's door, not the number on the tyre.",
  },
  {
    id: 'wiper-blades',
    category: 'Wipers',
    season: 'pre_monsoon',
    text: 'Replace wiper blades if they streak, skip or squeak. Heat hardens the rubber, so check them before the monsoon.',
  },
  {
    id: 'wax-coating',
    category: 'Protection',
    season: 'all_year',
    text: 'Wax usually protects paint for a few weeks to a few months. A ceramic coating lasts longer, but it is not scratch-proof and still needs gentle washing.',
  },
]

/** The season a moment falls in, and the IST date it began that year. */
export function tipSeasonOf(now: Date): { season: TipSeason; startedOn: string } {
  const p = istParts(now)
  const year = String(p.year)
  // istParts' month is 0-based.
  if (p.month >= 9) return { season: 'monsoon', startedOn: `${year}-10-01` }
  if (p.month === 8) return { season: 'pre_monsoon', startedOn: `${year}-09-01` }
  if (p.month >= 2 && p.month <= 5) return { season: 'summer', startedOn: `${year}-03-01` }
  return { season: 'all_year', startedOn: `${year}-01-01` }
}

/**
 * Today's tip. The rotation is the season's tips, then every other tip, then
 * the season's tips again, counted from the season's first day; outside a
 * season, every tip once, counted from 1 January. Same answer all IST day.
 */
export function tipOfTheDay(now: Date, tips: readonly CarTip[] = CAR_TIPS): CarTip {
  const { season, startedOn } = tipSeasonOf(now)
  const inSeason = season === 'all_year' ? [] : tips.filter((tip) => tip.season === season)
  const rest = tips.filter((tip) => !inSeason.includes(tip))
  const rotation = [...inSeason, ...rest, ...inSeason]
  const day = daysBetween(startedOn, istDateKey(now))
  return rotation[((day % rotation.length) + rotation.length) % rotation.length]
}
