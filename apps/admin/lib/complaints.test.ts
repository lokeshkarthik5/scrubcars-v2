import { describe, expect, test } from 'bun:test'
import {
  complaintActions,
  complaintFilterHint,
  complaintSourceLine,
  complaintsListHref,
  logComplaintProblems,
  overdueLabel,
  parseComplaintFilter,
  wholeBookingRef,
  wholeMobile,
} from './complaints'

describe('the chips', () => {
  test('Open unless the URL names another', () => {
    expect(parseComplaintFilter(null)).toBe('open')
    expect(parseComplaintFilter('overdue')).toBe('overdue')
    expect(parseComplaintFilter('resolved')).toBe('resolved')
    expect(parseComplaintFilter('all')).toBe('all')
    expect(parseComplaintFilter('closed')).toBe('open')
  })

  test('the default has a tidy URL', () => {
    expect(complaintsListHref('open')).toBe('/complaints')
    expect(complaintsListHref('overdue')).toBe('/complaints?show=overdue')
  })

  test('Overdue says the published numbers', () => {
    expect(complaintFilterHint('overdue')).toBe(
      'Not acknowledged within 24 hours, or not resolved within 7 days. Oldest first.'
    )
  })
})

describe('a complaint', () => {
  test('says which promise it missed', () => {
    expect(overdueLabel({ overdue: 'acknowledge' })).toBe('Not acknowledged in 24 h')
    expect(overdueLabel({ overdue: 'resolve' })).toBe('Not resolved in 7 days')
    expect(overdueLabel({ overdue: null })).toBeNull()
  })

  test('offers the actions its status allows, as the server does', () => {
    expect(complaintActions('open')).toEqual({ acknowledge: true, resolve: true, close: true })
    expect(complaintActions('acknowledged')).toEqual({ acknowledge: false, resolve: true, close: true })
    expect(complaintActions('resolved')).toEqual({ acknowledge: false, resolve: false, close: true })
    expect(complaintActions('closed')).toEqual({ acknowledge: false, resolve: false, close: false })
  })
})

describe('logging a complaint', () => {
  const NOW = new Date('2026-10-20T04:30:00.000Z')
  const form = {
    phone: '+91 98765 43210',
    hasAccount: true,
    customerName: '',
    message: 'Charged twice for one wash.',
    bookingRef: '',
    receivedAt: NOW.toISOString(),
    loggedBy: 'Ravi',
  }

  test('a whole form has nothing to fix', () => {
    expect(logComplaintProblems(form, NOW)).toEqual([])
  })

  test('a name is needed only when no account has the number', () => {
    expect(logComplaintProblems({ ...form, hasAccount: false }, NOW)).toEqual([
      "No account has this number: type the customer's name.",
    ])
    expect(logComplaintProblems({ ...form, hasAccount: false, customerName: 'Selvi' }, NOW)).toEqual([])
    // Not looked up yet: the server decides.
    expect(logComplaintProblems({ ...form, hasAccount: null }, NOW)).toEqual([])
  })

  test('received up to 7 days back, never ahead', () => {
    const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()
    expect(logComplaintProblems({ ...form, receivedAt: at(-7 * 24) }, NOW)).toEqual([])
    expect(logComplaintProblems({ ...form, receivedAt: at(-7 * 24 - 1) }, NOW)).toEqual([
      'It can be dated at most 7 days back.',
    ])
    expect(logComplaintProblems({ ...form, receivedAt: at(1) }, NOW)).toEqual([
      "When it was received can't be in the future.",
    ])
    expect(logComplaintProblems({ ...form, receivedAt: null }, NOW)).toEqual(['Say when it was received.'])
  })

  test('the phone, the message, the reference and who is logging it', () => {
    expect(
      logComplaintProblems({ ...form, phone: '12345', message: 'short', bookingRef: '#12', loggedBy: ' ' }, NOW)
    ).toEqual([
      'Enter their 10-digit mobile number.',
      'Write what they said: at least 10 characters.',
      'A booking reference is 8 letters and numbers, like #3F2A9C1B.',
      'Type your name.',
    ])
  })

  test('whole numbers and references only', () => {
    expect(wholeMobile('098765 43210')).toBe('9876543210')
    expect(wholeMobile('98765')).toBeNull()
    expect(wholeBookingRef(' #3F2A9C1B ')).toBe('3f2a9c1b')
    expect(wholeBookingRef('3F2A')).toBeNull()
  })

  test('the card says how it came, and who logged it', () => {
    expect(complaintSourceLine({ source: 'app', loggedBy: null })).toBe('In the app')
    expect(complaintSourceLine({ source: 'whatsapp', loggedBy: 'Ravi' })).toBe('On WhatsApp · logged by Ravi')
  })
})
