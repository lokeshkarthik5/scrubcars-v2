import { describe, expect, test } from 'bun:test'
import {
  complaintActions,
  complaintFilterHint,
  complaintsListHref,
  overdueLabel,
  parseComplaintFilter,
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
