/**
 * The Detlio Garage, Series 1 (0057): 40 fictional hypercars, seeded by
 * migration 0057 (garage-series.test.ts holds the SQL to this list) and
 * then the team's to edit in admin. Every name is invented: no real make,
 * model or badge (the test runs a deny-list of real makes and models over
 * every name and line). Rows of five by number; each row mixes rarities so
 * finishing one takes luck and patience, never one lucky pull.
 *
 *   Common 20 · Rare 12 · Epic 6 · Legendary 2
 *
 * Stats are for fun: a fictional car's fictional numbers, shown as chips.
 * `paint` drives the default picture's colour (packages/core/src/garage-art.ts)
 * and names the colour the AI prompt asks for; `tone` is the card's ground
 * (a light gallery card or the dark night one).
 */
import type { GarageRarity, GarageTone } from './garage.js'

export interface SeriesCar {
  number: number
  name: string
  rarity: GarageRarity
  tone: GarageTone
  paint: string
  colour: string
  stats: [string, string, string]
  lore: string
}

function car(
  number: number,
  name: string,
  rarity: GarageRarity,
  tone: GarageTone,
  paint: string,
  colour: string,
  zeroTo100: string,
  topSpeed: number,
  lore: string
): SeriesCar {
  return { number, name, rarity, tone, paint, colour, stats: [`0–100: ${zeroTo100} s`, `Top speed: ${topSpeed} km/h`, `Colour: ${colour}`], lore }
}

export const SERIES_ONE = {
  number: 1,
  name: 'Series 1',
  cars: [
    // Row 1
    car(1, 'Marina Drift', 'common', 'light', '#6FAFA6', 'Sea Glass', '3.9', 298, 'Built for slow evening laps along the beach road, windows down.'),
    car(2, 'Chai Racer', 'common', 'light', '#6E8B4E', 'Cardamom Green', '4.1', 286, 'Never misses the four o’clock chai stop, however late the meeting runs.'),
    car(3, 'Saffron Arrow', 'rare', 'dark', '#F29A1F', 'Festival Saffron', '3.2', 322, 'Painted the shade of a festival sky at dusk.'),
    car(4, 'Copper Kite', 'common', 'light', '#B8693D', 'Burnished Copper', '3.8', 301, 'Light as a paper kite, and just as hard to catch on a windy day.'),
    car(5, 'Crimson Talon', 'epic', 'dark', '#A3172B', 'Temple Crimson', '2.6', 352, 'Its headlights narrow like a hawk’s eyes at every green light.'),
    // Row 2
    car(6, 'Coastal Glide', 'common', 'light', '#3B6FA8', 'Bay Blue', '3.7', 304, 'Tuned on the coast road, one sea breeze at a time.'),
    car(7, 'Monsoon GT', 'rare', 'dark', '#0F7A78', 'Monsoon Teal', '3.1', 326, 'Loves the first rain of June more than anyone in the city.'),
    car(8, 'Pebble Hopper', 'common', 'light', '#8E918C', 'River Pebble', '4.2', 280, 'Small, round and cheerful, like a stone skipping across a lake.'),
    car(9, 'Neem Flicker', 'common', 'light', '#4E8A3A', 'Neem Green', '3.9', 292, 'Parks in the shade of the same neem tree every afternoon.'),
    car(10, 'Kaveri Surge', 'rare', 'dark', '#566C7E', 'River Slate', '3.0', 331, 'Named after the river, and just as hard to hold back.'),
    // Row 3
    car(11, 'Harbour Flash', 'common', 'light', '#4F5965', 'Harbour Grey', '3.6', 306, 'Gone before the ferry horn has finished sounding.'),
    car(12, 'Mango Zing', 'common', 'dark', '#F2B705', 'Alphonso Yellow', '3.8', 296, 'The colour of the first mango of summer.'),
    car(13, 'Peacock Blade', 'rare', 'dark', '#0B6FA4', 'Peacock Blue', '3.1', 328, 'Shows off its colours whenever it rains.'),
    car(14, 'Kanjeevaram Silk', 'epic', 'dark', '#8E1F5C', 'Silk Magenta', '2.5', 348, 'Woven like a wedding saree: every panel has a shine of its own.'),
    car(15, 'Kolam Swirl', 'common', 'dark', '#ECE7DC', 'Rice Flour White', '4.0', 289, 'Leaves a neat pattern of tyre tracks at every sunrise.'),
    // Row 4
    car(16, 'Ghat Road Rally', 'rare', 'light', '#5E7F6B', 'Eucalyptus', '3.3', 318, 'Counts hairpin bends the way others count sheep.'),
    car(17, 'Filter Coffee GT', 'common', 'light', '#5A3A26', 'Decoction Brown', '3.9', 294, 'Strong, smooth and best enjoyed early in the morning.'),
    car(18, 'Jasmine Glint', 'common', 'dark', '#F3EFE4', 'Jasmine White', '4.1', 284, 'Smells faintly of jasmine, and nobody knows why.'),
    car(19, 'Coromandel Flyer', 'rare', 'dark', '#13A3A0', 'Coast Turquoise', '3.0', 333, 'Races the sunrise up the coast, and usually wins.'),
    car(20, 'Chola Thunder', 'legendary', 'dark', '#B07A2A', 'Temple Bronze', '2.1', 404, 'Carved like a temple chariot, built to cross an empire in an afternoon.'),
    // Row 5
    car(21, 'Rangoli Twist', 'common', 'light', '#D9507F', 'Rangoli Pink', '3.8', 297, 'Comes alive at Diwali, like every doorstep in town.'),
    car(22, 'Teal Tide', 'common', 'light', '#2A9D8F', 'Lagoon Teal', '3.7', 302, 'Arrives quietly, then suddenly it is everywhere, like the evening tide.'),
    car(23, 'Midnight Current', 'rare', 'light', '#1B2A5C', 'Midnight Blue', '3.1', 329, 'Hums along empty flyovers long after the city sleeps.'),
    car(24, 'Silver Sparrow', 'common', 'dark', '#B7BCC4', 'Sparrow Silver', '4.0', 288, 'Small, quick and never far from home.'),
    car(25, 'Solar Flare', 'epic', 'dark', '#FF5A1F', 'Flare Orange', '2.7', 356, 'So bright that the parking attendant reaches for sunglasses.'),
    // Row 6
    car(26, 'Banyan Loop', 'common', 'light', '#6B6B3A', 'Banyan Olive', '4.0', 287, 'Takes the long way round, under every banyan it can find.'),
    car(27, 'Emerald Parakeet', 'rare', 'dark', '#1E9E55', 'Parakeet Green', '3.2', 321, 'A chatty exhaust and a bright green coat: impossible to ignore.'),
    car(28, 'Gulmohar Ember', 'common', 'light', '#C8402A', 'Gulmohar Red', '3.6', 305, 'Blooms red every May, right on time.'),
    car(29, 'Nilgiri Mist', 'rare', 'light', '#7F97AA', 'Hill Mist Blue', '3.3', 316, 'Climbs into the clouds and comes back smelling of tea leaves.'),
    car(30, 'Obsidian Halo', 'epic', 'dark', '#17181D', 'Obsidian Black', '2.4', 361, 'Seen only as a glow of headlights on a moonless night.'),
    // Row 7
    car(31, 'Pearl Bay Skimmer', 'common', 'dark', '#E6E9EC', 'Pearl White', '3.9', 293, 'Skims the coast road like a stone across still water.'),
    car(32, 'Tamarind Zip', 'common', 'light', '#7A4B2A', 'Tamarind Brown', '3.7', 299, 'A little sour, a little sweet, very quick off the line.'),
    car(33, 'Indigo Rapids', 'rare', 'dark', '#3A2E9C', 'Deep Indigo', '3.0', 334, 'White-water quick, deep-indigo calm.'),
    car(34, 'Sandstone Roamer', 'common', 'dark', '#C8A77E', 'Desert Sandstone', '4.1', 285, 'Has seen every hill fort in the state, twice.'),
    car(35, 'Electric Firefly', 'epic', 'dark', '#A8D42A', 'Firefly Lime', '2.6', 350, 'Glows a little brighter every time the power goes out.'),
    // Row 8
    car(36, 'Rubyline', 'rare', 'light', '#9B111E', 'Ruby Red', '3.1', 327, 'Cut like a gemstone, with a red streak where its shadow should be.'),
    car(37, 'Moonlit Ferry', 'common', 'dark', '#A9B0BA', 'Moonstone Grey', '3.8', 295, 'Crosses town as calmly as the last ferry home.'),
    car(38, 'Himalayan Glacier', 'epic', 'dark', '#9FD3E6', 'Glacier Blue', '2.5', 358, 'Cool under pressure, even in a Chennai May.'),
    car(39, 'Marina Nightfall', 'rare', 'light', '#4B2A5C', 'Dusk Purple', '3.2', 324, 'Shows up just as the street lights come on along the beach.'),
    car(40, 'Celestial Vimana', 'legendary', 'dark', '#D4AF37', 'Celestial Gold', '1.9', 418, 'Said to have flown once, long ago. Nobody has proved otherwise.'),
  ] satisfies SeriesCar[],
} as const
