import { describe, expect, test } from 'bun:test'
import {
  addOnLinesOf,
  addOnPaise,
  onlyAddOns,
  serviceLinesOf,
  servicesFirst,
} from './add-ons.js'
import { freeWashEligibleSubtotal } from './area-signups.js'
import { bookingCommission, itemRate } from './commission.js'
import { eligibleSubtotal } from './coupons.js'
import { canBeRedone } from './guarantee.js'
import { creditAtBooking, finalBillAmountDue } from './final-bill.js'
import { eligibleAmountPaise } from './rewards.js'
import {
  DEFAULT_SERVICE_DURATION_MINS,
  effectiveDurationMins,
} from './service-duration.js'
import {
  summariseServiceTypes,
  type StatsChainRow,
  type StatsItemRow,
} from './stats.js'

const foam = {
  name: 'Foam wash',
  category: 'car_wash',
  amount: '599.00',
  isAddon: false,
}
const helmet = {
  name: 'Helmet wash',
  category: 'others',
  amount: '99.00',
  isAddon: true,
}
const freshener = {
  name: 'Air freshener',
  category: 'others',
  amount: '49.00',
  isAddon: true,
}

describe('add-ons alone', () => {
  test('lines of nothing but add-ons are refused; any service makes them bookable', () => {
    expect(onlyAddOns([helmet])).toBe(true)
    expect(onlyAddOns([helmet, freshener])).toBe(true)
    expect(onlyAddOns([foam, helmet])).toBe(false)
    expect(onlyAddOns([foam])).toBe(false)
    expect(onlyAddOns([])).toBe(false)
  })

  test('services come first, each kept in the customer order', () => {
    const wax = {
      name: 'Wax',
      category: 'detailing',
      amount: '1.00',
      isAddon: false,
    }
    expect(servicesFirst([helmet, foam, freshener, wax])).toEqual([
      foam,
      wax,
      helmet,
      freshener,
    ])
    expect(serviceLinesOf([helmet, foam])).toEqual([foam])
    expect(addOnLinesOf([helmet, foam])).toEqual([helmet])
  })

  test('adds up the add-on lines in paise', () => {
    expect(addOnPaise([foam, helmet, freshener])).toBe(14800)
    expect(addOnPaise([foam])).toBe(0)
  })
})

describe('slot time', () => {
  test('a blank on an add-on is no time; a normal service keeps the 60-minute default', () => {
    expect(effectiveDurationMins({ durationMins: null, isAddon: true })).toBe(0)
    expect(effectiveDurationMins({ durationMins: 0, isAddon: true })).toBe(0)
    expect(effectiveDurationMins({ durationMins: 10, isAddon: true })).toBe(10)
    expect(effectiveDurationMins({ durationMins: null })).toBe(
      DEFAULT_SERVICE_DURATION_MINS
    )
    expect(effectiveDurationMins({ durationMins: 0, isAddon: false })).toBe(
      DEFAULT_SERVICE_DURATION_MINS
    )
  })

  test('the job the slot check holds is the total of its lines', () => {
    const lines = [
      { durationMins: 45 },
      { durationMins: 10, isAddon: true },
      { durationMins: null, isAddon: true },
    ]
    expect(
      lines.reduce((total, line) => total + effectiveDurationMins(line), 0)
    ).toBe(55)
  })
})

describe('coupons', () => {
  test('a coupon limited to a service type comes off that type only', () => {
    expect(eligibleSubtotal([foam, helmet, freshener], 'car_wash')).toBe(
      '599.00'
    )
  })

  test('a coupon limited to Others does not see an add-on as that type', () => {
    expect(eligibleSubtotal([foam, helmet, freshener], 'others')).toBeNull()
    const polish = { name: 'Polish', category: 'others', amount: '200.00' }
    expect(eligibleSubtotal([polish, helmet], 'others')).toBe('200.00')
  })

  test('a free wash covers only the wash line, however dear the add-on', () => {
    const oil = {
      name: 'Oil change',
      category: 'car_wash',
      amount: '1199.00',
      isAddon: true,
    }
    expect(freeWashEligibleSubtotal([foam, helmet, oil])).toBe('599.00')
    expect(freeWashEligibleSubtotal([helmet])).toBeNull()
  })
})

describe('commission', () => {
  test('an add-on is charged at the others rate, as any others line', () => {
    expect(itemRate({ category: 'others', overrideRate: null })).toBe(0.08)
    const withAddOn = bookingCommission({
      status: 'completed',
      noShow: null,
      paymentStatus: 'paid',
      paymentRefunded: null,
      billsPaid: null,
      amount: '698.00',
      subtotalAmount: '698.00',
      discountAmount: '0.00',
      discountFundedBy: null,
      items: [
        {
          category: 'detailing',
          pricingType: 'flat',
          amount: '599.00',
          sortOrder: 0,
        },
        {
          category: 'others',
          pricingType: 'flat',
          amount: '99.00',
          sortOrder: 1,
          isAddon: true,
        },
      ],
    } as never)
    expect(withAddOn).toBeCloseTo(599 * 0.05 + 99 * 0.08, 2)
  })
})

describe('inspection jobs', () => {
  const booking = {
    amount: '398.00',
    subtotalAmount: '398.00',
    payment: { status: 'paid' },
    items: [
      { amount: '299.00', isAddon: false },
      { amount: '99.00', isAddon: true },
    ],
  }

  test('the add-on is paid upfront and credits nothing toward the final bill', () => {
    expect(creditAtBooking(booking)).toBe('299.00')
    expect(finalBillAmountDue('1099.00', creditAtBooking(booking))).toBe(
      '800.00'
    )
  })

  test('a job with no add-ons credits as before', () => {
    expect(
      creditAtBooking({
        ...booking,
        amount: '299.00',
        subtotalAmount: '299.00',
        items: [{ amount: '299.00' }],
      })
    ).toBe('299.00')
    expect(
      creditAtBooking({
        amount: '299.00',
        subtotalAmount: '299.00',
        payment: { status: 'paid' },
      })
    ).toBe('299.00')
    expect(
      creditAtBooking({ ...booking, payment: { status: 'pending' } })
    ).toBe('0.00')
  })
})

describe('rewards', () => {
  const job = {
    amount: '298.00',
    subtotalAmount: '298.00',
    discountFundedBy: null,
  }

  test('an add-on cannot carry a booking over the stamp minimum', () => {
    expect(eligibleAmountPaise({ ...job, addOnAmount: '99.00' })).toBe(19900)
    expect(eligibleAmountPaise(job)).toBe(29800)
    expect(
      eligibleAmountPaise({
        ...job,
        amount: '198.00',
        discountFundedBy: 'platform',
        addOnAmount: '99.00',
      })
    ).toBe(19900)
  })
})

describe('the redo promise', () => {
  test('a wash with an add-on is still a wash once the add-on lines are set aside', () => {
    const lines: Array<
      Parameters<typeof canBeRedone>[0][number] & { isAddon: boolean }
    > = [
      { category: 'car_wash', pricingType: 'flat', isAddon: false },
      { category: 'others', pricingType: 'flat', isAddon: true },
    ]
    // Why the guarantee repository reads services only: as an "others" line
    // the add-on would take the wash's promise away.
    expect(canBeRedone(lines)).toBe(false)
    expect(canBeRedone(serviceLinesOf(lines))).toBe(true)
  })
})

describe('Statistics by service type', () => {
  test('an add-on money stays under Others, but a wash with one is no Others booking', () => {
    const row = {
      rootId: 'r1',
      paymentStatus: 'paid',
      paymentAmount: '700.00',
      billsPaid: '0',
      refundsRecorded: '0',
      markedTest: false,
    } as unknown as StatsChainRow
    const items = new Map<string, StatsItemRow[]>([
      [
        'r1',
        [
          {
            rootId: 'r1',
            category: 'car_wash',
            pricingType: 'flat',
            amount: '600.00',
            sortOrder: 0,
          },
          {
            rootId: 'r1',
            category: 'others',
            pricingType: 'flat',
            amount: '100.00',
            sortOrder: 1,
            isAddon: true,
          },
        ] as StatsItemRow[],
      ],
    ])
    const summary = summariseServiceTypes([row], items)
    expect(summary.find((t) => t.category === 'car_wash')?.bookings).toBe(1)
    expect(summary.find((t) => t.category === 'others')?.bookings).toBe(0)
  })
})
