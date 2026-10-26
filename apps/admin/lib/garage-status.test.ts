import { describe, expect, test } from 'bun:test'
import type { ReadinessItem } from '@repo/core/api/admin'
import { statusHeadline, statusLines, tabDots } from './garage-status'

const item = (
  key: string,
  severity: ReadinessItem['severity'],
  tab: ReadinessItem['tab'],
  detail?: string
): ReadinessItem => ({
  key,
  severity,
  label: key.replace(/_/g, ' '),
  ...(detail ? { detail } : {}),
  short: key,
  tab,
})

const READINESS: ReadinessItem[] = [
  item('no_logo', 'optional', 'details'),
  item('no_pin', 'fix', 'location', 'Customers can’t find it on the map'),
  item('no_services', 'blocking', 'services'),
  item('no_bays', 'fix', 'operations'),
  item('no_hours', 'blocking', 'operations'),
]

describe('statusLines', () => {
  test('blocking first, then to fix, then optional, each with the tab that fixes it', () => {
    expect(statusLines(READINESS).map((l) => [l.key, l.tone, l.tab])).toEqual([
      ['no_services', 'blocking', 'services'],
      ['no_hours', 'blocking', 'operations'],
      ['no_pin', 'fix', 'location'],
      ['no_bays', 'fix', 'operations'],
      ['no_logo', 'optional', 'details'],
    ])
    expect(statusLines(READINESS).find((l) => l.key === 'no_pin')?.detail).toBe(
      'Customers can’t find it on the map'
    )
    expect(
      statusLines(READINESS).find((l) => l.key === 'no_logo')
    ).not.toHaveProperty('detail')
  })

  test('an empty checklist says nothing is missing', () => {
    expect(statusLines([])).toEqual([
      {
        key: 'nothing_missing',
        tone: 'done',
        label: 'Nothing missing',
        tab: 'details',
      },
    ])
  })

  test('an older API with no checklist gives no lines', () => {
    expect(statusLines(undefined)).toEqual([])
  })
})

describe('tabDots', () => {
  test('red where something blocks, amber where something is to fix, none for optional', () => {
    expect(tabDots(READINESS)).toEqual({
      services: 'red',
      operations: 'red',
      location: 'amber',
    })
  })

  test('amber never covers a red on the same tab, whichever comes first', () => {
    expect(
      tabDots([
        item('a', 'blocking', 'operations'),
        item('b', 'fix', 'operations'),
      ])
    ).toEqual({ operations: 'red' })
    expect(
      tabDots([
        item('b', 'fix', 'operations'),
        item('a', 'blocking', 'operations'),
      ])
    ).toEqual({ operations: 'red' })
  })

  test('no checklist, no dots', () => {
    expect(tabDots(undefined)).toEqual({})
    expect(tabDots([])).toEqual({})
  })
})

describe('statusHeadline', () => {
  const live = {
    status: 'active',
    isVerified: true,
    paused: false,
    inBin: false,
  }

  test('live: Active, verified, running and nothing blocking', () => {
    expect(statusHeadline(live, [])).toEqual({
      live: true,
      title: 'Live',
      summary: 'Customers can find and book it',
    })
    expect(statusHeadline(live, [item('no_pin', 'fix', 'location')])).toEqual({
      live: true,
      title: 'Live',
      summary: '1 to fix soon',
    })
  })

  test('says what blocks it, the stage and verification included', () => {
    expect(
      statusHeadline(
        { ...live, status: 'pending', isVerified: false },
        READINESS
      )
    ).toEqual({
      live: false,
      title: 'Customers can’t book it yet',
      summary: '2 things block it · 2 to fix soon · Pending · not verified',
    })
    expect(
      statusHeadline(live, [item('no_services', 'blocking', 'services')])
        .summary
    ).toBe('1 thing blocks it')
  })

  test('paused, and in the Bin', () => {
    expect(statusHeadline({ ...live, paused: true }, [])).toEqual({
      live: false,
      title: 'Bookings paused',
      summary: 'Hidden from customers until resumed',
    })
    expect(statusHeadline({ ...live, inBin: true }, []).title).toBe(
      'In the Bin'
    )
  })

  test('with no checklist it still reads the stage and verification', () => {
    expect(statusHeadline(live, undefined).live).toBe(true)
    expect(statusHeadline({ ...live, isVerified: false }, undefined)).toEqual({
      live: false,
      title: 'Customers can’t book it yet',
      summary: 'not verified',
    })
  })
})
