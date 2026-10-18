import { describe, expect, test } from 'bun:test'
import { bannedPhraseIn } from './copy-rules.js'
import {
  acceptWithin,
  customerAccepted,
  customerComplaint,
  customerCompleted,
  customerDayBefore,
  customerDeclined,
  customerExtraWorkRequested,
  customerHourBefore,
  customerNotAcceptedInTime,
  customerPickupStep,
  customerRefund,
  customerServiceReminder,
  customerTimesSuggested,
  garageCustomerCancelled,
  garageExtraWorkDeclined,
  garageExtraWorkPaid,
  garageNewBooking,
  garageNotAcceptedInTime,
  garageProposalChosen,
  garageProposalDeclined,
  garageRescheduled,
  garageRespondSoon,
  testMessage,
} from './push-messages.js'
import type { PushMessage } from './push.js'

const IST = (iso: string) => new Date(`${iso}+05:30`)

// A booking row as the services load it: the customer's details are on it,
// and must never reach a notification.
const booking = {
  id: 'b0000000-0000-4000-8000-000000002401',
  userId: 'u0000000-0000-4000-8000-000000002402',
  vendorId: 'v0000000-0000-4000-8000-000000002403',
  scheduledAt: IST('2026-10-17T10:00:00'),
  bookingType: 'dropin',
  status: 'pending',
  respondBy: IST('2026-10-16T18:30:00'),
  vendor: { businessName: 'Marina Auto Spa', phone: '9840012345' },
  items: [{ name: 'Exterior Wash' }, { name: 'Interior Vacuum' }],
  user: { name: 'Karthik Raman', phone: '9876543210', email: 'karthik@example.com' },
  vehicle: { make: 'Hyundai', model: 'i20', licensePlate: 'TN09AB1234' },
  address: '12, Gandhi Street, Adyar',
  pickupCode: '4821',
  deliveryCode: '9174',
  notes: 'Gate code 7788, call before coming',
  cancellationReason: 'My father is unwell',
}

const PERSONAL = [
  'Karthik',
  'Raman',
  '9876543210',
  'karthik@example.com',
  'TN09AB1234',
  'Hyundai',
  'Gandhi Street',
  'Adyar',
  '4821',
  '9174',
  'Gate code',
  '7788',
  'unwell',
  '9840012345',
]

const NOW = IST('2026-10-16T18:00:00')

const ALL: Array<[string, PushMessage]> = [
  ['garage new booking', garageNewBooking(booking, NOW, 30)],
  ['garage respond soon', garageRespondSoon(booking, IST('2026-10-16T18:20:00'))],
  ['garage proposal chosen', garageProposalChosen({ ...booking, status: 'confirmed' })],
  ['garage proposal declined', garageProposalDeclined(booking)],
  ['garage extra work paid', garageExtraWorkPaid(booking, '500.00')],
  ['garage extra work declined', garageExtraWorkDeclined(booking, '500.00')],
  ['garage customer cancelled', garageCustomerCancelled(booking)],
  ['garage rescheduled', garageRescheduled(booking, IST('2026-10-17T09:00:00'), NOW, 30)],
  ['garage not accepted in time', garageNotAcceptedInTime(booking)],
  ['customer accepted', customerAccepted(booking)],
  ['customer declined', customerDeclined(booking, '799.00')],
  ['customer times suggested', customerTimesSuggested(booking, [IST('2026-10-17T11:00:00'), IST('2026-10-17T12:30:00')])],
  ['customer extra work', customerExtraWorkRequested(booking, '500.00')],
  ['customer picked up', customerPickupStep({ ...booking, bookingType: 'pickup' }, 'picked_up')],
  ['customer out for delivery', customerPickupStep({ ...booking, bookingType: 'pickup' }, 'out_for_delivery')],
  ['customer completed', customerCompleted(booking)],
  ['customer refund started', customerRefund(booking, '799.00', true)],
  ['customer refund recorded', customerRefund(booking, '799.00', false)],
  ['customer complaint ack', customerComplaint({ id: 'c1', number: 123 }, 'acknowledged')],
  ['customer complaint resolved', customerComplaint({ id: 'c1', number: 123 }, 'resolved')],
  ['customer not accepted', customerNotAcceptedInTime(booking)],
  ['customer day before', customerDayBefore({ ...booking, status: 'confirmed' }, NOW)],
  ['customer hour before', customerHourBefore({ ...booking, status: 'confirmed' }, IST('2026-10-17T09:00:00'))],
  ['customer service reminder', customerServiceReminder({
    id: 'r0000000-0000-4000-8000-000000002601', vehicleId: 'c0000000-0000-4000-8000-000000002602',
    kind: 'maintenance_wash', vendorName: booking.vendor.businessName,
  })],
  ['customer test', testMessage('customer')],
  ['garage test', testMessage('garage')],
]

describe('no notification carries personal data', () => {
  for (const [name, message] of ALL) {
    test(name, () => {
      const text = [message.title, message.body, message.url, message.tag].join(' | ')
      for (const word of PERSONAL) expect(text).not.toContain(word)
      // Opens a page of the app it came from, never another site.
      expect(message.url.startsWith('/')).toBe(true)
      expect(message.url.startsWith('//')).toBe(false)
      // Passes the brand's copy rules, like every customer-facing line.
      expect(bannedPhraseIn(`${message.title} ${message.body}`)).toBeNull()
      expect(message.title.length).toBeGreaterThan(0)
      expect(message.ttlSeconds).toBeGreaterThanOrEqual(60)
    })
  }
})

describe('garage', () => {
  test('a new booking: service, time, type and how long to accept, urgently', () => {
    const message = garageNewBooking({ ...booking, respondBy: IST('2026-10-16T18:30:00') }, NOW, 30)
    expect(message.title).toBe('New booking · Exterior Wash + 1 more')
    expect(message.body).toBe('Sat 17 Oct, 10 AM · At garage — accept within 30 min')
    expect(message.url).toBe(`/bookings?tab=incoming#job-${booking.id}`)
    expect(message.urgency).toBe('high')
    // Not worth delivering after the slot has started.
    expect(message.ttlSeconds).toBeLessThanOrEqual((booking.scheduledAt.getTime() - NOW.getTime()) / 1000)
  })

  test('a deadline further off than the window names the time, as the job card does', () => {
    expect(acceptWithin(IST('2026-10-16T20:00:00'), 30, NOW)).toBe('accept by 8 PM')
    expect(acceptWithin(IST('2026-10-17T09:30:00'), 30, NOW)).toBe('accept by Sat 17 Oct, 9:30 AM')
    expect(acceptWithin(IST('2026-10-16T18:00:30'), 30, NOW)).toBe('accept within 1 min')
    expect(acceptWithin(null, 30, NOW)).toBeNull()
    expect(acceptWithin(IST('2026-10-16T17:00:00'), 30, NOW)).toBeNull()
    expect(garageNewBooking({ ...booking, respondBy: null }, NOW, 30).body).toContain('open Detlio to accept')
  })

  test('the 10-minute nudge counts what is left', () => {
    const message = garageRespondSoon(booking, IST('2026-10-16T18:20:00'))
    expect(message.title).toBe("Accept within 10 min or it's cancelled")
    expect(message.urgency).toBe('high')
  })

  test('a reschedule back to pending asks for an answer; an accepted one does not', () => {
    const pending = garageRescheduled({ ...booking, status: 'pending' }, IST('2026-10-17T09:00:00'), NOW, 30)
    expect(pending.body).toContain('was Sat 17 Oct, 9 AM')
    expect(pending.body).toContain('accept within 30 min')
    expect(pending.url).toContain('tab=incoming')
    const confirmed = garageRescheduled({ ...booking, status: 'confirmed' }, IST('2026-10-17T09:00:00'), NOW, 30)
    expect(confirmed.body).not.toContain('accept')
    expect(confirmed.url).toContain('tab=upcoming')
  })
})

describe('customer: the same words as Updates', () => {
  test('accepted', () => {
    const message = customerAccepted(booking)
    expect(message.title).toBe('Marina Auto Spa accepted your booking')
    expect(message.body).toBe('Exterior Wash + 1 more · Sat 17 Oct, 10 AM')
    expect(message.url).toBe(`/bookings/${booking.id}`)
  })

  test('declined says the refund due only when there is one', () => {
    expect(customerDeclined(booking, '799.00').body).toBe('Sat 17 Oct, 10 AM. Refund due: ₹799')
    expect(customerDeclined(booking, null).body).toBe('Sat 17 Oct, 10 AM')
  })

  test('extra work names the amount, never the garage’s description', () => {
    const message = customerExtraWorkRequested(booking, '500.00')
    expect(message.title).toBe('Marina Auto Spa asks for extra work: ₹500')
  })

  test('completed asks for a rating; pickup & drop says the car is back', () => {
    expect(customerCompleted(booking).body).toBe('How was it? Rate your wash at Marina Auto Spa')
    expect(customerCompleted({ ...booking, bookingType: 'pickup' }).title).toBe('Your car is back')
  })

  test('complaints open My complaints, by number only', () => {
    const message = customerComplaint({ id: 'c1', number: 123 }, 'resolved')
    expect(message.title).toBe('Complaint C-000123 resolved — see our answer')
    expect(message.url).toBe('/profile#my-complaints')
  })

  test('reminders are reminders, for the Reminders switch', () => {
    const dayBefore = customerDayBefore(booking, NOW)
    expect(dayBefore.title).toBe('Your booking is tomorrow')
    expect(dayBefore.body).toBe('Marina Auto Spa · 10 AM')
    expect(dayBefore.category).toBe('reminder')
    const hourBefore = customerHourBefore({ ...booking, bookingType: 'pickup' }, IST('2026-10-17T09:00:00'))
    expect(hourBefore.body).toBe('Marina Auto Spa collects your car at 10 AM')
    expect(hourBefore.category).toBe('reminder')
    // An hour before, it is no use once the slot has started.
    expect(hourBefore.ttlSeconds).toBe(3600)
    expect(customerHourBefore({ ...booking, bookingType: 'doorstep' }, NOW).body).toBe('Marina Auto Spa comes to you at 10 AM')
  })

  test('every booking message is booking news, for the Booking updates switch', () => {
    for (const [name, message] of ALL) {
      if (name.includes('day before') || name.includes('hour before') || name.includes('test')) continue
      if (name.includes('service reminder')) continue
      expect(message.category).toBe('booking_update')
    }
  })

  test('a coating or detailing follow-up is a reminder, opens the car, and never names it', () => {
    const message = customerServiceReminder({
      id: 'r1', vehicleId: 'car-1', kind: 'coating_check', vendorName: 'Marina Auto Spa',
    })
    expect(message.title).toBe('Coating check-up')
    expect(message.body).toBe('12 months since your coating at Marina Auto Spa. Book it in Detlio.')
    expect(message.category).toBe('reminder')
    expect(message.url).toBe('/profile/cars/car-1')
    expect(message.tag).toBe('service_reminder:r1')
  })
})
