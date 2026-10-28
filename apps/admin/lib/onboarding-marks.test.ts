import { describe, expect, test } from 'bun:test'
import type { AdminVendor } from '@repo/core/api/admin'
import type { MissingKey } from '@repo/core/onboarding-marks'
import {
  askHref,
  askMessage,
  askPhone,
  askedUndoSteps,
  checklistPayload,
  daysAgo,
  displayPhone,
  filterByMissing,
  hasMissingInfo,
  markDate,
  markForKey,
  markLine,
  markNeedsChase,
  markProgress,
  markStatusText,
  missingChipKeys,
  missingCounts,
  openPresetLabels,
  openPresetLabelsForAll,
  thingsCount,
  withCarriedItems,
} from './onboarding-marks'

/** 26 Oct 2026, 15:00 IST. */
const NOW = Date.parse('2026-10-26T09:30:00Z')

type Garage = Pick<
  AdminVendor,
  'businessName' | 'owner' | 'whatsapp' | 'phone' | 'missing'
>

const garage = (over: Partial<Garage> = {}): Garage => ({
  businessName: 'Glossy Doorstep',
  owner: { id: 'u1', name: 'Senthil Kumar', phone: '9840011203' },
  whatsapp: null,
  phone: '04424901234',
  missing: [],
  ...over,
})

describe('missing chips', () => {
  const vendors = [
    garage({ missing: ['photos', 'logo', 'payout'] }),
    garage({ missing: ['photos', 'map_pin'] }),
    garage({ missing: [] }),
    garage({ missing: undefined }),
  ]

  test('counts each garage once per key', () => {
    const counts = missingCounts([
      ...vendors,
      garage({ missing: ['bays', 'bays'] }),
    ])
    expect(counts.photos).toBe(2)
    expect(counts.logo).toBe(1)
    expect(counts.map_pin).toBe(1)
    expect(counts.bays).toBe(1)
    expect(counts.hours).toBe(0)
  })

  test('shows red keys first and hides the empty ones', () => {
    expect(missingChipKeys(missingCounts(vendors))).toEqual([
      'map_pin',
      'photos',
      'logo',
      'payout',
    ])
    expect(missingChipKeys(missingCounts([]))).toEqual([])
  })

  test('knows when the API sends no missing info', () => {
    expect(hasMissingInfo(vendors)).toBe(true)
    expect(hasMissingInfo([garage({ missing: undefined })])).toBe(false)
  })

  test('filters by one key, or not at all', () => {
    expect(filterByMissing(vendors, 'photos')).toHaveLength(2)
    expect(filterByMissing(vendors, 'map_pin')).toEqual([vendors[1]])
    expect(filterByMissing(vendors, null)).toHaveLength(4)
    expect(filterByMissing(vendors, 'hours')).toEqual([])
  })
})

describe('the WhatsApp ask', () => {
  test('lists only what the garage misses, in plain English', () => {
    expect(
      askMessage(garage(), ['photos', 'radius_default', 'payout'], 'Raga')
    ).toBe(
      'Hi Senthil, to finish your Detlio page we still need: 3 shop photos, the distance you’ll travel for doorstep jobs (now 10 km by default), and payout bank details (account + IFSC) or a UPI id. Thanks! – Raga, Team Detlio'
    )
  })

  test('joins one or two asks without a list comma, in the keys’ own order', () => {
    expect(askMessage(garage(), ['logo'], 'Raga')).toContain(
      'we still need: your logo. Thanks!'
    )
    expect(askMessage(garage(), ['logo', 'photos'], 'Raga')).toContain(
      'we still need: 3 shop photos and your logo.'
    )
  })

  test('the shared login signs as the team', () => {
    expect(askMessage(garage(), ['logo'], 'admin')).toMatch(
      /Thanks! – Team Detlio$/
    )
    expect(askMessage(garage(), ['logo'], '  ')).toMatch(
      /Thanks! – Team Detlio$/
    )
  })

  test('greets the garage when there is no owner', () => {
    expect(askMessage(garage({ owner: null }), ['logo'], 'Raga')).toMatch(
      /^Hi Glossy Doorstep team, /
    )
  })

  test('has something to say with nothing ticked', () => {
    expect(askMessage(garage(), [], 'Raga')).toBe(
      'Hi Senthil, a quick question about your Detlio page. Thanks! – Raga, Team Detlio'
    )
  })

  test('picks WhatsApp, then the owner, then the garage phone', () => {
    expect(askPhone(garage({ whatsapp: '9876543210' }))).toBe('9876543210')
    expect(askPhone(garage())).toBe('9840011203')
    expect(askPhone(garage({ owner: null, phone: '+91 98400 55555' }))).toBe(
      '+91 98400 55555'
    )
  })

  test('skips landlines, and has nothing when every number is one', () => {
    expect(askPhone(garage({ whatsapp: '04424901234' }))).toBe('9840011203')
    expect(askPhone(garage({ owner: null }))).toBeNull()
    expect(askHref(garage({ owner: null }), 'Hi')).toBeNull()
  })

  test('the wa.me link carries the message', () => {
    const href = askHref(garage(), askMessage(garage(), ['photos'], 'Raga'))
    expect(href).toStartWith('https://wa.me/919840011203?text=')
    expect(decodeURIComponent(href!.split('?text=')[1])).toContain(
      '3 shop photos'
    )
  })

  test('shows a number in two fives', () => {
    expect(displayPhone('9840011203')).toBe('98400 11203')
    expect(displayPhone('+91 98400-11203')).toBe('98400 11203')
    expect(displayPhone('12345')).toBe('12345')
  })
})

describe('mark status and dates', () => {
  test('dates read as today, yesterday, then the day', () => {
    expect(markDate('2026-10-26T01:00:00Z', NOW)).toBe('today')
    // 25 Oct 23:00 IST is yesterday in India, though 26 Oct is not yet in UTC.
    expect(markDate('2026-10-25T17:30:00Z', NOW)).toBe('yesterday')
    expect(markDate('2026-10-24T06:00:00Z', NOW)).toBe('24 Oct')
    expect(markDate('2025-12-30T06:00:00Z', NOW)).toBe('30 Dec 2025')
    expect(markDate('nonsense', NOW)).toBe('')
  })

  test('a mark in one line', () => {
    const brief = {
      kind: 'custom' as const,
      label: 'Waiting on owner',
      status: 'asked' as const,
      askedAt: '2026-10-24T06:00:00Z',
    }
    expect(markLine(brief, NOW)).toBe('Waiting on owner · Asked 24 Oct')
    expect(markLine({ ...brief, status: 'to_ask', askedAt: null }, NOW)).toBe(
      'Waiting on owner · To ask'
    )
    expect(
      markLine(
        { kind: 'radius_default', label: '', status: 'to_ask', askedAt: null },
        NOW
      )
    ).toBe('Doorstep radius · To ask')
    expect(
      markStatusText({ status: 'asked', askedAt: '2026-10-26T04:00:00Z' }, NOW)
    ).toBe('Asked today')
    expect(
      markStatusText(
        {
          status: 'received',
          askedAt: null,
          receivedAt: '2026-10-25T06:00:00Z',
        },
        NOW
      )
    ).toBe('Received yesterday')
  })

  test('asked more than two days ago turns amber', () => {
    expect(daysAgo('2026-10-23T06:00:00Z', NOW)).toBe(3)
    expect(
      markNeedsChase({ status: 'asked', askedAt: '2026-10-23T06:00:00Z' }, NOW)
    ).toBe(true)
    expect(
      markNeedsChase({ status: 'asked', askedAt: '2026-10-24T06:00:00Z' }, NOW)
    ).toBe(false)
    expect(markNeedsChase({ status: 'to_ask', askedAt: null }, NOW)).toBe(false)
  })

  test('finds the open mark of a missing key', () => {
    const marks = [
      { kind: 'photos' as MissingKey, status: 'received' as const },
      { kind: 'photos' as MissingKey, status: 'asked' as const },
    ]
    expect(markForKey(marks, 'photos')).toBe(marks[1])
    expect(markForKey(marks, 'logo')).toBeUndefined()
    expect(markForKey(undefined, 'logo')).toBeUndefined()
  })

  test('counts things', () => {
    expect(thingsCount(1)).toBe('1 thing')
    expect(thingsCount(4)).toBe('4 things')
  })
})

describe('undo after marking Asked', () => {
  test('deletes what the ask made and moves back what it moved', () => {
    const before = [
      { id: 'a', status: 'to_ask' as const },
      { id: 'b', status: 'asked' as const },
    ]
    expect(
      askedUndoSteps(before, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    ).toEqual([
      { action: 'restore', markId: 'a', status: 'to_ask' },
      { action: 'delete', markId: 'c' },
    ])
    expect(askedUndoSteps(undefined, [{ id: 'c' }])).toEqual([
      { action: 'delete', markId: 'c' },
    ])
  })
})

describe('Add mark presets already open', () => {
  const radius = {
    kind: 'radius_default',
    label: 'Doorstep radius',
    status: 'to_ask',
  } as const
  const callBack = {
    kind: 'custom',
    label: ' call  BACK',
    status: 'asked',
  } as const
  const gotPayout = {
    kind: 'payout',
    label: 'Payout details',
    status: 'received',
  } as const

  test('a missing key by kind, a team mark by its label, received ones not', () => {
    expect([...openPresetLabels([radius, callBack, gotPayout])].sort()).toEqual(
      ['Ask for radius', 'Call back']
    )
    expect(openPresetLabels(undefined).size).toBe(0)
    expect(
      openPresetLabels([
        { kind: 'custom', label: 'Call back later', status: 'to_ask' },
      ]).size
    ).toBe(0)
  })

  test('for several garages, only what every one has open', () => {
    expect([
      ...openPresetLabelsForAll([
        { openMarks: [radius, callBack] },
        { openMarks: [radius] },
      ]),
    ]).toEqual(['Ask for radius'])
    expect(openPresetLabelsForAll([{ openMarks: [radius] }, {}]).size).toBe(0)
    expect(openPresetLabelsForAll([]).size).toBe(0)
  })
})

describe('a mark with a checklist (0061)', () => {
  test('an open one says how far it is; a received one says when', () => {
    expect(
      markStatusText(
        {
          status: 'asked',
          askedAt: '2026-10-26T04:00:00Z',
          itemsDone: 1,
          itemsTotal: 4,
        },
        NOW
      )
    ).toBe('1 of 4 checked')
    expect(
      markStatusText(
        {
          status: 'to_ask',
          askedAt: null,
          items: [{ done: false }, { done: false }],
        },
        NOW
      )
    ).toBe('0 of 2 checked')
    expect(
      markStatusText(
        {
          status: 'received',
          askedAt: null,
          receivedAt: '2026-10-26T04:00:00Z',
          itemsDone: 2,
          itemsTotal: 2,
        },
        NOW
      )
    ).toBe('Received today')
    // None: as before.
    expect(
      markStatusText({ status: 'to_ask', askedAt: null, itemsTotal: 0 }, NOW)
    ).toBe('To ask')
  })

  test('progress from the items, else from the brief’s counts', () => {
    expect(
      markProgress({
        status: 'asked',
        askedAt: null,
        items: [{ done: true }, { done: false }],
      })
    ).toEqual({
      done: 1,
      total: 2,
    })
    expect(
      markProgress({
        status: 'asked',
        askedAt: null,
        itemsDone: 3,
        itemsTotal: 5,
      })
    ).toEqual({ done: 3, total: 5 })
    expect(markProgress({ status: 'asked', askedAt: null })).toEqual({
      done: 0,
      total: 0,
    })
  })
})

describe('the edit dialog’s checklist (0061)', () => {
  test('sends ids and words only, so a tick or answer saved meanwhile stays', () => {
    expect(
      checklistPayload([
        { id: 'a', text: ' Doorstep radius ', done: false, answer: null },
        { id: 'b', text: 'Payout details', done: true, answer: 'UPI' },
        { text: 'New item' },
        { text: '   ' },
      ] as Parameters<typeof checklistPayload>[0])
    ).toEqual([
      { id: 'a', text: 'Doorstep radius' },
      { id: 'b', text: 'Payout details' },
      { text: 'New item' },
    ])
  })

  test('Edit that mark keeps the mark’s own items and adds the typed ones it lacks', () => {
    const existing = [
      { id: 'a', text: 'Doorstep radius', done: true, answer: '8 km' },
      { id: 'b', text: 'Payout details', done: false, answer: null },
    ]
    expect(
      withCarriedItems(existing, [
        { text: 'payout details' },
        { text: 'Logo' },
        { text: ' ' },
      ])
    ).toEqual([...existing, { text: 'Logo' }])
    // Nothing typed: the mark's list, not an empty one that Save would clear.
    expect(withCarriedItems(existing, [])).toEqual(existing)
    expect(
      withCarriedItems(
        existing,
        Array.from({ length: 40 }, (_, i) => ({ text: `Item ${i}` }))
      )
    ).toHaveLength(30)
  })
})
