import { expect, test } from 'bun:test';

import { cancelRefundNote, paymentRowAmount, paymentRowLabel } from './booking-detail';

test('the refund wording follows what was paid', () => {
  expect(cancelRefundNote({ servicePrice: 0, creditPaid: 0 })).toContain('Nothing was charged');
  expect(cancelRefundNote({ servicePrice: 500, creditPaid: 0 })).toContain('refund your payment');
  expect(cancelRefundNote({ servicePrice: 500, creditPaid: 500 })).toBe('₹500 goes back to your Detlio credit.');
  const both = cancelRefundNote({ servicePrice: 500, creditPaid: 100 });
  expect(both).toContain('₹400 you paid online');
  expect(both).toContain('₹100 goes back');
});

test('what the paid row is called', () => {
  const b = { paymentMethod: 'online' as const, paymentStatus: 'paid' as const };
  expect(paymentRowLabel({ ...b, servicePrice: 0, creditPaid: 0 })).toBe('Nothing to pay');
  expect(paymentRowLabel({ ...b, servicePrice: 500, creditPaid: 500 })).toBe('Paid');
  expect(paymentRowLabel({ ...b, servicePrice: 500, creditPaid: 100 })).toBe('Paid online');
});

test('a ₹0 inspection booking is paid after inspection (0073)', () => {
  const b = { paymentMethod: 'online' as const, paymentStatus: 'paid' as const, servicePrice: 0, creditPaid: 0 };
  const line = { id: 'l1', serviceId: 's1', name: 'Dent check', amount: 0, durationMins: 60 };
  expect(paymentRowLabel({ ...b, items: [{ ...line, pricingType: 'on_inspection' }] })).toBe('Pay after inspection');
  expect(paymentRowLabel({ ...b, items: [{ ...line, pricingType: 'flat' }] })).toBe('Nothing to pay');
});

test('paid online is what went through Razorpay, not the booking total', () => {
  expect(paymentRowAmount({ paymentStatus: 'paid', servicePrice: 598.4, creditPaid: 100 })).toBe(498.4);
  expect(paymentRowAmount({ paymentStatus: 'paid', servicePrice: 500, creditPaid: 0 })).toBe(500);
  expect(paymentRowAmount({ paymentStatus: 'paid', servicePrice: 500, creditPaid: 500 })).toBe(500);
});
