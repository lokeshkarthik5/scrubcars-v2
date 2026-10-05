import { describe, expect, test } from 'bun:test'
import { publicReviewerName, toPublicReviewResponse } from './reviews.public.js'

describe('publicReviewerName', () => {
  test('keeps a first name and the last name as an initial', () => {
    expect(publicReviewerName('Arjun Kumar')).toBe('Arjun K.')
    expect(publicReviewerName('Arjun Kumar Raj')).toBe('Arjun R.')
    expect(publicReviewerName('  arjun   kumar ')).toBe('arjun K.')
  })

  test('reads a leading family initial as the initial', () => {
    expect(publicReviewerName('K. Arjun')).toBe('Arjun K.')
    expect(publicReviewerName('R.K. Suresh')).toBe('Suresh R.')
    expect(publicReviewerName('K Arjun')).toBe('Arjun K.')
  })

  test('leaves a single name whole, and an empty one out', () => {
    expect(publicReviewerName('Arjun')).toBe('Arjun')
    expect(publicReviewerName('Om Prakash')).toBe('Om P.')
    expect(publicReviewerName('')).toBeNull()
    expect(publicReviewerName('   ')).toBeNull()
    expect(publicReviewerName(null)).toBeNull()
  })

  test('takes a whole letter for the initial in Tamil script', () => {
    expect(publicReviewerName('அருண் குமார்')).toBe('அருண் கு.')
  })
})

describe('toPublicReviewResponse', () => {
  const source = {
    id: 'r1',
    vendorId: 'v1',
    rating: 4,
    comment: 'Careful work.',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    user: { name: 'Ravi Shankar', phone: '9000000005', id: 'u1' },
    userId: 'u1',
    bookingId: 'b1',
    booking: {
      id: 'b1',
      scheduledAt: new Date('2026-09-30T05:00:00Z'),
      items: [{ name: 'Foam wash' }, { name: 'Interior clean' }],
      service: { id: 's1', name: 'Foam wash' },
    },
  }

  test('carries no contact details, account or booking ids', () => {
    const body = JSON.stringify(toPublicReviewResponse(source))
    expect(body).not.toContain('9000000005')
    expect(body).not.toContain('phone')
    expect(body).not.toContain('u1')
    expect(body).not.toContain('b1')
    expect(body).not.toContain('Shankar')
    expect(body).not.toContain('2026-09-30')
  })

  test('keeps what the review list shows', () => {
    expect(toPublicReviewResponse(source)).toEqual({
      id: 'r1',
      vendorId: 'v1',
      rating: 4,
      comment: 'Careful work.',
      createdAt: '2026-10-01T10:00:00.000Z',
      user: { name: 'Ravi S.' },
      booking: {
        serviceNames: ['Foam wash', 'Interior clean'],
        service: { id: 's1', name: 'Foam wash' },
      },
    })
  })

  test('a reviewer with no name has no user', () => {
    expect(toPublicReviewResponse({ ...source, user: { name: '' } }).user).toBeNull()
  })
})
