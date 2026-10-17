/**
 * Why `DELETE /users/me` must refuse an account, if it must.
 *
 * Deleting a user row cascades: their bookings go with it, and through
 * `vendors.owner_id` (ON DELETE CASCADE) so does any garage they own — that
 * garage's services, its bookings from other customers, and their payments.
 * Both are records that have to stay, so either fact closes the self-serve
 * path and the person is sent to support instead.
 *
 * Owning a garage is checked first: it is the wider cascade, and the support
 * conversation for it (who takes the garage over, or how it closes) is the one
 * that has to happen anyway.
 */
export interface AccountDeletionFacts {
  /** The account is `vendors.owner_id` of at least one garage. */
  ownsGarage: boolean
  /** A receipt number was issued on one of the account's own bookings. */
  hasReceipts: boolean
}

export interface AccountDeletionRefusal {
  code: 'VENDOR_OWNER_ACCOUNT' | 'ACCOUNT_HAS_RECEIPTS'
  message: string
}

export function accountDeletionRefusal(
  facts: AccountDeletionFacts
): AccountDeletionRefusal | null {
  if (facts.ownsGarage) {
    return {
      code: 'VENDOR_OWNER_ACCOUNT',
      message:
        "This number owns a garage on Detlio, so the account can't be deleted here. Contact support to close it.",
    }
  }

  // A receipt number is never reused or renumbered, so the bookings one was
  // issued on have to stay (receipt_numbers' foreign key would refuse the
  // cascade anyway, as a bare 500).
  if (facts.hasReceipts) {
    return {
      code: 'ACCOUNT_HAS_RECEIPTS',
      message:
        "Your account has bookings with payment receipts, so it can't be deleted from the app. Please call Detlio support to close it.",
    }
  }

  return null
}
