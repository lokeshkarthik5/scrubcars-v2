import { describe, expect, test } from 'bun:test'
import { earningKind } from './earnings.js'

const paid = { status: 'paid', refundedAmount: null }

describe('earningKind', () => {
  test('a finished job earns, as it always has', () => {
    expect(earningKind({ status: 'completed', payment: paid })).toBe('job')
    // Unsettled cash work still shows, as pending; the caller splits that out.
    expect(earningKind({ status: 'completed', payment: { status: 'pending' } })).toBe('job')
  })

  test('a customer no-show on a kept payment earns as if the job happened', () => {
    expect(
      earningKind({ status: 'cancelled', noShow: 'customer', payment: paid })
    ).toBe('customer_no_show')
  })

  test('a garage no-show earns nothing', () => {
    expect(earningKind({ status: 'cancelled', noShow: 'garage', payment: paid })).toBeNull()
  })

  test('other cancellations earn nothing', () => {
    expect(earningKind({ status: 'cancelled', noShow: null, payment: paid })).toBeNull()
  })

  test('a customer no-show whose payment went back earns nothing', () => {
    expect(
      earningKind({ status: 'cancelled', noShow: 'customer', payment: { status: 'refunded', refundedAmount: '499.00' } })
    ).toBeNull()
    expect(
      earningKind({ status: 'cancelled', noShow: 'customer', payment: { status: 'paid', refundedAmount: '100.00' } })
    ).toBeNull()
    expect(earningKind({ status: 'cancelled', noShow: 'customer', payment: null })).toBeNull()
  })

  test('work not yet done earns nothing yet', () => {
    for (const status of ['pending', 'confirmed', 'in_progress']) {
      expect(earningKind({ status, payment: paid })).toBeNull()
    }
  })
})
