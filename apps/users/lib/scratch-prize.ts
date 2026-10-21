import type { ScratchOutcome } from '@repo/core/rewards'
import { rewardRupees } from '@repo/core/rewards'

/**
 * How a scratch card's prize is revealed (0050), pure so the words and the
 * looks are unit-tested. The prize itself is the server's: these only
 * dress it.
 *
 *   silver   the small money prizes (₹20, ₹50 by default)
 *   gold     the big money prize (₹100)
 *   stamp    a bonus stamp (also a money prize the month's budget turned
 *            into a stamp: the server then answers `bonus_stamp`)
 *   jackpot  a free wash: gold, with a burst of confetti
 */
export type PrizeTier = 'silver' | 'gold' | 'stamp' | 'jackpot'

export function prizeTier(outcome: ScratchOutcome): PrizeTier {
  switch (outcome) {
    case 'bonus_stamp':
      return 'stamp'
    case 'free_wash':
      return 'jackpot'
    case 'big_off':
      return 'gold'
    default:
      return 'silver'
  }
}

/** The revealed card's three lines: "You won" / "₹50" / "off your next booking". */
export function prizeLines(prize: { outcome: ScratchOutcome; amount: string | null }): { eyebrow: string; big: string; small: string } {
  switch (prize.outcome) {
    case 'bonus_stamp':
      return { eyebrow: 'You won', big: 'Bonus stamp', small: 'One more star on your Shine Card' }
    case 'free_wash':
      return { eyebrow: 'Jackpot', big: 'Free wash', small: `Up to ${rewardRupees(prize.amount)} off a booking` }
    default:
      return { eyebrow: 'You won', big: rewardRupees(prize.amount), small: 'off your next booking' }
  }
}

/** Whether the prize is money to spend at checkout (a voucher). */
export function isMoneyPrize(outcome: ScratchOutcome): boolean {
  return outcome !== 'bonus_stamp'
}

/**
 * When a voucher with this last day (an IST date, "2026-12-17") stops
 * working: the end of that day in India, as checkout's pending code wants it.
 */
export function voucherEndsAt(lastDay: string): string {
  return new Date(`${lastDay}T23:59:59.999+05:30`).toISOString()
}
