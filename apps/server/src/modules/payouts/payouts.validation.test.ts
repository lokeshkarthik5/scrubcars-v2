import { describe, expect, test } from 'bun:test'
import {
  earningsStatementQuerySchema,
  payoutAccountSchema,
  recordPayoutSchema,
} from './payouts.validation.js'

const payout = {
  amount: 1840,
  upTo: '2026-10-17T03:30:00.000Z',
  method: 'bank',
  reference: 'HDFCN52026101712345',
  paidAt: '2026-10-17T04:00:00.000Z',
  actorName: 'Lokesh',
}

describe('earningsStatementQuerySchema', () => {
  test('both dates or neither', () => {
    expect(earningsStatementQuerySchema.parse({})).toEqual({})
    expect(earningsStatementQuerySchema.parse({ from: '2026-10-01', to: '2026-10-17' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-17',
    })
    expect(earningsStatementQuerySchema.safeParse({ from: '2026-10-01' }).success).toBe(false)
  })

  test('real dates, in order, at most a year', () => {
    expect(earningsStatementQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(false)
    expect(earningsStatementQuerySchema.safeParse({ from: '2026-10-17', to: '2026-10-01' }).success).toBe(false)
    expect(earningsStatementQuerySchema.safeParse({ from: '2025-01-01', to: '2026-10-17' }).success).toBe(false)
  })
})

describe('recordPayoutSchema', () => {
  test('a payout with its reference and time; who recorded it is the session', () => {
    // A typed name is ignored: adminSignedJson signs it with the session (0058).
    expect(recordPayoutSchema.parse(payout)).toEqual({ ...payout, method: 'bank', note: undefined, actorName: '' })
  })

  test('the reference is required, and looks like one', () => {
    expect(recordPayoutSchema.safeParse({ ...payout, reference: '' }).success).toBe(false)
    expect(recordPayoutSchema.safeParse({ ...payout, reference: 'abc' }).success).toBe(false)
    expect(recordPayoutSchema.safeParse({ ...payout, reference: 'UTR 1234 5678' }).success).toBe(false)
    expect(recordPayoutSchema.parse({ ...payout, reference: '  412345678901  ' }).reference).toBe('412345678901')
  })

  test('positive rupees to the paisa, bank, UPI or other', () => {
    expect(recordPayoutSchema.safeParse({ ...payout, amount: 0 }).success).toBe(false)
    expect(recordPayoutSchema.safeParse({ ...payout, amount: 10.005 }).success).toBe(false)
    expect(recordPayoutSchema.safeParse({ ...payout, method: 'cheque' }).success).toBe(false)
    expect(recordPayoutSchema.parse({ ...payout, method: 'upi' }).method).toBe('upi')
  })

  test('nothing else rides along: no garage, no bookings, no items', () => {
    expect(recordPayoutSchema.safeParse({ ...payout, vendorId: 'x' }).success).toBe(false)
    expect(recordPayoutSchema.safeParse({ ...payout, bookingIds: [] }).success).toBe(false)
  })

  test('who recorded it is never typed', () => {
    const { actorName: _actorName, ...unsigned } = payout
    expect(recordPayoutSchema.parse(unsigned).actorName).toBe('')
  })
})

describe('payoutAccountSchema', () => {
  const account = {
    accountName: 'Marina Auto Spa',
    accountNumber: '50100 12345 678',
    ifsc: 'hdfc0001234',
    upiId: null,
    actorName: 'Lokesh',
  }

  test('a bank account, tidied: spaces out of the number, the IFSC in capitals', () => {
    expect(payoutAccountSchema.parse(account)).toEqual({
      ...account,
      accountNumber: '5010012345678',
      ifsc: 'HDFC0001234',
      actorName: '',
    })
  })

  test('a UPI id alone is enough', () => {
    expect(
      payoutAccountSchema.parse({ accountNumber: '', ifsc: '', upiId: 'marina@okaxis', actorName: 'Lokesh' })
    ).toEqual({ accountName: null, accountNumber: null, ifsc: null, upiId: 'marina@okaxis', actorName: '' })
  })

  test('a number needs its IFSC, and something to pay to is needed', () => {
    expect(payoutAccountSchema.safeParse({ ...account, ifsc: '' }).success).toBe(false)
    expect(payoutAccountSchema.safeParse({ actorName: 'Lokesh' }).success).toBe(false)
  })

  test('the shapes Indian banks and UPI use', () => {
    expect(payoutAccountSchema.safeParse({ ...account, accountNumber: '1234' }).success).toBe(false)
    expect(payoutAccountSchema.safeParse({ ...account, ifsc: 'HDFC1001234' }).success).toBe(false)
    expect(payoutAccountSchema.safeParse({ ...account, upiId: 'not-a-upi' }).success).toBe(false)
  })
})
