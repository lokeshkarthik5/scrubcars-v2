import { describe, expect, test } from 'bun:test'
import type { AdminLogin } from '@repo/core/api/admin'
import type { CollectionList } from '@repo/core/api/admin-collection'
import {
  collectKinds,
  collectorCards,
  collectorLogins,
  collectorSentLines,
  displayPhone,
  dueChip,
  dueDate,
  garageBriefArea,
  groupByOnboarder,
  istToday,
  itemState,
  listText,
  openGaragesByLogin,
  progressPercent,
  saveToGarageHref,
  sendButtonLabel,
  sendSubtitle,
  sendSummary,
  sentLine,
  shortDate,
  suggestedLogin,
  teammatePhone,
  teammatePhoneProblem,
  UNASSIGNED,
  vendorMapsUrl,
  withTeamLine,
  withTeamShort,
} from './collection'

// Mon 26 Oct 2026, 10:30 am IST.
const NOW = Date.parse('2026-10-26T05:00:00Z')

const login = (
  id: string,
  name: string,
  extra: Partial<AdminLogin> = {}
): AdminLogin => ({
  id,
  username: name.toLowerCase(),
  name,
  status: 'active',
  isOwner: false,
  lastLoginAt: null,
  createdByName: 'Max',
  createdAt: '2026-10-01T00:00:00Z',
  ...extra,
})

const RAGA = login('l-raga', 'Raga', { phone: '9840011203' })
const PRIYA = login('l-priya', 'Priya')
const OFF = login('l-off', 'Gone', { status: 'off' })

describe('collectors', () => {
  test('suggests the login whose name is the onboarder, case and spaces aside', () => {
    expect(suggestedLogin({ onboardedByName: '  raga ' }, [PRIYA, RAGA])).toBe(
      RAGA
    )
    expect(suggestedLogin({ onboardedByName: 'Someone' }, [RAGA])).toBeNull()
    expect(suggestedLogin({ onboardedByName: null }, [RAGA])).toBeNull()
    expect(suggestedLogin({}, [RAGA])).toBeNull()
  })

  test('only logins that are on can collect', () => {
    expect(collectorLogins([RAGA, OFF, PRIYA])).toEqual([RAGA, PRIYA])
    expect(collectorLogins(undefined)).toEqual([])
  })

  test('groups the garages by onboarder, unassigned last', () => {
    const vendors = [
      { id: 'a', onboardedByName: null },
      { id: 'b', onboardedByName: 'Raga' },
      { id: 'c', onboardedByName: 'Priya' },
      { id: 'd', onboardedByName: 'raga' },
      { id: 'e', onboardedByName: 'Not on the team' },
    ]
    const groups = groupByOnboarder(vendors, [RAGA, PRIYA])
    expect(groups.map((g) => [g.key, g.vendors.map((v) => v.id)])).toEqual([
      ['l-raga', ['b', 'd']],
      ['l-priya', ['c']],
      [UNASSIGNED, ['a', 'e']],
    ])
    expect(groups[2]?.loginId).toBeNull()
  })
})

describe('what to collect', () => {
  test('kinds once each, in MISSING_KEYS order', () => {
    expect(
      collectKinds({ missing: ['payout', 'photos', 'payout', 'logo'] })
    ).toEqual(['photos', 'logo', 'payout'])
    expect(collectKinds({})).toEqual([])
  })

  test('the summary counts only garages with something to collect', () => {
    expect(
      sendSummary([{ kinds: ['a', 'b', 'c'] }, { kinds: ['d'] }, { kinds: [] }])
    ).toEqual({
      garages: 2,
      things: 4,
      line: '2 garages · 4 things to collect',
    })
    expect(sendSummary([{ kinds: ['a'] }]).line).toBe(
      '1 garage · 1 thing to collect'
    )
  })

  test('the button names one person, or counts the lists', () => {
    expect(sendButtonLabel([' Raga '])).toBe('Send to Raga')
    expect(sendButtonLabel(['Raga', 'Priya'])).toBe('Send 2 lists')
    expect(sendButtonLabel([''])).toBe('Send')
  })

  test('the with-team line', () => {
    expect(
      withTeamLine({
        listId: 'x',
        assigneeName: 'Raga',
        dueOn: '2026-10-29',
        done: 3,
        total: 11,
      })
    ).toBe('With Raga · due 29 Oct · 3/11')
    expect(
      withTeamLine({
        listId: 'x',
        assigneeName: 'Raga',
        dueOn: null,
        done: 0,
        total: 2,
      })
    ).toBe('With Raga · 0/2')
  })

  test('the short with-team line, for the table', () => {
    expect(
      withTeamShort({
        listId: 'x',
        assigneeName: 'Priya',
        dueOn: '2026-10-31',
        done: 0,
        total: 2,
      })
    ).toBe('Priya · 31 Oct · 0/2')
    expect(
      withTeamShort({
        listId: 'x',
        assigneeName: 'Raga',
        dueOn: null,
        done: 1,
        total: 4,
      })
    ).toBe('Raga · 1/4')
  })
})

describe('phones and maps', () => {
  test('a teammate phone is an optional Indian mobile', () => {
    expect(teammatePhoneProblem('')).toBeNull()
    expect(teammatePhoneProblem('+91 98400 11203')).toBeNull()
    expect(teammatePhone('+91 98400 11203')).toBe('9840011203')
    expect(teammatePhoneProblem('12345')).not.toBeNull()
    expect(teammatePhoneProblem('0442490123')).not.toBeNull()
  })

  test('phones read in two halves', () => {
    expect(displayPhone('9840011203')).toBe('98400 11203')
    expect(displayPhone(null)).toBe('')
    expect(displayPhone('12')).toBe('12')
  })

  test('the map is the own link, else the pin, else none', () => {
    expect(
      vendorMapsUrl({
        lat: 13,
        lng: 80,
        mapsUrl: 'https://maps.app.goo.gl/abc',
      })
    ).toBe('https://maps.app.goo.gl/abc')
    expect(
      vendorMapsUrl({
        lat: 13.0827,
        lng: 80.2707,
        mapsUrl: 'https://evil.example/maps',
      })
    ).toBe(
      'https://www.google.com/maps/search/?api=1&query=13.082700,80.270700'
    )
    expect(vendorMapsUrl({ lat: null, lng: null })).toBeNull()
  })
})

describe('dates', () => {
  test('India’s today, and due days', () => {
    expect(istToday(Date.parse('2026-10-26T20:00:00Z'))).toBe('2026-10-27')
    expect(shortDate('2026-10-29')).toBe('29 Oct')
    expect(dueDate('2026-10-29', NOW)).toBe('Thu 29 Oct')
    expect(dueDate('2027-01-04', NOW)).toBe('Mon 4 Jan 2027')
  })

  test('the due chip', () => {
    expect(dueChip('2026-10-29', NOW)).toEqual({
      text: '3 days left',
      tone: 'neutral',
    })
    expect(dueChip('2026-10-27', NOW)).toEqual({
      text: 'Due tomorrow',
      tone: 'attention',
    })
    expect(dueChip('2026-10-26', NOW)).toEqual({
      text: 'Due today',
      tone: 'attention',
    })
    expect(dueChip('2026-10-24', NOW)).toEqual({
      text: '2 days late',
      tone: 'late',
    })
    expect(dueChip(null, NOW)).toBeNull()
  })
})

const LIST: CollectionList = {
  id: 'list-1',
  assigneeLoginId: 'l-raga',
  assigneeName: 'Raga',
  dueOn: '2026-10-29',
  note: 'Visit Adyar ones together',
  createdByName: 'Max',
  createdAt: '2026-10-26T04:00:00Z',
  telegramSentAt: null,
  closedAt: null,
  open: true,
  progress: { done: 2, total: 4 },
  garages: [
    {
      id: 'g1',
      businessName: 'Glossy Doorstep',
      address: '1 Main Rd',
      city: 'Adyar',
      ownerName: 'Senthil Kumar',
      ownerPhone: '9840011203',
      mapsUrl: 'https://maps.app.goo.gl/x',
    },
    {
      id: 'g2',
      businessName: 'Adyar Foam Wash',
      address: '2 Main Rd',
      city: 'Adyar',
      ownerName: null,
      ownerPhone: null,
      mapsUrl: null,
    },
  ],
  items: [
    {
      id: 'i1',
      listId: 'list-1',
      vendorId: 'g1',
      kind: 'photos',
      label: 'Photos',
      status: 'to_collect',
      collectedAt: null,
      collectedByName: null,
      note: null,
      cleared: false,
    },
    {
      id: 'i2',
      listId: 'list-1',
      vendorId: 'g1',
      kind: 'payout',
      label: 'Payout details',
      status: 'collected',
      collectedAt: null,
      collectedByName: 'Raga',
      note: null,
      cleared: false,
    },
    {
      id: 'i3',
      listId: 'list-1',
      vendorId: 'g2',
      kind: 'bays',
      label: 'Bays',
      status: 'to_collect',
      collectedAt: null,
      collectedByName: null,
      note: null,
      cleared: true,
    },
    {
      id: 'i4',
      listId: 'list-1',
      vendorId: 'g2',
      kind: 'custom',
      label: 'Signed agreement',
      status: 'to_collect',
      collectedAt: null,
      collectedByName: null,
      note: null,
      cleared: false,
    },
  ],
}

describe('lists', () => {
  test('item states and the editor link', () => {
    expect(LIST.items.map(itemState)).toEqual([
      'to_collect',
      'collected',
      'cleared',
      'to_collect',
    ])
    expect(saveToGarageHref(LIST.items[1]!)).toBe('/vendors/g1/edit?tab=team')
    expect(saveToGarageHref(LIST.items[3]!)).toBeNull()
    expect(progressPercent({ done: 3, total: 11 })).toBe(27)
    expect(progressPercent({ done: 0, total: 0 })).toBe(0)
  })

  test('the WhatsApp text leaves out what is done', () => {
    expect(listText(LIST, 'https://admin.detlio.com', NOW)).toBe(
      [
        'Collection list for Raga',
        'From Max · by Thu 29 Oct',
        'Note: Visit Adyar ones together',
        '2 garages · 2 things to collect',
        '',
        '1. Glossy Doorstep, Adyar',
        'Senthil Kumar · 98400 11203',
        'Map: https://maps.app.goo.gl/x',
        '☐ Photos',
        '',
        '2. Adyar Foam Wash, Adyar',
        '☐ Signed agreement',
        '',
        'Open the list in admin: https://admin.detlio.com/today?list=list-1',
      ].join('\n')
    )
  })

  test('one card per person, garages and progress summed, soonest due first', () => {
    const later: CollectionList = {
      ...LIST,
      id: 'list-2',
      dueOn: '2026-10-31',
      progress: { done: 1, total: 3 },
      garages: [LIST.garages[0]!],
    }
    const priya: CollectionList = {
      ...LIST,
      id: 'list-3',
      assigneeLoginId: null,
      assigneeName: 'Priya',
      dueOn: '2026-10-28',
      progress: { done: 0, total: 1 },
    }
    const closed: CollectionList = { ...LIST, id: 'list-4', open: false }
    expect(collectorCards([later, LIST, priya, closed])).toEqual([
      {
        key: 'name:priya',
        name: 'Priya',
        garages: 2,
        done: 0,
        total: 1,
        dueOn: '2026-10-28',
        listId: 'list-3',
        lists: 1,
      },
      {
        key: 'l-raga',
        name: 'Raga',
        garages: 2,
        done: 3,
        total: 7,
        dueOn: '2026-10-29',
        listId: 'list-1',
        lists: 2,
      },
    ])
  })
})

describe('Send to team words', () => {
  test('the subtitle says what the sheet shows', () => {
    expect(
      sendSubtitle([{ name: 'Raga' }, { name: 'Priya' }, { name: null }])
    ).toBe('3 lists, split by who onboarded each garage')
    expect(sendSubtitle([{ name: ' Raga ' }])).toBe('One list for Raga')
    expect(sendSubtitle([{ name: null }])).toBe(
      'One list of everything these garages are missing'
    )
    expect(sendSubtitle([])).toBe(
      'One list of everything these garages are missing'
    )
  })

  test('the area, else the city', () => {
    expect(garageBriefArea({ city: 'Chennai', area: 'Adyar' })).toBe('Adyar')
    expect(garageBriefArea({ city: 'Chennai' })).toBe('Chennai')
    expect(garageBriefArea({ city: '', area: ' ' })).toBe('')
  })

  test('how many garages each login already has, typed names left out', () => {
    const typed: CollectionList = {
      ...LIST,
      id: 'list-5',
      assigneeLoginId: null,
      assigneeName: 'Someone',
    }
    const more: CollectionList = {
      ...LIST,
      id: 'list-6',
      garages: [{ ...LIST.garages[0]!, id: 'g9' }],
    }
    expect([...openGaragesByLogin([LIST, more, typed])]).toEqual([
      ['l-raga', 3],
    ])
  })

  test('where a list went', () => {
    expect(sentLine(LIST)).toBe('Sent 26 Oct to Raga’s Today')
    expect(sentLine({ ...LIST, telegramSentAt: '2026-10-26T04:00:05Z' })).toBe(
      'Sent 26 Oct to Telegram and Raga’s Today'
    )
    expect(
      sentLine({
        ...LIST,
        assigneeLoginId: null,
        telegramSentAt: '2026-10-26T04:00:05Z',
      })
    ).toBe('Sent 26 Oct to Telegram')
    expect(sentLine({ ...LIST, assigneeLoginId: null })).toBe('Sent 26 Oct')
    // 11:30 pm IST on the 25th is still the 25th in India.
    expect(sentLine({ ...LIST, createdAt: '2026-10-25T18:00:00Z' })).toBe(
      'Sent 25 Oct to Raga’s Today'
    )
  })

  test('each card’s line comes from that person’s newest open list', () => {
    const newer: CollectionList = {
      ...LIST,
      id: 'list-7',
      createdAt: '2026-10-27T04:00:00Z',
      telegramSentAt: '2026-10-27T04:00:05Z',
    }
    const closed: CollectionList = {
      ...LIST,
      id: 'list-8',
      open: false,
      createdAt: '2026-10-28T04:00:00Z',
    }
    expect(collectorSentLines([LIST, newer, closed]).get('l-raga')).toBe(
      'Sent 27 Oct to Telegram and Raga’s Today'
    )
  })
})
