import { describe, expect, test } from 'bun:test'
import { accountDeletionRefusal } from './account-deletion.js'

describe('accountDeletionRefusal', () => {
  test('a plain customer account with no receipts can be deleted', () => {
    expect(accountDeletionRefusal({ ownsGarage: false, hasReceipts: false })).toBeNull()
  })

  test("a garage owner's account is refused, so the garage is never cascaded away", () => {
    expect(accountDeletionRefusal({ ownsGarage: true, hasReceipts: false })).toEqual({
      code: 'VENDOR_OWNER_ACCOUNT',
      message:
        "This number owns a garage on Detlio, so the account can't be deleted here. Contact support to close it.",
    })
  })

  test('an account with a receipt is refused, as before', () => {
    expect(accountDeletionRefusal({ ownsGarage: false, hasReceipts: true })).toEqual({
      code: 'ACCOUNT_HAS_RECEIPTS',
      message:
        "Your account has bookings with payment receipts, so it can't be deleted from the app. Please call Detlio support to close it.",
    })
  })

  test('owning a garage is the reason given when both apply', () => {
    expect(
      accountDeletionRefusal({ ownsGarage: true, hasReceipts: true })?.code
    ).toBe('VENDOR_OWNER_ACCOUNT')
  })
})
