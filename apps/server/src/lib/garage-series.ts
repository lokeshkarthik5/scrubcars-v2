/**
 * The Detlio Garage, Series 1 (0057): 40 cards, each one of the licensed
 * card photos (packages/core/src/card-cars.ts, by id), seeded by migration
 * 0057 (garage-series.test.ts holds the SQL to this list) and then the
 * team's to edit in admin. Names are evocative and invented: never a hint
 * at a maker or model (the test runs a deny-list of real makes and models
 * over every name and line). Facts are what the photo shows (colour,
 * setting), never made-up performance figures. Rows of five by number; each
 * row mixes rarities.
 *
 *   Common 20 · Rare 12 · Epic 6 · Legendary 2
 */
import type { GarageRarity } from './garage.js'

export interface SeriesCar {
  number: number
  name: string
  rarity: GarageRarity
  /** The photo's id in the card photo pool. */
  photoId: string
  colour: string
  setting: string
  lore: string
}

function car(number: number, name: string, rarity: GarageRarity, photoId: string, colour: string, setting: string, lore: string): SeriesCar {
  return { number, name, rarity, photoId, colour, setting, lore }
}

export const SERIES_ONE = {
  number: 1,
  name: 'Series 1',
  cars: [
  car(1, 'Marina Drift', 'common', 'red-rear', 'Colour', 'Studio', 'Built for slow evening laps along the beach road, windows down.'),
  car(2, 'Chai Racer', 'common', 'grey-coupe', 'Colour', 'Studio', 'Never misses the four o’clock chai stop, however late the meeting runs.'),
  car(3, 'Saffron Arrow', 'rare', 'silver-concept', 'Colour', 'Studio', 'Painted the shade of a festival sky at dusk.'),
  car(4, 'Copper Kite', 'common', 'white-track-rear', 'Colour', 'Studio', 'Light as a paper kite, and just as hard to catch on a windy day.'),
  car(5, 'Crimson Talon', 'epic', 'white-supercar-dark', 'Colour', 'Studio', 'Its headlights narrow like a hawk’s eyes at every green light.'),
  car(6, 'Coastal Glide', 'common', 'purple-hypercar', 'Colour', 'Studio', 'Tuned on the coast road, one sea breeze at a time.'),
  car(7, 'Monsoon GT', 'rare', 'red-rear', 'Colour', 'Studio', 'Loves the first rain of June more than anyone in the city.'),
  car(8, 'Pebble Hopper', 'common', 'grey-coupe', 'Colour', 'Studio', 'Small, round and cheerful, like a stone skipping across a lake.'),
  car(9, 'Neem Flicker', 'common', 'silver-concept', 'Colour', 'Studio', 'Parks in the shade of the same neem tree every afternoon.'),
  car(10, 'Kaveri Surge', 'rare', 'white-track-rear', 'Colour', 'Studio', 'Named after the river, and just as hard to hold back.'),
  car(11, 'Harbour Flash', 'common', 'white-supercar-dark', 'Colour', 'Studio', 'Gone before the ferry horn has finished sounding.'),
  car(12, 'Mango Zing', 'common', 'purple-hypercar', 'Colour', 'Studio', 'The colour of the first mango of summer.'),
  car(13, 'Peacock Blade', 'rare', 'red-rear', 'Colour', 'Studio', 'Shows off its colours whenever it rains.'),
  car(14, 'Kanjeevaram Silk', 'epic', 'grey-coupe', 'Colour', 'Studio', 'Woven like a wedding saree: every panel has a shine of its own.'),
  car(15, 'Kolam Swirl', 'common', 'silver-concept', 'Colour', 'Studio', 'Leaves a neat pattern of tyre tracks at every sunrise.'),
  car(16, 'Ghat Road Rally', 'rare', 'white-track-rear', 'Colour', 'Studio', 'Counts hairpin bends the way others count sheep.'),
  car(17, 'Filter Coffee GT', 'common', 'white-supercar-dark', 'Colour', 'Studio', 'Strong, smooth and best enjoyed early in the morning.'),
  car(18, 'Jasmine Glint', 'common', 'purple-hypercar', 'Colour', 'Studio', 'Smells faintly of jasmine, and nobody knows why.'),
  car(19, 'Coromandel Flyer', 'rare', 'red-rear', 'Colour', 'Studio', 'Races the sunrise up the coast, and usually wins.'),
  car(20, 'Chola Thunder', 'legendary', 'grey-coupe', 'Colour', 'Studio', 'Carved like a temple chariot, built to cross an empire in an afternoon.'),
  car(21, 'Rangoli Twist', 'common', 'silver-concept', 'Colour', 'Studio', 'Comes alive at Diwali, like every doorstep in town.'),
  car(22, 'Teal Tide', 'common', 'white-track-rear', 'Colour', 'Studio', 'Arrives quietly, then suddenly it is everywhere, like the evening tide.'),
  car(23, 'Midnight Current', 'rare', 'white-supercar-dark', 'Colour', 'Studio', 'Hums along empty flyovers long after the city sleeps.'),
  car(24, 'Silver Sparrow', 'common', 'purple-hypercar', 'Colour', 'Studio', 'Small, quick and never far from home.'),
  car(25, 'Solar Flare', 'epic', 'red-rear', 'Colour', 'Studio', 'So bright that the parking attendant reaches for sunglasses.'),
  car(26, 'Banyan Loop', 'common', 'grey-coupe', 'Colour', 'Studio', 'Takes the long way round, under every banyan it can find.'),
  car(27, 'Emerald Parakeet', 'rare', 'silver-concept', 'Colour', 'Studio', 'A chatty exhaust and a bright green coat: impossible to ignore.'),
  car(28, 'Gulmohar Ember', 'common', 'white-track-rear', 'Colour', 'Studio', 'Blooms red every May, right on time.'),
  car(29, 'Nilgiri Mist', 'rare', 'white-supercar-dark', 'Colour', 'Studio', 'Climbs into the clouds and comes back smelling of tea leaves.'),
  car(30, 'Obsidian Halo', 'epic', 'purple-hypercar', 'Colour', 'Studio', 'Seen only as a glow of headlights on a moonless night.'),
  car(31, 'Pearl Bay Skimmer', 'common', 'red-rear', 'Colour', 'Studio', 'Skims the coast road like a stone across still water.'),
  car(32, 'Tamarind Zip', 'common', 'grey-coupe', 'Colour', 'Studio', 'A little sour, a little sweet, very quick off the line.'),
  car(33, 'Indigo Rapids', 'rare', 'silver-concept', 'Colour', 'Studio', 'White-water quick, deep-indigo calm.'),
  car(34, 'Sandstone Roamer', 'common', 'white-track-rear', 'Colour', 'Studio', 'Has seen every hill fort in the state, twice.'),
  car(35, 'Electric Firefly', 'epic', 'white-supercar-dark', 'Colour', 'Studio', 'Glows a little brighter every time the power goes out.'),
  car(36, 'Rubyline', 'rare', 'purple-hypercar', 'Colour', 'Studio', 'Cut like a gemstone, with a red streak where its shadow should be.'),
  car(37, 'Moonlit Ferry', 'common', 'red-rear', 'Colour', 'Studio', 'Crosses town as calmly as the last ferry home.'),
  car(38, 'Himalayan Glacier', 'epic', 'grey-coupe', 'Colour', 'Studio', 'Cool under pressure, even in a Chennai May.'),
  car(39, 'Marina Nightfall', 'rare', 'silver-concept', 'Colour', 'Studio', 'Shows up just as the street lights come on along the beach.'),
  car(40, 'Celestial Vimana', 'legendary', 'white-track-rear', 'Colour', 'Studio', 'Said to have flown once, long ago. Nobody has proved otherwise.'),
  ] satisfies SeriesCar[],
} as const
