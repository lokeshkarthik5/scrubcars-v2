import { describe, expect, test } from 'bun:test'
import {
  claimClockLine,
  claimTabHref,
  customerFiguresLine,
  customerFlags,
  parseClaimTab,
} from './guarantee'

const figures = {
  completedBookings: 8,
  claims: 3,
  approvedLast6Months: 1,
  waiting: 1,
  claimsLeft: 0,
  claimRate: 0.38,
  firstBooking: false,
  claimsOften: true,
}

describe('redo claims page', () => {
  test('tabs live in the URL, needs a decision by default', () => {
    expect(parseClaimTab(null)).toBe('needs_decision')
    expect(parseClaimTab('closed')).toBe('closed')
    expect(parseClaimTab('nonsense')).toBe('needs_decision')
    expect(claimTabHref('needs_decision')).toBe('/guarantee')
    expect(claimTabHref('open')).toBe('/guarantee?tab=open')
  })

  test("the customer's figures and flags, for admin only", () => {
    expect(customerFiguresLine(figures)).toBe(
      '3 claims over 8 completed bookings · 1 approved in 6 months · 1 waiting · 0 claims left'
    )
    expect(customerFlags(figures)).toEqual(['Claims often', 'No claims left'])
    expect(
      customerFlags({
        ...figures,
        claimsOften: false,
        firstBooking: true,
        claimsLeft: 1,
      })
    ).toEqual(['First booking'])
  })

  test('the clock line says whose move it is', () => {
    // Far from any run's today, so the day is named rather than "Today".
    const base = {
      detlioDecideBy: '2027-03-18T04:30:00Z',
      garageRespondBy: '2027-03-18T04:30:00Z',
      redoBookBy: null,
    }
    expect(claimClockLine({ ...base, status: 'needs_detlio' })).toMatch(
      /^Decide by Thu 18 Mar( 2027)? · 10:00 am$/
    )
    expect(claimClockLine({ ...base, status: 'waiting_garage' })).toMatch(
      /^Garage answers by/
    )
    expect(claimClockLine({ ...base, status: 'rejected' })).toBeNull()
  })
})
