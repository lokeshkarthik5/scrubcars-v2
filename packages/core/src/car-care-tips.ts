/**
 * Car care tips: one small, practical line on every premium gift card and
 * scratch-card prize (apps/users/components/premium-card). Edit freely —
 * car-care-tips.test.ts holds every tip to the rules:
 *
 *   - at most 110 characters, plain friendly English, one idea
 *   - true for an ordinary car in India (sun, dust, monsoon, hard water)
 *   - no brand or product names, no promises, no medical or safety absolutes
 *   - passes the copy rules (copy-rules.ts: no "guaranteed", "flawless"…)
 *
 * `season` decides when a tip is preferred: `rain` in the monsoon months,
 * `summer` in the hot months, `diwali` on Diwali cards; `any` the rest of
 * the year. A card always shows the same tip: it is picked by a hash of
 * something about the card that never changes (pickCarCareTip).
 */
export type TipSeason = 'any' | 'rain' | 'summer' | 'diwali'

export interface CarCareTip {
  id: string
  text: string
  season: TipSeason
}

export const CAR_CARE_TIPS: readonly CarCareTip[] = [
  // ─── Washing ──────────────────────────────────────────────────────────
  { id: 'shade', season: 'any', text: 'Wash in the shade or early morning, so soap doesn’t dry into spots on hot paint.' },
  { id: 'two-buckets', season: 'any', text: 'Use two buckets: one with soapy water, one to rinse the mitt, so grit stays out of the paint.' },
  { id: 'dish-soap', season: 'any', text: 'Dish soap strips wax. A car shampoo cleans the paint without taking its protection off.' },
  { id: 'roof-down', season: 'any', text: 'Wash from the roof down, so dirty water runs away from the panels you’ve already cleaned.' },
  { id: 'wheels-first', season: 'any', text: 'Clean the wheels first, with their own brush, so brake dust doesn’t splash onto clean paint.' },
  { id: 'own-cloth', season: 'any', text: 'Keep one cloth for wheels and another for paint. Wheel grime is gritty enough to scratch.' },
  { id: 'dry-wipe', season: 'any', text: 'Dusty car? Rinse before you wipe. Dry dust drags across paint like fine sandpaper.' },
  { id: 'microfibre-dry', season: 'any', text: 'Dry with a clean microfibre towel: lay it flat and draw it gently, rather than rubbing in circles.' },
  { id: 'microfibre-wash', season: 'any', text: 'Wash microfibre cloths on their own and skip fabric softener, so they stay soft and absorbent.' },
  { id: 'droppings', season: 'any', text: 'Clean bird droppings off soon. Left to bake in the sun, they can etch the clear coat.' },
  { id: 'sap', season: 'any', text: 'Tree sap and tar lift far more easily while fresh. Soften them with a proper remover; don’t scrape.' },
  { id: 'wax', season: 'any', text: 'A coat of wax or sealant every few months helps water bead off and makes the next wash easier.' },

  // ─── Hard water ───────────────────────────────────────────────────────
  { id: 'hard-water', season: 'any', text: 'Hard water leaves white spots as it dries. Dry the car straight after the final rinse.' },
  { id: 'filtered-rinse', season: 'any', text: 'If your tap water is hard, a last rinse with filtered water helps keep spots off the glass.' },
  { id: 'glass-spots', season: 'any', text: 'Fresh water spots on glass? A cloth with a little diluted white vinegar usually lifts them.' },

  // ─── Glass, lights, rubber ────────────────────────────────────────────
  { id: 'inner-glass', season: 'any', text: 'Clean the inside of the windscreen too. The film that builds up there adds glare at night.' },
  { id: 'headlights', season: 'any', text: 'Hazy headlight lenses throw less light. Wipe them clean whenever you wash the car.' },
  { id: 'seals', season: 'any', text: 'Wipe the rubber door seals with a damp cloth now and then, so they don’t stick or dry out.' },

  // ─── Inside ───────────────────────────────────────────────────────────
  { id: 'mats-first', season: 'any', text: 'Take the mats out and shake them before you vacuum, so loose dirt doesn’t fall back in.' },
  { id: 'dash-cloth', season: 'any', text: 'Keep a soft microfibre cloth in the glovebox for dust on the dashboard and screens.' },
  { id: 'dash-shine', season: 'any', text: 'Glossy dashboard sprays can reflect in the windscreen. A damp cloth and a matte finish are kinder.' },
  { id: 'vents', season: 'any', text: 'A soft brush through the AC vents clears dust that would otherwise blow back into the cabin.' },
  { id: 'cabin-filter', season: 'any', text: 'A clogged cabin air filter weakens the AC’s airflow. Change it as your service book suggests.' },
  { id: 'fabric-spills', season: 'any', text: 'Spill on a fabric seat? Blot it straight away. Rubbing pushes the stain deeper.' },
  { id: 'leather', season: 'any', text: 'Wipe leather seats with a damp cloth, then use a leather conditioner now and then so they stay supple.' },
  { id: 'tyre-pressure', season: 'any', text: 'Check tyre pressure when the tyres are cold, using the figures on the sticker in the door frame.' },

  // ─── Summer sun ───────────────────────────────────────────────────────
  { id: 'sunshade', season: 'summer', text: 'A windscreen sunshade keeps the dashboard cooler and protects it from the harsh summer sun.' },
  { id: 'sun-spots', season: 'summer', text: 'Summer sun dries water in seconds. Wash one panel at a time and dry it before moving on.' },
  { id: 'cover', season: 'summer', text: 'No covered parking? A breathable car cover shields the paint from the afternoon sun.' },
  { id: 'hot-tyres', season: 'summer', text: 'Tyres read higher when hot. Check the pressure in the morning, before you set off.' },

  // ─── Monsoon ──────────────────────────────────────────────────────────
  { id: 'rain-not-wash', season: 'rain', text: 'Rain doesn’t wash a car: it leaves dust and grime behind as it dries. Rinse after a shower.' },
  { id: 'underbody', season: 'rain', text: 'After driving through flooded roads, rinse the underbody to wash off mud and grime.' },
  { id: 'monsoon-mud', season: 'rain', text: 'Monsoon mud is full of grit. Rinse it off fully before a wash mitt touches the paint.' },
  { id: 'damp-mats', season: 'rain', text: 'Wet mats make a cabin smell musty. Dry them in the sun before you put them back.' },
  { id: 'wipers', season: 'rain', text: 'Wiper blades streaking or juddering? Replace them before the rains: they wear out in the sun.' },
  { id: 'demist', season: 'rain', text: 'Windows fogging up in the rain? The AC dries the air and clears the mist faster than the fan alone.' },

  // ─── Diwali ───────────────────────────────────────────────────────────
  { id: 'cracker-ash', season: 'diwali', text: 'After Diwali, rinse firecracker ash off before you wipe the car. Ash is gritty and can scratch.' },
  { id: 'cracker-park', season: 'diwali', text: 'Park away from where crackers are lit. Sparks and hot ash can mark paint and car covers.' },
  { id: 'festive-wax', season: 'diwali', text: 'A fresh coat of wax before the festival makes dust and ash easier to rinse off afterwards.' },
  { id: 'sweets', season: 'diwali', text: 'Festive sweets in the car? Vacuum the crumbs out of the seat gaps before the ants find them.' },
]

/**
 * The season of each month (1–12), as Detlio's customers feel it: hot from
 * March to May, the south-west monsoon from June and the north-east monsoon
 * on the Tamil Nadu coast to December. Change here, not in the picker.
 */
export const TIP_SEASON_BY_MONTH: Record<number, Exclude<TipSeason, 'diwali'>> = {
  1: 'any',
  2: 'any',
  3: 'summer',
  4: 'summer',
  5: 'summer',
  6: 'rain',
  7: 'rain',
  8: 'rain',
  9: 'rain',
  10: 'rain',
  11: 'rain',
  12: 'rain',
}

/** The India month (1–12) of a moment. */
export function istMonth(at: Date | string): number {
  const ms = typeof at === 'string' ? Date.parse(at) : at.getTime()
  return new Date(ms + 330 * 60_000).getUTCMonth() + 1
}

/** FNV-1a, 32-bit: small, fast and the same everywhere, for a stable pick. */
export function tipHash(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * The tip for one card. `seed` is something about the card that never
 * changes (a scratch card's id; a gift's design, amount and name), so the
 * same card always shows the same tip. A Diwali card picks from the Diwali
 * tips; in the monsoon or summer (`month`, the month the card was made) the
 * season's tips are preferred; the rest of the year, the year-round ones.
 */
export function pickCarCareTip(input: { seed: string; month?: number | null; occasion?: 'diwali' | null }): CarCareTip {
  const season: TipSeason = input.occasion === 'diwali' ? 'diwali' : input.month ? TIP_SEASON_BY_MONTH[input.month] ?? 'any' : 'any'
  const hash = tipHash(input.seed)
  // In the monsoon or summer, two cards in three take the season's tip and
  // the third a year-round one, so the same few lines don't repeat all season.
  const seasonal = season === 'diwali' || (season !== 'any' && hash % 3 !== 0)
  const pool = CAR_CARE_TIPS.filter((tip) => tip.season === (seasonal ? season : 'any'))
  return pool[Math.floor(hash / 3) % pool.length]
}
