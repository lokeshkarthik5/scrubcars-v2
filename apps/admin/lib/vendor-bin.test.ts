import { describe, expect, test } from 'bun:test'
import type { AdminVendorBinResult, AdminVendorDeleteResult } from '@repo/core/api/admin'
import {
  BIN_EFFECTS,
  binDoneMessage,
  confirmNameMatches,
  deleteDoneMessage,
  deleteLines,
  keptLine,
  upcomingLine,
} from './vendor-bin'

const assets = { photos: 3, servicePictures: 4, videos: 0, services: 6, teamLogins: 2 }

describe('move to bin', () => {
  test('says what happens before anyone confirms', () => {
    expect(BIN_EFFECTS).toHaveLength(4)
    expect(BIN_EFFECTS.join(' ')).toContain('Garage removed')
    expect(BIN_EFFECTS.join(' ')).toContain('Refunds')
    // Plain and honest: nothing is refunded by the app.
    expect(BIN_EFFECTS.join(' ')).not.toMatch(/refunded automatically|guarantee/i)
  })

  test('the bookings it will cancel, and how many are paid', () => {
    expect(upcomingLine(0, 0)).toBe('No upcoming bookings to cancel.')
    expect(upcomingLine(1, 0)).toBe('1 upcoming booking will be cancelled. None is paid.')
    expect(upcomingLine(1, 1)).toBe('1 upcoming booking will be cancelled. It is paid.')
    expect(upcomingLine(3, 2)).toBe('3 upcoming bookings will be cancelled, 2 of them paid.')
  })

  test('what was done, refunds owed and anything it could not cancel', () => {
    const result: AdminVendorBinResult = {
      garage: { id: 'g', businessName: 'Zero H2O', deletedAt: null, deletedByName: null, deletedReason: null },
      auditId: 'a',
      cancelled: [
        { id: 'b1', reference: 'AB12CD34', paid: true },
        { id: 'b2', reference: 'EF56GH78', paid: false },
      ],
      refundsOwed: 1,
      notCancelled: [{ id: 'b3', reference: '1234ABCD', message: 'x' }],
    }
    expect(binDoneMessage(result)).toBe(
      "Moved to the Bin. 2 bookings cancelled. 1 refund is owed on Refunds. Couldn't cancel #1234ABCD: cancel it from Bookings."
    )
    expect(binDoneMessage({ ...result, cancelled: [], refundsOwed: 0, notCancelled: [] })).toBe(
      'Moved to the Bin.'
    )
  })
})

describe('delete forever', () => {
  test('the typed name must be the garage name, give or take spaces', () => {
    expect(confirmNameMatches('Detlio (test garage)', 'Detlio (test garage)')).toBe(true)
    expect(confirmNameMatches(' Detlio  (test garage) ', 'Detlio (test garage)')).toBe(true)
    expect(confirmNameMatches('detlio (test garage)', 'Detlio (test garage)')).toBe(false)
    expect(confirmNameMatches('Detlio', 'Detlio (test garage)')).toBe(false)
    expect(confirmNameMatches('', '')).toBe(false)
  })

  test('what goes, as in the mockup', () => {
    expect(
      deleteLines({ bookings: { deleted: 12, kept: 0 }, checkouts: { deleted: 0, kept: 0 }, assets }).map(
        (line) => line.text
      )
    ).toEqual([
      '12 bookings',
      'Logo, photos and service pictures',
      'Services, prices, hours and team logins',
    ])
    expect(
      deleteLines({
        bookings: { deleted: 1, kept: 0 },
        checkouts: { deleted: 2, kept: 0 },
        assets: { ...assets, videos: 1 },
      }).map((line) => line.text)
    ).toEqual([
      '1 booking, and 2 unfinished checkouts',
      'Logo, photos, service pictures and videos',
      'Services, prices, hours and team logins',
    ])
    expect(
      deleteLines({ bookings: { deleted: 0, kept: 0 }, checkouts: { deleted: 0, kept: 0 }, assets })[0].text
    ).toBe('No bookings to delete')
  })

  test('says when real money keeps bookings, and the name and address with them', () => {
    expect(keptLine({ bookings: { deleted: 2, kept: 0 }, checkouts: { deleted: 0, kept: 0 } })).toBeNull()
    expect(keptLine({ bookings: { deleted: 2, kept: 1 }, checkouts: { deleted: 0, kept: 0 } })).toBe(
      "1 booking with real money stays, with the garage's name and address for their receipts."
    )
    expect(keptLine({ bookings: { deleted: 0, kept: 0 }, checkouts: { deleted: 0, kept: 2 } })).toBe(
      "2 checkouts with money on them stay, with the garage's name and address for their receipts."
    )
  })

  test('what happened', () => {
    const result: AdminVendorDeleteResult = {
      garage: { id: 'g', businessName: 'Zero H2O' },
      outcome: 'hard_delete',
      auditId: 'a',
      countLines: [],
      receiptPlan: [],
      keptBookings: 0,
      keptCheckouts: 0,
      remaining: { chains: 0, checkouts: 0 },
    }
    expect(deleteDoneMessage(result)).toBe('Zero H2O was deleted forever.')
    expect(deleteDoneMessage({ ...result, outcome: 'tombstone', keptBookings: 2 })).toBe(
      'Zero H2O was deleted. 2 payment records were kept for the accounts.'
    )
    expect(
      deleteDoneMessage({ ...result, outcome: 'partial', remaining: { chains: 4, checkouts: 0 } })
    ).toBe('Deleted part of Zero H2O. 4 more rows are left: press Delete forever again.')
  })
})

describe('delete forever: garage documents', () => {
  const preview = (documents: number, kept = 0) => ({
    bookings: { deleted: 2, kept },
    checkouts: { deleted: 0, kept: 0 },
    assets: { ...assets, documents },
  })

  test('says its documents go, and that the signed agreement stays when bookings are kept', () => {
    expect(deleteLines(preview(0)).map((line) => line.key)).toEqual(['bookings', 'pictures', 'setup'])
    expect(deleteLines(preview(4)).find((line) => line.key === 'documents')?.text).toBe(
      'Its documents (ID, bank proof, agreement and the rest)'
    )
    expect(deleteLines(preview(4, 1)).find((line) => line.key === 'documents')?.text).toBe(
      'Its documents (ID, bank proof and the rest), except the signed agreement'
    )
  })
})
