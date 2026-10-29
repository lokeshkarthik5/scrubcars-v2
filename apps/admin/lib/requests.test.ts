import { describe, expect, test } from 'bun:test'
import type { AdminRequest } from '@repo/core/api/admin-requests'
import {
  canCancelRequest,
  chainLine,
  needsGarageCall,
  parseRequestFilter,
  parseZoneSlug,
  requestClockLine,
  requestsHref,
  requestStateLabel,
  timeAgo,
  timeLeft,
} from './requests'

const NOW = Date.parse('2026-10-29T10:00:00+05:30')
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

const request = (patch: Partial<AdminRequest> = {}): AdminRequest => ({
  id: 'r2',
  rootId: 'r1',
  state: 'waiting',
  filter: 'open',
  status: 'pending',
  bookingType: 'doorstep',
  customer: { id: 'c', name: 'Request Rani', phone: '••••••5040' },
  garage: { id: 'g2', name: 'Doorstep Two', phone: '9000005054' },
  chain: [
    {
      id: 'r1',
      garage: { id: 'g1', name: 'Doorstep One' },
      status: 'forwarded',
      reply: 'declined',
      repliedAt: at(-60),
    },
    {
      id: 'r2',
      garage: { id: 'g2', name: 'Doorstep Two' },
      status: 'pending',
      reply: null,
      repliedAt: null,
    },
  ],
  zone: { slug: 'perambur', name: 'Perambur' },
  items: [{ name: 'Foam wash', amount: '600.00' }],
  subtotal: '600.00',
  window: {
    date: '2026-10-30',
    part: 'morning',
    label: 'Tomorrow morning 9–12',
    start: at(1380),
    end: at(1560),
  },
  createdAt: at(-90),
  sentAt: at(-40),
  respondBy: at(80),
  travelFee: null,
  acceptedStartAt: null,
  confirmBy: null,
  bookingId: null,
  closedAt: null,
  cancelledBy: null,
  cancelledByName: null,
  cancelReason: null,
  ...patch,
})

describe('the page’s address', () => {
  test('filter and zone from the query; Open and no zone by default', () => {
    expect(parseRequestFilter(null)).toBe('open')
    expect(parseRequestFilter('failed')).toBe('failed')
    expect(parseRequestFilter('nonsense')).toBe('open')
    expect(parseZoneSlug('perambur')).toBe('perambur')
    expect(parseZoneSlug('Not a slug!')).toBeNull()
    expect(parseZoneSlug(null)).toBeNull()
    expect(requestsHref('open', null)).toBe('/requests')
    expect(requestsHref('all', 'perambur')).toBe(
      '/requests?filter=all&zone=perambur'
    )
    expect(requestsHref('open', 'anna-nagar')).toBe('/requests?zone=anna-nagar')
  })
})

describe('the clocks', () => {
  test('time left and time ago', () => {
    expect(timeLeft(at(80), NOW)).toBe('1 h 20 min')
    expect(timeLeft(at(60), NOW)).toBe('1 h')
    expect(timeLeft(at(12), NOW)).toBe('12 min')
    expect(timeLeft(at(0.5), NOW)).toBe('under a minute')
    expect(timeLeft(at(-1), NOW)).toBeNull()
    expect(timeAgo(at(-40), NOW)).toBe('40 min ago')
    expect(timeAgo(at(-125), NOW)).toBe('2 h 5 min ago')
    expect(timeAgo(at(0), NOW)).toBe('just now')
    expect(timeAgo(at(-60 * 50), NOW)).toBe('2 d ago')
  })
})

describe('where a request stands', () => {
  test('waiting: how long it has had and has left; Call garage and Cancel', () => {
    const waiting = request()
    expect(requestStateLabel(waiting)).toBe('Waiting for the garage')
    expect(requestClockLine(waiting, NOW)).toBe(
      'Sent to Doorstep Two 40 min ago, no answer yet · 1 h 20 min left to answer'
    )
    expect(needsGarageCall(waiting)).toBe(true)
    expect(canCancelRequest(waiting)).toBe(true)
    expect(requestClockLine(request({ respondBy: at(-5) }), NOW)).toContain(
      'time to answer is up'
    )
  })

  test('accepted: the start and the customer’s deadline; Cancel, no call', () => {
    const accepted = request({
      state: 'accepted',
      status: 'accepted',
      travelFee: 100,
      acceptedStartAt: '2026-10-30T04:30:00.000Z',
      confirmBy: at(45),
    })
    expect(requestStateLabel(accepted)).toBe('Accepted, not paid yet')
    expect(requestClockLine(accepted, NOW)).toBe(
      'Doorstep Two said yes, starts Fri 30 Oct, 10:00 am · customer to confirm by 10:45 am (45 min left)'
    )
    expect(needsGarageCall(accepted)).toBe(false)
    expect(canCancelRequest(accepted)).toBe(true)
  })

  test('closed ones say how they ended, and offer nothing', () => {
    const failed = request({ state: 'no_garage', filter: 'failed' })
    expect(requestStateLabel(failed)).toBe('Nobody accepted')
    expect(requestClockLine(failed, NOW)).toBe(
      'Nobody accepted: the last garage said no or did not answer in time'
    )
    expect(canCancelRequest(failed)).toBe(false)
    expect(needsGarageCall(failed)).toBe(false)
    expect(
      requestClockLine(request({ state: 'lapsed', filter: 'accepted' }), NOW)
    ).toBe('Doorstep Two said yes; the customer did not confirm in time')
    expect(
      requestClockLine(
        request({
          state: 'booked',
          filter: 'accepted',
          acceptedStartAt: '2026-10-30T04:30:00.000Z',
        }),
        NOW
      )
    ).toBe('Booked with Doorstep Two for Fri 30 Oct, 10:00 am')
    expect(
      requestClockLine(
        request({
          state: 'cancelled',
          filter: null,
          cancelledBy: 'detlio',
          cancelledByName: 'Raga',
          cancelReason: 'Garage closed today',
        }),
        NOW
      )
    ).toBe('Cancelled by Raga: “Garage closed today”')
    expect(
      requestClockLine(
        request({ state: 'cancelled', filter: null, cancelledBy: 'customer' }),
        NOW
      )
    ).toBe('Cancelled by the customer')
  })

  test('the chain: who it was passed on from, and why', () => {
    expect(chainLine(request())).toBe(
      'Passed on from Doorstep One (couldn’t take it)'
    )
    expect(
      chainLine(
        request({
          chain: [
            { ...request().chain[0]!, reply: null, status: 'forwarded' },
            request().chain[1]!,
          ],
        })
      )
    ).toBe('Passed on from Doorstep One (no answer in time)')
    expect(chainLine(request({ chain: [request().chain[1]!] }))).toBeNull()
  })
})
