/**
 * Detlio Wrapped (0054): the story cards, from the API's year stats
 * (GET /users/me/rewards/wrapped). The same card list draws the screen and
 * each shared image, so they always say the same thing. Only the first
 * name (when the customer leaves it on) and garage names appear; never a
 * phone, a plate, an address or a booking.
 */

export interface WrappedStats {
  year: number
  firstName: string | null
  washes: number
  saved: string
  favouriteGarage: { name: string; washes: number } | null
  busiestMonth: { month: number; label: string; washes: number } | null
  longestStreak: number
  level: { key: string; label: string }
  badges: { count: number; names: string[] }
  shineDays: number
}

export type WrappedCardKey = 'washes' | 'saved' | 'garage' | 'month' | 'level' | 'shine' | 'closing'

export interface WrappedCard {
  key: WrappedCardKey
  /** The small line above. */
  eyebrow: string
  /** The big figure or name. */
  big: string
  /** The sentence under it. */
  caption: string
  /** Extra short lines (badge names), at most three. */
  extra: string[]
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`
}

/** "₹1,240" */
function rupees(amount: string): string {
  return `₹${Math.round(Number(amount)).toLocaleString('en-IN')}`
}

/**
 * The cards, 5 to 7: washes, money saved (when any), favourite garage,
 * busiest month and streak, level and badges, shine days, and the close.
 * `showName` false leaves the first name out everywhere.
 */
export function wrappedCards(stats: WrappedStats, options: { showName: boolean }): WrappedCard[] {
  const name = options.showName && stats.firstName ? stats.firstName : null
  const cards: WrappedCard[] = [
    {
      key: 'washes',
      eyebrow: name ? `${name}'s ${stats.year} with Detlio` : `My ${stats.year} with Detlio`,
      big: plural(stats.washes, 'wash', 'washes'),
      caption: stats.washes === 1 ? 'One booking, done right.' : 'Booked, done and shining.',
      extra: [],
    },
  ]
  if (Number(stats.saved) >= 1) {
    cards.push({
      key: 'saved',
      eyebrow: 'Saved with Detlio Rewards',
      big: rupees(stats.saved),
      caption: 'Stamps, scratch cards and rewards, spent well.',
      extra: [],
    })
  }
  if (stats.favouriteGarage) {
    cards.push({
      key: 'garage',
      eyebrow: 'Favourite garage',
      big: stats.favouriteGarage.name,
      caption: `${plural(stats.favouriteGarage.washes, 'visit', 'visits')} this year.`,
      extra: [],
    })
  }
  if (stats.busiestMonth) {
    cards.push({
      key: 'month',
      eyebrow: 'Busiest month',
      big: stats.busiestMonth.label,
      caption:
        stats.longestStreak >= 2
          ? `${plural(stats.busiestMonth.washes, 'wash', 'washes')} that month, and a ${stats.longestStreak}-month streak.`
          : `${plural(stats.busiestMonth.washes, 'wash', 'washes')} that month.`,
      extra: [],
    })
  }
  cards.push({
    key: 'level',
    eyebrow: 'Level reached',
    big: stats.level.label,
    caption: stats.badges.count === 0 ? 'Badges are next.' : `${plural(stats.badges.count, 'badge', 'badges')} earned.`,
    extra: stats.badges.names.slice(0, 3),
  })
  cards.push({
    key: 'shine',
    eyebrow: 'Days your car shone',
    big: plural(stats.shineDays, 'day', 'days'),
    caption: 'Counting the week after every wash.',
    extra: [],
  })
  cards.push({
    key: 'closing',
    eyebrow: `That was ${stats.year}`,
    big: 'Keep shining',
    caption: 'Book your next wash on detlio.com',
    extra: [],
  })
  return cards
}

/** The line every shared image carries. */
export const WRAPPED_SHARE_LINE = 'Book on detlio.com'
