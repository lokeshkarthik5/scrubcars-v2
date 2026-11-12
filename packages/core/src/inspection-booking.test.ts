import { describe, expect, test } from 'bun:test'
import { detlioJobStatus, unpaidInspectionPrice } from './garage-book'
import {
  bookedLinePrice,
  checkoutAgreement,
  customerBookingInspectionPrice,
  customerSeesPaid,
  garageBookingInspectionPrice,
  inspectionPaymentRow,
  isNoFeeInspectionBooking,
  sentBillOf,
} from './inspection-booking'
import { receiptItemValue } from './receipts'
import type { FinalBill } from './types'

// A booking of an inspection with no fee (0073), in words.
const inspectionLine = { pricingType: 'on_inspection' as const, amount: 0 }
const noFee = { items: [inspectionLine], subtotalPrice: 0, paymentStatus: 'paid' }
const bill = (status: FinalBill['status'], total = 1800) => ({ status, total })

describe('isNoFeeInspectionBooking', () => {
  test('an inspection line and nothing priced', () => {
    expect(isNoFeeInspectionBooking(noFee)).toBe(true)
    // A paid add-on makes it a paid booking.
    expect(isNoFeeInspectionBooking({ ...noFee, subtotalPrice: 99 })).toBe(false)
    // A free wash comes to ₹0 after its code, not before.
    expect(isNoFeeInspectionBooking({ items: [{ pricingType: 'flat', amount: 500 }], subtotalPrice: 500 })).toBe(false)
    // A free redo is ₹0 for its own reason.
    expect(isNoFeeInspectionBooking({ ...noFee, guaranteeRedo: true })).toBe(false)
    expect(isNoFeeInspectionBooking({ items: [{ ...inspectionLine, isAddon: true }], subtotalPrice: 0 })).toBe(false)
  })
})

describe('the bill once sent', () => {
  test('a withdrawn bill is no bill; paid or not needed is paid', () => {
    expect(sentBillOf(null)).toBeNull()
    expect(sentBillOf(bill('cancelled'))).toBeNull()
    expect(sentBillOf(bill('due'))).toEqual({ total: 1800, paid: false })
    expect(sentBillOf(bill('paid'))).toEqual({ total: 1800, paid: true })
    expect(sentBillOf(bill('not_needed'))).toEqual({ total: 1800, paid: true })
  })
})

describe('the customer', () => {
  test('"Price after inspection" until the bill, then its total', () => {
    expect(customerBookingInspectionPrice(noFee)).toEqual({ text: 'Price after inspection', amount: null, paid: false })
    expect(customerBookingInspectionPrice({ ...noFee, finalBill: bill('due') })).toEqual({ text: '₹1,800', amount: 1800, paid: false })
    expect(customerBookingInspectionPrice({ ...noFee, finalBill: bill('paid') })?.paid).toBe(true)
    // Any other booking keeps its own figures.
    expect(customerBookingInspectionPrice({ items: [{ pricingType: 'flat', amount: 500 }], subtotalPrice: 500 })).toBeNull()
  })

  test('the booking page: pay after inspection, the bill, then paid', () => {
    expect(inspectionPaymentRow(noFee)).toEqual({ label: 'Pay after inspection', value: 'Price after inspection', numeric: false })
    expect(inspectionPaymentRow({ ...noFee, finalBill: bill('due') })).toEqual({ label: 'Final bill', value: '₹1,800', numeric: true })
    expect(inspectionPaymentRow({ ...noFee, finalBill: bill('paid') })).toEqual({ label: 'Paid', value: '₹1,800', numeric: true })
    expect(inspectionPaymentRow({ items: [{ pricingType: 'flat', amount: 500 }], subtotalPrice: 500 })).toBeNull()
  })

  test('"Paid" on the list only once the bill is paid', () => {
    expect(customerSeesPaid(noFee)).toBe(false)
    expect(customerSeesPaid({ ...noFee, finalBill: bill('due') })).toBe(false)
    expect(customerSeesPaid({ ...noFee, finalBill: bill('paid') })).toBe(true)
    expect(customerSeesPaid({ items: [{ pricingType: 'flat', amount: 500 }], subtotalPrice: 500, paymentStatus: 'paid' })).toBe(true)
    expect(customerSeesPaid({ ...noFee, paymentStatus: 'pending', finalBill: bill('paid') })).toBe(false)
  })
})

describe('the garage', () => {
  test('"Price on inspection · bill not sent", then the bill', () => {
    expect(garageBookingInspectionPrice(noFee)?.text).toBe('Price on inspection · bill not sent')
    expect(garageBookingInspectionPrice({ ...noFee, finalBill: bill('due', 2450) })?.text).toBe('₹2,450')
    expect(garageBookingInspectionPrice({ ...noFee, finalBill: bill('cancelled') })?.text).toBe('Price on inspection · bill not sent')
  })

  test('the book: a done job says its price is to come, until the bill is paid', () => {
    expect(unpaidInspectionPrice(null)).toBeNull()
    expect(unpaidInspectionPrice({ billTotal: null, billPaid: false })).toBe('Price on inspection · bill not sent')
    expect(unpaidInspectionPrice({ billTotal: '1800.00', billPaid: false })).toBe('₹1,800')
    expect(unpaidInspectionPrice({ billTotal: '1800.00', billPaid: true })).toBeNull()
    const done = { status: 'completed', paymentMethod: 'online', amount: '0.00' }
    expect(detlioJobStatus({ ...done, noFeeInspection: { billTotal: null, billPaid: false } })).toEqual({
      text: 'Done · Price on inspection · bill not sent',
      tone: 'owed',
    })
    // Paid: the job's amount is the bill.
    expect(detlioJobStatus({ ...done, amount: '1800.00', noFeeInspection: { billTotal: '1800.00', billPaid: true } })?.text).toBe(
      'Done · ₹1,800 paid online'
    )
  })
})

describe('lines and the receipt', () => {
  test('a no-fee inspection line is "Price on inspection", never ₹0', () => {
    expect(bookedLinePrice(inspectionLine)).toBe('Price on inspection')
    expect(bookedLinePrice({ pricingType: 'on_inspection', amount: 299 })).toBe('₹299')
    expect(bookedLinePrice({ pricingType: 'flat', amount: 0 })).toBe('₹0')
    expect(receiptItemValue({ amount: '0.00', priceOnInspection: true })).toBe('Price on inspection')
    expect(receiptItemValue({ amount: '499.00' })).toBe('₹499.00')
  })
})

describe('checkout', () => {
  test('"By booking" when nothing is paid, the same links', () => {
    expect(checkoutAgreement(0, 'web')).toBe('By booking you agree to the {part} and the {part2}.')
    expect(checkoutAgreement(499, 'web')).toBe('By paying you agree to the {part} and the {part2}.')
    expect(checkoutAgreement(0, 'app')).toBe('By booking you agree to the {terms} and the {policy}.')
    expect(checkoutAgreement(null, 'app')).toBe('By paying you agree to the {terms} and the {policy}.')
  })
})
