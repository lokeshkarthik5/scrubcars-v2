/**
 * Detlio Wrapped (0054): the story cards, from the API's year stats
 * (GET /users/me/rewards/wrapped). The same card list draws the screen and
 * each shared image, so they always say the same thing. Only the first
 * name (when the customer leaves it on) and garage names appear; never a
 * phone, a plate, an address or a booking.
 */

import { rewardRupees } from './rewards'
import { msg, t, tn } from './i18n/translate'

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



/** "₹1,240" */
function rupees(amount: string): string {
  return rewardRupees(amount)
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
      eyebrow: name
        ? t("{name}'s {year} with Detlio", { name, year: stats.year })
        : t('My {year} with Detlio', { year: stats.year }),
      big: tn(stats.washes, '{count} wash', '{count} washes'),
      caption: stats.washes === 1 ? t('One booking, done right.') : t('Booked, done and shining.'),
      extra: [],
    },
  ]
  if (Number(stats.saved) >= 1) {
    cards.push({
      key: 'saved',
      eyebrow: t('Saved with Detlio Rewards'),
      big: rupees(stats.saved),
      caption: t('Stamps, scratch cards and rewards, spent well.'),
      extra: [],
    })
  }
  if (stats.favouriteGarage) {
    cards.push({
      key: 'garage',
      eyebrow: t('Favourite garage'),
      big: stats.favouriteGarage.name,
      caption: tn(stats.favouriteGarage.washes, '{count} visit this year.', '{count} visits this year.'),
      extra: [],
    })
  }
  if (stats.busiestMonth) {
    cards.push({
      key: 'month',
      eyebrow: t('Busiest month'),
      big: stats.busiestMonth.label,
      caption:
        stats.longestStreak >= 2
          ? tn(
              stats.busiestMonth.washes,
              '{count} wash that month, and a {streak}-month streak.',
              '{count} washes that month, and a {streak}-month streak.',
              { streak: stats.longestStreak }
            )
          : tn(stats.busiestMonth.washes, '{count} wash that month.', '{count} washes that month.'),
      extra: [],
    })
  }
  cards.push({
    key: 'level',
    eyebrow: t('Level reached'),
    big: t(stats.level.label),
    caption:
      stats.badges.count === 0
        ? t('Badges are next.')
        : tn(stats.badges.count, '{count} badge earned.', '{count} badges earned.'),
    extra: stats.badges.names.slice(0, 3),
  })
  cards.push({
    key: 'shine',
    eyebrow: t('Days your car shone'),
    big: tn(stats.shineDays, '{count} day', '{count} days'),
    caption: t('Counting the week after every wash.'),
    extra: [],
  })
  cards.push({
    key: 'closing',
    eyebrow: t('That was {year}', { year: stats.year }),
    big: t('Keep shining'),
    caption: t('Book your next wash on detlio.com'),
    extra: [],
  })
  return cards
}

/** The line every shared image carries. */
export const WRAPPED_SHARE_LINE = msg('Book on detlio.com')
