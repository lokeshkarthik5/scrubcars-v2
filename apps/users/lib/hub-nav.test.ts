import { describe, expect, test } from 'bun:test'
import { HUB_NAV_HREF, hubNavCurrent } from './hub-nav'

describe('hubNavCurrent', () => {
  test('each tab lights on its own route', () => {
    expect(hubNavCurrent('/home')).toBe('home')
    expect(hubNavCurrent('/map')).toBe('map')
    expect(hubNavCurrent('/bookings')).toBe('bookings')
    expect(hubNavCurrent('/profile')).toBe('profile')
  })

  test('and on the screens under it: a booking lights Bookings', () => {
    expect(hubNavCurrent('/bookings/0b0c6f1e-0000-4000-8000-000000000001')).toBe('bookings')
    expect(hubNavCurrent('/bookings/0b0c6f1e-0000-4000-8000-000000000001/receipt')).toBe('bookings')
  })

  test('the list of garages lights nothing for a customer: their Home is the hub', () => {
    expect(hubNavCurrent('/garages')).toBeNull()
    expect(hubNavCurrent('/garages', { guest: false })).toBeNull()
  })

  test("and Home for a visitor, whom /home sends to the list: it is their Home", () => {
    expect(hubNavCurrent('/garages', { guest: true })).toBe('home')
    // Only the list: a visitor's other screens light as anyone's do.
    expect(hubNavCurrent('/map', { guest: true })).toBe('map')
    expect(hubNavCurrent('/search', { guest: true })).toBeNull()
  })

  test('the + is never lit: it is an action, and it opens the list', () => {
    for (const guest of [false, true]) {
      for (const path of ['/garages', '/home', '/map', '/bookings', '/profile', '/search']) {
        expect(hubNavCurrent(path, { guest })).not.toBe('new')
      }
    }
    expect(HUB_NAV_HREF.new).toBe('/garages')
  })

  test('search, Updates and anything else light nothing', () => {
    for (const path of ['/search', '/updates', '/garage/abc', '/book/abc', '/', '/login']) {
      expect(hubNavCurrent(path)).toBeNull()
    }
  })

  test('a prefix is not a route: /homepage is not Home, /mapping is not Map', () => {
    expect(hubNavCurrent('/homepage')).toBeNull()
    expect(hubNavCurrent('/mapping')).toBeNull()
    expect(hubNavCurrent('/bookingsx')).toBeNull()
    expect(hubNavCurrent('/garages/extra')).toBeNull()
  })

  test('no path yet (outside the router) lights nothing', () => {
    expect(hubNavCurrent(null)).toBeNull()
  })
})
