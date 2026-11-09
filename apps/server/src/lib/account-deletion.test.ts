import { describe, expect, test } from 'bun:test'
import {
  adminDeletionCheck,
  anonymisedUser,
  anonymisedVehicle,
  DELETED_ACCOUNT_NAME,
  DELETED_PHONE_PREFIX,
  deletedPhone,
  deletionBlockers,
  isDeletedPhone,
  type AccountDeletionFacts,
} from './account-deletion.js'

const NOTHING_OPEN: AccountDeletionFacts = {
  ownsGarage: false,
  openBookings: [],
  openCheckout: false,
  refundsOwed: [],
  creditBalancePaise: 0,
  unredeemedGifts: [],
}

describe('deletionBlockers (0066: anonymise instead of refuse)', () => {
  test('nothing open: the account can be deleted, whatever its history', () => {
    // Receipts, past bookings, gifts redeemed and spent: none of these block
    // any more. They are kept; the person is blanked.
    expect(deletionBlockers(NOTHING_OPEN)).toEqual([])
  })

  test('owning a garage blocks, and says how to close it', () => {
    const [blocker] = deletionBlockers({ ...NOTHING_OPEN, ownsGarage: true })
    expect(blocker!.code).toBe('VENDOR_OWNER_ACCOUNT')
    expect(blocker!.message).toContain('Close my garage')
  })

  test('an upcoming or in-progress booking blocks, naming it', () => {
    const one = deletionBlockers({ ...NOTHING_OPEN, openBookings: [{ reference: 'AB12CD34', status: 'confirmed' }] })
    expect(one).toEqual([
      {
        code: 'ACCOUNT_HAS_OPEN_BOOKING',
        message: 'Your booking #AB12CD34 is still open. Cancel it, or wait until it is done, then delete your account.',
      },
    ])
    const many = deletionBlockers({
      ...NOTHING_OPEN,
      openBookings: ['A1', 'B2', 'C3', 'D4'].map((reference) => ({ reference, status: 'pending' })),
    })
    expect(many[0]!.message).toContain('#A1, #B2, #C3 and 1 more')
  })

  test('a payment in progress blocks', () => {
    expect(deletionBlockers({ ...NOTHING_OPEN, openCheckout: true }).map((b) => b.code)).toEqual([
      'ACCOUNT_HAS_OPEN_CHECKOUT',
    ])
  })

  test('a refund still owed to them blocks, with the total and each booking', () => {
    const [blocker] = deletionBlockers({
      ...NOTHING_OPEN,
      refundsOwed: [
        { reference: 'AB12CD34', amount: '299.00' },
        { reference: 'EF56GH78', amount: '2.00' },
      ],
    })
    expect(blocker!.code).toBe('ACCOUNT_REFUND_OWED')
    expect(blocker!.message).toContain('₹301')
    expect(blocker!.message).toContain('#AB12CD34 ₹299')
    expect(blocker!.message).toContain('#EF56GH78 ₹2')
  })

  test('a redo claim nobody has decided blocks: a refund could still be owed', () => {
    const [blocker] = deletionBlockers({ ...NOTHING_OPEN, openClaims: [{ reference: 'AB12CD34' }] })
    expect(blocker!.code).toBe('ACCOUNT_HAS_OPEN_CLAIM')
    expect(blocker!.message).toContain('#AB12CD34')
    expect(blocker!.message).toContain('Withdraw it')
  })

  test('Detlio credit left blocks: deleting would lose it', () => {
    const [blocker] = deletionBlockers({ ...NOTHING_OPEN, creditBalancePaise: 50_050 })
    expect(blocker!.code).toBe('ACCOUNT_HAS_CREDIT')
    expect(blocker!.message).toContain('₹500.5')
  })

  test('a gift they bought that nobody redeemed yet blocks, with its number and expiry', () => {
    const [blocker] = deletionBlockers({
      ...NOTHING_OPEN,
      unredeemedGifts: [{ number: 'G-000123', expiresAt: new Date('2027-10-05T06:30:00Z') }],
    })
    expect(blocker!.code).toBe('ACCOUNT_HAS_UNREDEEMED_GIFT')
    expect(blocker!.message).toContain('G-000123')
    expect(blocker!.message).toContain('5 Oct 2027')
  })

  test('every open thing is listed, garage first', () => {
    const codes = deletionBlockers({
      ownsGarage: true,
      openBookings: [{ reference: 'AB12CD34', status: 'in_progress' }],
      openCheckout: true,
      refundsOwed: [{ reference: 'AB12CD34', amount: '10.00' }],
      creditBalancePaise: 100,
      unredeemedGifts: [{ number: 'G-000001', expiresAt: null }],
    }).map((b) => b.code)
    expect(codes).toEqual([
      'VENDOR_OWNER_ACCOUNT',
      'ACCOUNT_HAS_OPEN_BOOKING',
      'ACCOUNT_HAS_OPEN_CHECKOUT',
      'ACCOUNT_REFUND_OWED',
      'ACCOUNT_HAS_CREDIT',
      'ACCOUNT_HAS_UNREDEEMED_GIFT',
    ])
  })
})

describe('the phone is freed', () => {
  test('a placeholder of letters only, 20 characters, never a number', () => {
    const phone = deletedPhone(new Uint8Array(12).map((_, i) => i * 37))
    expect(phone.startsWith(DELETED_PHONE_PREFIX)).toBe(true)
    expect(phone).toHaveLength(20)
    expect(phone.slice(DELETED_PHONE_PREFIX.length)).toMatch(/^[a-z]{12}$/)
    // So the old number no longer matches the account: a new sign-up with
    // it makes a new account, and no lookup by digits ever finds this row.
    expect(phone).not.toMatch(/\d/)
    expect(isDeletedPhone(phone)).toBe(true)
    expect(isDeletedPhone('9876543210')).toBe(false)
    expect(isDeletedPhone(null)).toBe(false)
  })

  test('needs enough randomness', () => {
    expect(() => deletedPhone(new Uint8Array(4))).toThrow()
  })
})

describe('anonymisedUser: what is blanked and what is kept', () => {
  const now = new Date('2026-10-29T10:00:00Z')
  const update = anonymisedUser({ now, phone: 'deleted-abcdefghijkl' })

  test('blanks the person and every switch', () => {
    expect(update).toEqual({
      name: DELETED_ACCOUNT_NAME,
      phone: 'deleted-abcdefghijkl',
      email: null,
      avatarUrl: null,
      avatarStorageKey: null,
      phoneVerified: false,
      isVendorOwner: false,
      pushBookingUpdates: false,
      pushReminders: false,
      birthdayMonth: null,
      birthdayDay: null,
      deletedAt: now,
    })
  })

  test('never touches the id, the customer flag, the status or when it was made', () => {
    for (const kept of ['id', 'isCustomer', 'status', 'createdAt']) {
      expect(Object.keys(update)).not.toContain(kept)
    }
  })

  test('a car a booking names keeps its make and model, never its plate or colour', () => {
    expect(anonymisedVehicle(now)).toEqual({ licensePlate: null, color: null, isDefault: false, archivedAt: now })
  })
})

describe('adminDeletionCheck: the owner deletes from admin (10 Nov 2026)', () => {
  const none = {
    ownsGarage: false,
    openBookings: [],
    openCheckout: false,
    openClaims: [],
    refundsOwed: [],
    creditBalancePaise: 0,
    unredeemedGifts: [],
  }

  test('nothing open: no block and no warnings', () => {
    expect(adminDeletionCheck(none)).toEqual({ block: null, warnings: [] })
  })

  test('owning a garage still blocks it, in the team\'s words', () => {
    expect(adminDeletionCheck({ ...none, ownsGarage: true }).block).toEqual({
      code: 'VENDOR_OWNER_ACCOUNT',
      message: 'This person owns a garage. Remove them from the garage first.',
    })
  })

  test('everything else that stops the customer is a warning saying what happens to it', () => {
    const check = adminDeletionCheck({
      ...none,
      openBookings: [{ reference: 'AB12CD34', status: 'confirmed' }],
      openCheckout: true,
      openClaims: [{ reference: 'EF56AB78' }],
      refundsOwed: [{ reference: 'AB12CD34', amount: '450.00' }],
      creditBalancePaise: 20000,
      unredeemedGifts: [{ number: 'G-000012', expiresAt: null }],
    })
    expect(check.block).toBeNull()
    expect(check.warnings.map((w) => w.code)).toEqual([
      'ACCOUNT_HAS_OPEN_BOOKING',
      'ACCOUNT_HAS_OPEN_CHECKOUT',
      'ACCOUNT_HAS_OPEN_CLAIM',
      'ACCOUNT_REFUND_OWED',
      'ACCOUNT_HAS_CREDIT',
      'ACCOUNT_HAS_UNREDEEMED_GIFT',
    ])
    expect(check.warnings[0]!.message).toBe(
      'Booking #AB12CD34 is still on. It is cancelled first without telling the customer or the garage; a paid one becomes a refund owed on the Refunds page.'
    )
    expect(check.warnings[3]!.message).toBe('₹450 is still owed back to them (#AB12CD34 ₹450). It stays on the Refunds page.')
    expect(check.warnings[4]!.message).toBe("They have ₹200 of Detlio credit. It can't be used once the account is gone.")
  })

  test('two open bookings are named together', () => {
    const check = adminDeletionCheck({
      ...none,
      openBookings: [
        { reference: 'AAAA0001', status: 'pending' },
        { reference: 'AAAA0002', status: 'in_progress' },
      ],
    })
    expect(check.warnings[0]!.message).toStartWith('Bookings #AAAA0001, #AAAA0002 are still on. They are cancelled first')
  })
})
