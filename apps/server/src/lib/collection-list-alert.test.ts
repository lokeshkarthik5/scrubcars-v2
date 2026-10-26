import { describe, expect, test } from 'bun:test'
import {
  TELEGRAM_MAX_CHARS,
  adminCollectionListUrl,
  collectionListText,
  formatOpsAlert,
  splitTelegramText,
  type CollectionListAlert,
} from './ops-alert-messages.js'

const LIST_ID = 'e2e00000-0000-4000-8000-000000004170'

const list: CollectionListAlert = {
  id: LIST_ID,
  assigneeName: 'Raga',
  createdByName: 'Mathew',
  dueOn: '2026-10-29',
  note: 'Go in the\nmorning',
  garages: [
    {
      businessName: 'Marina Auto Spa',
      area: 'Chennai',
      ownerName: 'Kumar',
      ownerPhone: '9876500011',
      mapsUrl:
        'https://www.google.com/maps/search/?api=1&query=13.000000,80.000000',
      items: ['Photos', 'Payout details'],
    },
    {
      businessName: 'Shine Garage',
      area: '',
      ownerName: null,
      ownerPhone: null,
      mapsUrl: null,
      items: ['Logo'],
    },
  ],
}

describe('a collection list’s post', () => {
  test('header, note, numbered garages with checklists, and the admin link', () => {
    expect(collectionListText(list)).toBe(
      [
        '📋 Collection list for Raga',
        'From Mathew · by Thu 29 Oct',
        'Note: Go in the morning',
        '',
        '1. Marina Auto Spa, Chennai',
        'Kumar · 9876500011 · Map: https://www.google.com/maps/search/?api=1&query=13.000000,80.000000',
        '☐ Photos',
        '☐ Payout details',
        '',
        '2. Shine Garage',
        '☐ Logo',
        '',
        `Open the list in admin: https://admin.detlio.com/today?list=${LIST_ID}`,
      ].join('\n')
    )
    expect(formatOpsAlert({ kind: 'collection_list', list })).toBe(
      collectionListText(list)
    )
    expect(adminCollectionListUrl(LIST_ID)).toBe(
      `https://admin.detlio.com/today?list=${LIST_ID}`
    )
  })

  test('no due date and no note: just who it is from', () => {
    const text = collectionListText({ ...list, dueOn: null, note: '  ' })
    expect(text.split('\n').slice(0, 3)).toEqual([
      '📋 Collection list for Raga',
      'From Mathew',
      '',
    ])
  })
})

describe('splitTelegramText', () => {
  test('text that fits is one part, unchanged', () => {
    expect(splitTelegramText('a\n\nb')).toEqual(['a\n\nb'])
  })

  test('a long list is cut between garages, every part within the limit, nothing lost', () => {
    const garages = Array.from({ length: 50 }, (_, i) => ({
      ...list.garages[0]!,
      businessName: `Garage number ${i + 1} with a long enough name`,
      items: [
        'Photos',
        'Logo',
        'Map pin',
        'Doorstep radius',
        'Bays',
        'Hours',
        'Payout details',
      ],
    }))
    const text = collectionListText({ ...list, garages })
    expect(text.length).toBeGreaterThan(TELEGRAM_MAX_CHARS)
    const parts = splitTelegramText(text)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts)
      expect(part.length).toBeLessThanOrEqual(TELEGRAM_MAX_CHARS)
    expect(parts.join('\n\n')).toBe(text)
    // Each part after the first starts at a garage, never mid-checklist.
    for (const part of parts.slice(1))
      expect(part).toMatch(/^\d+\. Garage number/)
    expect(parts.at(-1)).toContain('Open the list in admin:')
  })

  test('a block too long on its own goes by lines, and a line too long in hard cuts', () => {
    const block = Array.from(
      { length: 10 },
      (_, i) => `line ${i} ${'x'.repeat(20)}`
    ).join('\n')
    const parts = splitTelegramText(`head\n\n${block}`, 60)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(60)
    expect(parts[0]).toBe('head')
    expect(parts.join('\n').replace(/\n+/g, '\n')).toBe(`head\n${block}`)

    const hard = splitTelegramText('y'.repeat(25), 10)
    expect(hard).toEqual(['y'.repeat(10), 'y'.repeat(10), 'y'.repeat(5)])
  })
})
