/**
 * What the garage Bin's dialogs say: moving a garage to the Bin, restoring
 * it, and deleting it forever. The rules are the server's (its
 * lib/vendor-bin.ts and lib/data-reset.ts); this only words them, so it is
 * pure and tested here (vendor-bin.test.ts) rather than read off a page.
 */
import type {
  AdminVendorBinResult,
  AdminVendorDeletePreview,
  AdminVendorDeleteResult,
} from '@repo/core/api/admin'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// ─── Move to bin ─────────────────────────────────────────────────────────────

/** What moving a garage to the Bin does, in the order the owner asked about it. */
export const BIN_EFFECTS = [
  "Customers can't find it, open its page or book it.",
  "Its team can't sign in to it.",
  'Its upcoming bookings are cancelled by Detlio, reason "Garage removed". Paid ones go on Refunds as owed; refund them in Razorpay as usual.',
  'Everything else is kept. Restore brings it back as it was.',
] as const

/** The line above the dialog's list of bookings it will cancel. */
export function upcomingLine(count: number, paid: number): string {
  if (count === 0) return 'No upcoming bookings to cancel.'
  const cancels = `${plural(count, 'upcoming booking', 'upcoming bookings')} will be cancelled`
  if (paid === 0) return `${cancels}. None is paid.`
  if (count === 1) return `${cancels}. It is paid.`
  return `${cancels}, ${paid} of them paid.`
}

/** What happened, once it has: said on the card's Bin list, announced. */
export function binDoneMessage(result: AdminVendorBinResult): string {
  const parts = ['Moved to the Bin.']
  if (result.cancelled.length > 0) {
    parts.push(`${plural(result.cancelled.length, 'booking', 'bookings')} cancelled.`)
  }
  if (result.refundsOwed > 0) {
    parts.push(`${plural(result.refundsOwed, 'refund is', 'refunds are')} owed on Refunds.`)
  }
  if (result.notCancelled.length > 0) {
    const refs = result.notCancelled.map((b) => `#${b.reference}`).join(', ')
    parts.push(`Couldn't cancel ${refs}: cancel ${result.notCancelled.length === 1 ? 'it' : 'them'} from Bookings.`)
  }
  return parts.join(' ')
}

// ─── Delete forever ──────────────────────────────────────────────────────────

/**
 * Whether the garage's name has been typed: the server's own rule
 * (garageNameMatches), so the button lights exactly when the server will
 * accept it. Spaces at the ends and doubled spaces are forgiven; the letters
 * and their case are not.
 */
export function confirmNameMatches(typed: string, businessName: string): boolean {
  const tidy = (value: string) => value.trim().replace(/\s+/g, ' ')
  return tidy(typed).length > 0 && tidy(typed) === tidy(businessName)
}

export type DeleteLine = { key: 'bookings' | 'pictures' | 'setup' | 'documents'; text: string }

/** What goes, as the sheet lists it under "These go with it". */
export function deleteLines(preview: Pick<AdminVendorDeletePreview, 'bookings' | 'checkouts' | 'assets'>): DeleteLine[] {
  const bookings =
    preview.bookings.deleted > 0
      ? plural(preview.bookings.deleted, 'booking', 'bookings')
      : preview.checkouts.deleted > 0
        ? 'No bookings'
        : 'No bookings to delete'
  const checkouts =
    preview.checkouts.deleted > 0
      ? `, and ${plural(preview.checkouts.deleted, 'unfinished checkout', 'unfinished checkouts')}`
      : ''
  return [
    { key: 'bookings', text: `${bookings}${checkouts}` },
    {
      key: 'pictures',
      text:
        preview.assets.videos > 0
          ? 'Logo, photos, service pictures and videos'
          : 'Logo, photos and service pictures',
    },
    { key: 'setup', text: 'Services, prices, hours and team logins' },
    // Garage documents (0043). On a tombstone the signed agreement stays,
    // with the bookings kept for their money (keptLine says those stay).
    ...(preview.assets.documents
      ? [
          {
            key: 'documents' as const,
            text:
              preview.bookings.kept + preview.checkouts.kept > 0
                ? 'Its documents (ID, bank proof and the rest), except the signed agreement'
                : 'Its documents (ID, bank proof, agreement and the rest)',
          },
        ]
      : []),
  ]
}

/**
 * The line under "Kept, for the accounts" when bookings with real money stay:
 * the garage's name and address stay with them, because their receipts
 * print it. Null when nothing is kept and the garage goes entirely.
 */
export function keptLine(preview: Pick<AdminVendorDeletePreview, 'bookings' | 'checkouts'>): string | null {
  const kept = preview.bookings.kept + preview.checkouts.kept
  if (kept === 0) return null
  const what =
    preview.bookings.kept > 0
      ? plural(preview.bookings.kept, 'booking with real money stays', 'bookings with real money stay')
      : plural(preview.checkouts.kept, 'checkout with money on it stays', 'checkouts with money on them stay')
  return `${what}, with the garage's name and address for their receipts.`
}

/** What happened, once it has. */
export function deleteDoneMessage(result: AdminVendorDeleteResult): string {
  const name = result.garage.businessName
  if (result.outcome === 'partial') {
    const left = result.remaining.chains + result.remaining.checkouts
    return `Deleted part of ${name}. ${plural(left, 'more row is', 'more rows are')} left: press Delete forever again.`
  }
  if (result.outcome === 'tombstone') {
    return `${name} was deleted. ${plural(result.keptBookings + result.keptCheckouts, 'payment record was', 'payment records were')} kept for the accounts.`
  }
  return `${name} was deleted forever.`
}
