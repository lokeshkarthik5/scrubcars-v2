import { describe, expect, test } from 'bun:test'
import type { AdminRepairRequest } from '@repo/core/api/repair-quotes'
import { parseRepairFilter, repairClockLine, repairQuoteLine, repairQuotesHref, repairStateChip } from './repair-quotes'

const NOW = Date.parse('2026-11-16T06:00:00Z') // 11:30 am IST

function request(patch: Partial<AdminRepairRequest> = {}): AdminRepairRequest {
  return {
    id: 'r1',
    ref: 'RQ1A2B3C',
    state: 'open',
    filter: 'open',
    title: 'Front bumper, left side',
    vehicle: 'Maruti Swift',
    area: 'Anna Nagar',
    customer: { name: 'Karthik R', phone: '•••• 4417' },
    brief: { text: 'Deep scratch', area: null, damage: null, box: null, source: 'ai' },
    note: 'Scraped a pillar',
    video: null,
    photos: [],
    createdAt: '2026-11-16T04:00:00Z',
    closesAt: '2026-11-18T04:00:00Z',
    answerBy: '2026-11-16T09:10:00Z',
    quotes: [
      { id: 'q1', garage: { id: 'g1', name: 'Murugan Motors', phone: '9000000001' }, state: 'quoted', respondBy: '2026-11-16T08:00:00Z', priceFrom: 4000, priceTo: 5500, days: 2, needsInspection: true, declineReason: null, bookingId: null },
      { id: 'q2', garage: { id: 'g2', name: 'AutoKraft', phone: '9000000002' }, state: 'waiting', respondBy: '2026-11-16T09:10:00Z', priceFrom: null, priceTo: null, days: null, needsInspection: null, declineReason: null, bookingId: null },
    ],
    ...patch,
  }
}

describe('admin repair quotes', () => {
  test('the filter in the address, Open by default', () => {
    expect(parseRepairFilter(null)).toBe('open')
    expect(parseRepairFilter('booked')).toBe('booked')
    expect(parseRepairFilter('nope')).toBe('open')
    expect(repairQuotesHref('open')).toBe('/requests/repair-quotes')
    expect(repairQuotesHref('no_quote')).toBe('/requests/repair-quotes?filter=no_quote')
  })

  test('the chip says where it stands', () => {
    expect(repairStateChip(request())).toEqual({ label: '1 quote in', tone: 'progress' })
    expect(repairStateChip(request({ quotes: [request().quotes[1]!] }))).toEqual({ label: 'No answer yet', tone: 'attention' })
    expect(repairStateChip(request({ state: 'booked', filter: 'booked' })).label).toBe('Visit booked')
    expect(repairStateChip(request({ state: 'expired', filter: 'no_quote' })).label).toBe('No quote')
    expect(repairStateChip(request({ state: 'cancelled', filter: null })).label).toBe('Cancelled by customer')
  })

  test('the clock line and each garage’s answer', () => {
    expect(repairClockLine(request(), NOW)).toBe('Sent to 2 garages · answers by 2:40 pm · open until Wed 9:30 am')
    expect(repairClockLine(request(), Date.parse('2026-11-16T08:00:00Z'))).toBe('Sent to 2 garages · 1 h 10 min left · open until Wed 9:30 am')
    expect(repairClockLine(request({ state: 'booked' }), NOW)).toBe('Sent to 2 garages')
    expect(repairQuoteLine(request().quotes[0]!)).toBe('₹4,000–5,500 · 2 days · needs to see car')
    expect(repairQuoteLine(request().quotes[1]!)).toBe('waiting · by 2:40 pm')
    expect(repairQuoteLine({ ...request().quotes[1]!, state: 'declined', declineReason: 'No booth' })).toBe('can’t do: “No booth”')
  })
})
