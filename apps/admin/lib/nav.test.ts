import { describe, expect, test } from 'bun:test'
import {
  activeItem,
  allItems,
  breadcrumb,
  moreGroups,
  PHONE_TABS,
  visibleGroups,
} from './nav'

describe('the grouped menu', () => {
  test('every page the old row had is still in the menu, under its new name', () => {
    const hrefs = allItems({ gifts: true, rewards: true, guarantee: true }).map(
      (item) => item.href
    )
    for (const old of [
      '/vendors',
      '/bookings',
      '/requests',
      '/complaints',
      '/refunds',
      '/payouts',
      '/discounts',
      '/coverage',
      '/statistics',
      '/gifts',
      '/rewards',
    ]) {
      expect(hrefs).toContain(old)
    }
    // Redo claims, Bypass, Alerts and Start pilot clean are reached through
    // Issues and Settings, which stay lit on them.
    expect(activeItem('/guarantee/abc')?.label).toBe('Issues')
    expect(activeItem('/bypass-reports/drop-off')?.label).toBe('Issues')
    expect(activeItem('/alerts')?.label).toBe('Settings')
    expect(activeItem('/data-reset')?.label).toBe('Settings')
    expect(activeItem('/vendors/1/edit')?.label).toBe('Garages')
  })

  test('switched-off features hide from their group, and an empty group goes', () => {
    const off = visibleGroups({})
    const grow = off.find((group) => group.label === 'Grow')
    expect(grow?.items.map((item) => item.label)).toEqual(['Offers'])
    const on = visibleGroups({ gifts: true, rewards: true })
    expect(
      on
        .find((group) => group.label === 'Grow')
        ?.items.map((item) => item.label)
    ).toEqual(['Offers', 'Rewards', 'Gifts'])
  })

  test('the breadcrumb names the group and the place', () => {
    expect(breadcrumb('/complaints/1')).toEqual({
      group: 'Run the day',
      page: 'Issues',
    })
    expect(breadcrumb('/today')).toEqual({ group: null, page: 'Today' })
    expect(breadcrumb('/alerts')).toEqual({ group: null, page: 'Settings' })
    expect(breadcrumb('/login')).toBeNull()
    // A prefix is not a match: /bookingsx is not Bookings.
    expect(activeItem('/bookingsx')).toBeNull()
  })

  test('the phone bar has four places and More lists the rest, Gifts included', () => {
    expect(PHONE_TABS).toHaveLength(4)
    const more = moreGroups({ gifts: true }).flatMap((group) =>
      group.items.map((item) => item.label)
    )
    expect(more).toContain('Gifts')
    expect(more).toContain('Settings')
    expect(more).not.toContain('Bookings')
  })
})
