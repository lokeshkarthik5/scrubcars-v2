import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Booking, ConditionCheck } from '@repo/core/types'
import { ConditionCheckCard } from './condition-check-card'

// The car condition check (0075), sent and not yet answered.
const sent: ConditionCheck = {
  required: false,
  ai: true,
  sentAt: '2026-11-15T04:00:00.000Z',
  canSend: false,
  taken: { before: 1, after: 0 },
  unread: [],
  marks: [],
  photos: [
    {
      id: 'p1',
      stage: 'before',
      url: 'https://photos.test/p1.jpg',
      createdAt: '2026-11-15T03:58:00.000Z',
      angle: 'front',
      by: 'garage',
    },
  ],
  answer: null,
  gate: null,
}

const booking = (status: Booking['status']) =>
  ({
    id: 'e2e00000-0000-4000-8000-000000007510',
    status,
    vendorName: 'Car Check Garage',
    vehicle: null,
    conditionCheck: sent,
  }) as unknown as Booking

const render = (status: Booking['status']) =>
  renderToStaticMarkup(<ConditionCheckCard booking={booking(status)} onChanged={() => {}} onHelp={() => {}} />)

describe('the before check on the customer page', () => {
  test('a booking going ahead offers Looks right and Something’s wrong', () => {
    for (const status of ['confirmed', 'in_progress', 'completed'] as const) {
      const html = render(status)
      expect(html).toContain('Looks right')
      expect(html).toContain('Something&#x27;s wrong')
    }
  })

  test('a cancelled or moved booking keeps the record but offers no answer the server would refuse', () => {
    for (const status of ['cancelled', 'rescheduled'] as const) {
      const html = render(status)
      expect(html).toContain('Your car&#x27;s condition before the job')
      expect(html).not.toContain('Looks right')
      expect(html).not.toContain('Send to the garage')
    }
  })

  test('nothing while the check is off for the garage', () => {
    const off = { ...booking('confirmed'), conditionCheck: null } as Booking
    expect(renderToStaticMarkup(<ConditionCheckCard booking={off} onChanged={() => {}} onHelp={() => {}} />)).toBe('')
  })
})
