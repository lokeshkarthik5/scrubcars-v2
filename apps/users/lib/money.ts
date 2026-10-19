import { formatINR } from '@repo/core/format'

/**
 * Rupees as the customer app shows them: @repo/core/format's formatINR with
 * paise only when there are any ("₹1,349", "₹337.50"). Takes the API's
 * decimal strings ("800.00") as well as numbers.
 */
export function money(amount: number | string): string {
  return formatINR(Number(amount), { paise: true })
}
