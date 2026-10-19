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
    // Row 1
    car(1, 'Gulmohar Ember', 'common', 'red-rear', 'Red', 'Rain', 'Glows like a gulmohar in full bloom, even under a June shower.'),
    car(2, 'Coastal Glide', 'common', 'blue-coupe-white-studio', 'Sky blue', 'Studio', 'Sky blue, like the sea on a still morning.'),
    car(3, 'Saffron Arrow', 'rare', 'orange-coupe-side', 'Orange', 'Studio', 'Painted the shade of a festival sky at dusk.'),
    car(4, 'Neem Flicker', 'common', 'green-coupe-front', 'Green', 'Studio', 'Cool and green, like the shade of a neem tree at noon.'),
    car(5, 'Crimson Talon', 'epic', 'red-supercar-studio', 'Red', 'Dark studio', 'Sharp lines, deep red, and a studio light that never quite lets go.'),
    // Row 2
    car(6, 'Kolam Swirl', 'common', 'white-supercar-front', 'White', 'Studio', 'As crisp as a kolam drawn at sunrise.'),
    car(7, 'Rangoli Twist', 'common', 'purple-coupe-open-lot', 'Purple', 'Park', 'Comes alive at Diwali, like every doorstep in town.'),
    car(8, 'Peacock Blade', 'rare', 'blue-coupe-rear', 'Deep blue', 'Countryside', 'Shows off its colours whenever the sun comes out.'),
    car(9, 'Mango Zing', 'common', 'yellow-coupe-stripes', 'Yellow and black', 'City', 'The colour of the first mango of summer, with a stripe of shade.'),
    car(10, 'Midnight Current', 'epic', 'blue-supercar-outline', 'Blue', 'Dark studio', 'Drawn in a single line of light, like the city after midnight.'),
    // Row 3
    car(11, 'Silver Sparrow', 'common', 'silver-roadster-front', 'Silver', 'Studio', 'Small, bright and never far from home.'),
    car(12, 'Jacaranda Dusk', 'rare', 'purple-coupe-dusk', 'Purple', 'Dusk', 'Purple as a jacaranda in bloom, just as the street lights come on.'),
    car(13, 'Banyan Loop', 'common', 'green-coupe-rooftop', 'Green', 'Rooftop', 'Takes the long way round, under every banyan it can find.'),
    car(14, 'Kajal Edge', 'rare', 'black-widebody-front', 'Black', 'Studio', 'Black as kajal, with a sharp line at every edge.'),
    car(15, 'Kasavu Drift', 'common', 'white-gold-coupe', 'White and gold', 'Park', 'White with a gold border, like a kasavu saree on Onam.'),
    // Row 4
    car(16, 'Ghat Road Rally', 'common', 'green-racer', 'Racing green', 'Studio', 'Made for hairpin bends and the smell of eucalyptus.'),
    car(17, 'Filter Coffee GT', 'common', 'black-coupe-rooftop', 'Black', 'Rooftop', 'Strong, dark and best enjoyed early in the morning.'),
    car(18, 'Marigold Flare', 'rare', 'orange-supercar-close', 'Orange', 'Close up', 'Bright as a marigold garland, and just as hard to miss.'),
    car(19, 'Chola Thunder', 'rare', 'bronze-coupe-side', 'Bronze', 'Studio', 'Bronze like a temple bell, and just as hard to ignore.'),
    car(20, 'Crimson Reverie', 'legendary', 'red-concept-reflection', 'Red', 'Mirror floor', 'So red that even its reflection looks like a dream.'),
    // Row 5
    car(21, 'Marina Drift', 'common', 'blue-coupe-grey-street', 'Blue', 'Street', 'Built for slow evening drives along the beach road, windows down.'),
    car(22, 'Jasmine Glint', 'common', 'white-coupe-side', 'White', 'Studio', 'Soft white, like a string of jasmine on a summer evening.'),
    car(23, 'Jamun Blur', 'rare', 'purple-hypercar', 'Purple', 'Track', 'The colour of ripe jamun, gone in a purple blur.'),
    car(24, 'Pearl Bay Skimmer', 'common', 'white-supercar-dark', 'White', 'Dark studio', 'Pearl white against the dark, like a lamp by the sea.'),
    car(25, 'Emerald Canopy', 'epic', 'green-coupe-from-above', 'Green', 'From above', 'Seen from above, it shines like the canopy after the first rain.'),
    // Row 6
    car(26, 'Chrome Kite', 'common', 'silver-concept', 'Silver', 'Studio', 'Silver curves, drawn as if with a single stroke.'),
    car(27, 'Lavender Kite', 'common', 'lavender-coupe-head-on', 'Lavender', 'Park', 'Soft lavender, light as a kite on a still afternoon.'),
    car(28, 'Nilgiri Mist', 'rare', 'green-grey-concept', 'Dark green', 'Studio', 'Climbs into the clouds and comes back smelling of tea leaves.'),
    car(29, 'Harbour Flash', 'common', 'grey-coupe', 'Matte grey', 'City', 'Harbour grey with a flash of yellow, parked where the ferries turn.'),
    car(30, 'Obsidian Halo', 'epic', 'black-coupe-blue-light', 'Black', 'Blue light', 'Black as obsidian, lit by a halo of blue.'),
    // Row 7
    car(31, 'Electric Firefly', 'rare', 'yellow-coupe-street', 'Yellow', 'Night street', 'Glows a little brighter every time the street lights go out.'),
    car(32, 'Moonlit Marina', 'rare', 'silver-coupe-black', 'Silver', 'Night', 'Silver under the moon, with the beach road all to itself.'),
    car(33, 'Moonlit Ferry', 'common', 'white-roadster-garage', 'White', 'Garage', 'Waits in the dark as calmly as the last ferry home.'),
    car(34, 'Kaveri Surge', 'common', 'silver-supercar-close', 'Silver', 'Grey studio', 'River grey, and just as calm before it moves.'),
    car(35, 'Saffron Dusk', 'epic', 'silver-hypercar-light', 'Silver', 'Studio light', 'Silver caught in the last saffron light of the day.'),
    // Row 8
    car(36, 'Kolam Wing', 'rare', 'white-wing-rear', 'White and red', 'Garage', 'A wing as bold as a festival kolam, on a chequered floor.'),
    car(37, 'Monsoon Plum', 'common', 'purple-coupe-overcast', 'Purple', 'Overcast', 'Deep plum under grey skies, the colour of a monsoon evening.'),
    car(38, 'Marina Nightfall', 'rare', 'white-track-rear', 'White', 'Night studio', 'Shows up just as the lights turn violet along the beach.'),
    car(39, 'Neelam Night', 'epic', 'blue-classic-coupe', 'Dark blue', 'Dark studio', 'Deep sapphire blue, polished for a night that never ends.'),
    car(40, 'Celestial Vimana', 'legendary', 'white-concept-top', 'White', 'Black studio', 'Said to have flown once, long ago. Nobody has proved otherwise.'),
  ] satisfies SeriesCar[],
} as const
