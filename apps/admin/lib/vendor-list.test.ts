import { describe, expect, test } from 'bun:test'
import type { ReadinessItem } from '@repo/core/api/admin'
import {
  binDeleteLine,
  bookingParts,
  bookingsLine,
  certificationCounts,
  MORE_LABELS,
  editHref,
  isInBin,
  isLive,
  documentsToReviewCount,
  listHref,
  matchesSearch,
  matchesShow,
  parseShow,
  readinessGroups,
  readinessSummary,
  showCounts,
  showHints,
  stateWord,
  SHOW_FILTERS,
} from './vendor-list'
import {
  garageArea,
  garageListHref,
  garageNextStep,
  isMissing,
  matchesOnboardedBy,
  matchesTeam,
  missingTagsThatFit,
  modesShort,
  nextStepRank,
  onboardedByOptions,
  ONBOARDED_NOT_SET,
  parseGarageList,
  parseMissing,
  parseOnboardedBy,
  parseTeam,
  stageCell,
} from './vendor-list'
import { safeBackHref } from './garage-edit'

type Row = Parameters<typeof showCounts>[0][number]

const garage = (overrides: Partial<Row> = {}): Row => ({
  live: true,
  status: 'active',
  isVerified: true,
  bookingsPausedAt: null,
  ...overrides,
})

const item = (
  severity: ReadinessItem['severity'],
  short: string,
  key = short.replace(/\s+/g, '_')
): ReadinessItem => ({ key, severity, label: short, short, tab: 'details' })

describe('the chips', () => {
  test('?show= is an allow-list, and the list opens on Live', () => {
    expect(parseShow('pending')).toBe('pending')
    expect(parseShow('archived')).toBe('archived')
    expect(parseShow('bin')).toBe('bin')
    expect(parseShow(null)).toBe('live')
    expect(parseShow('trash')).toBe('live')
    expect(parseShow('ALL')).toBe('live')
    expect(parseShow('documents')).toBe('documents')
    expect(parseShow('notlive')).toBe('notlive')
    expect(parseShow('paused')).toBe('paused')
  })

  test('the list address carries the chip, and Live is the bare list', () => {
    expect(listHref('live')).toBe('/vendors')
    expect(listHref('pending')).toBe('/vendors?show=pending')
    // The edit page's back arrow accepts every one of them.
    for (const show of SHOW_FILTERS)
      expect(safeBackHref(listHref(show))).toBe(listHref(show))
  })

  test('Not live yet is on its way in; Paused is paused or suspended', () => {
    const pausedActive = garage({
      live: false,
      bookingsPausedAt: '2026-10-10T04:30:00Z',
    })
    const unverified = garage({ live: false, isVerified: false })
    const pending = garage({
      live: false,
      status: 'pending',
      isVerified: false,
    })
    const suspended = garage({ live: false, status: 'suspended' })
    const archivedPaused = garage({
      live: false,
      status: 'archived',
      bookingsPausedAt: '2026-10-10T04:30:00Z',
    })
    expect(matchesShow(unverified, 'notlive')).toBe(true)
    expect(matchesShow(pending, 'notlive')).toBe(true)
    expect(matchesShow(pausedActive, 'notlive')).toBe(false)
    expect(matchesShow(pausedActive, 'paused')).toBe(true)
    expect(matchesShow(suspended, 'paused')).toBe(true)
    expect(matchesShow(archivedPaused, 'paused')).toBe(false)
    expect(matchesShow(garage(), 'notlive')).toBe(false)
  })

  test('Live is the server’s flag; Active is the stage, paused or unverified included', () => {
    const pausedActive = garage({
      live: false,
      bookingsPausedAt: '2026-10-10T04:30:00Z',
    })
    const unverified = garage({ live: false, isVerified: false })
    expect(matchesShow(pausedActive, 'live')).toBe(false)
    expect(matchesShow(pausedActive, 'active')).toBe(true)
    expect(matchesShow(unverified, 'active')).toBe(true)
    expect(matchesShow(garage(), 'live')).toBe(true)
    expect(
      matchesShow(
        garage({ live: false, status: 'pending', isVerified: false }),
        'pending'
      )
    ).toBe(true)
  })

  test('the server’s flag wins; the stand-in is only for a server without it', () => {
    // A server that says not live is believed, whatever the columns look like.
    expect(isLive(garage({ live: false }))).toBe(false)
    expect(isLive(garage({ live: undefined }))).toBe(true)
    expect(isLive(garage({ live: undefined, isVerified: false }))).toBe(false)
    expect(
      isLive(
        garage({ live: undefined, bookingsPausedAt: '2026-10-10T04:30:00Z' })
      )
    ).toBe(false)
  })

  test('counts: All is every garage, and the stages add up to it', () => {
    const list = [
      garage(),
      garage(),
      garage({ live: false, bookingsPausedAt: '2026-10-10T04:30:00Z' }),
      garage({ live: false, status: 'pending', isVerified: false }),
      garage({ live: false, status: 'archived' }),
    ]
    const counts = showCounts(list)
    expect(counts).toEqual({
      all: 5,
      live: 2,
      notlive: 1,
      paused: 1,
      archived: 1,
      bin: 0,
      active: 3,
      pending: 1,
      suspended: 0,
    })
    // The chips drawn split All with nothing over, and so do the old stages.
    expect(counts.live + counts.notlive + counts.paused + counts.archived).toBe(
      counts.all
    )
    expect(
      counts.active + counts.pending + counts.suspended + counts.archived
    ).toBe(counts.all)
  })

  test('a garage in the Bin is under Bin alone, whatever its stage, and in no other count', () => {
    const binned = garage({ live: false, deletedAt: '2026-10-14T12:42:00Z' })
    const binnedArchived = garage({
      live: false,
      status: 'archived',
      deletedAt: '2026-10-14T12:42:00Z',
    })
    expect(isInBin(binned)).toBe(true)
    expect(SHOW_FILTERS.filter((show) => matchesShow(binned, show))).toEqual([
      'bin',
    ])
    expect(
      SHOW_FILTERS.filter((show) => matchesShow(binnedArchived, show))
    ).toEqual(['bin'])
    // An older server sends no `live`: the stand-in leaves the Bin out too.
    expect(
      isLive(garage({ live: undefined, deletedAt: '2026-10-14T12:42:00Z' }))
    ).toBe(false)
    const counts = showCounts([garage(), binned, binnedArchived])
    expect(counts).toEqual({
      all: 1,
      live: 1,
      notlive: 0,
      paused: 0,
      archived: 0,
      bin: 2,
      active: 1,
      pending: 0,
      suspended: 0,
    })
  })

  test('the hint is one line saying what the chosen chip means', () => {
    expect(showHints('live')).toEqual([
      { term: 'Live', meaning: 'customers can find it and book it' },
    ])
    expect(showHints('notlive')[0].term).toBe('Not live yet')
    expect(showHints('paused')[0].meaning).toContain('suspended')
    expect(showHints('pending')).toEqual([
      { term: 'Pending', meaning: 'added, not shown to customers yet' },
    ])
    expect(showHints('bin')).toEqual([
      {
        term: 'Bin',
        meaning: 'off the app. Restore it, or delete it forever.',
      },
    ])
    for (const show of SHOW_FILTERS) expect(showHints(show)).toHaveLength(1)
  })
})

describe('the card', () => {
  test('a garage customers can’t find says why; a live one says nothing here', () => {
    expect(stateWord(garage())).toBeNull()
    expect(stateWord(garage({ live: false, status: 'pending' }))).toBe(
      'Pending'
    )
    expect(stateWord(garage({ live: false, status: 'archived' }))).toBe(
      'Archived'
    )
    expect(stateWord(garage({ live: false, isVerified: false }))).toBe(
      'Not shown to customers'
    )
    expect(
      stateWord(
        garage({ live: false, bookingsPausedAt: '2026-10-10T04:30:00Z' })
      )
    ).toBe('Paused')
    expect(
      stateWord(
        garage({
          live: false,
          isVerified: false,
          bookingsPausedAt: '2026-10-10T04:30:00Z',
        })
      )
    ).toBe('Paused · not shown to customers')
  })

  test('a Bin card says how many bookings go with it, in amber', () => {
    expect(binDeleteLine(12)).toBe('12 bookings will be deleted with it')
    expect(binDeleteLine(1)).toBe('1 booking will be deleted with it')
    expect(binDeleteLine(0)).toBeNull()
  })

  test('bookings, quietly', () => {
    expect(bookingsLine(0)).toBe('No bookings yet')
    expect(bookingsLine(1)).toBe('Has 1 booking')
    expect(bookingsLine(4)).toBe('Has 4 bookings')
  })

  test('how it books, as in the mockup', () => {
    const modes = {
      dropinEnabled: true,
      doorstepEnabled: true,
      doorstepRadiusKm: 8,
      hasDoorstepArea: false,
    }
    expect(bookingParts(modes)).toEqual([
      { text: 'At the garage' },
      { text: 'Doorstep 8 km' },
    ])
    expect(bookingParts({ ...modes, doorstepRadiusKm: null })).toEqual([
      { text: 'At the garage' },
      { text: 'Doorstep', quiet: '10 km default' },
    ])
    expect(
      bookingParts({ ...modes, dropinEnabled: false, doorstepRadiusKm: 7.5 })
    ).toEqual([{ text: 'Doorstep only' }, { text: '7.5 km' }])
    expect(
      bookingParts({ ...modes, dropinEnabled: false, doorstepRadiusKm: null })
    ).toEqual([{ text: 'Doorstep only' }, { quiet: '10 km default' }])
    expect(bookingParts({ ...modes, hasDoorstepArea: true })).toEqual([
      { text: 'At the garage' },
      { text: 'Doorstep', quiet: 'drawn area' },
    ])
    expect(bookingParts({ ...modes, doorstepEnabled: false })).toEqual([
      { text: 'At the garage' },
    ])
    expect(
      bookingParts({ ...modes, dropinEnabled: false, doorstepEnabled: false })
    ).toEqual([])
  })

  test('as many Missing tags as fit one line, red first, at least one', () => {
    expect(missingTagsThatFit(undefined)).toBe(0)
    expect(missingTagsThatFit([])).toBe(0)
    // Map pin and Services are red: they lead, and "+3" follows.
    expect(
      missingTagsThatFit(['photos', 'map_pin', 'bays', 'services', 'logo'])
    ).toBe(2)
    expect(missingTagsThatFit(['photos', 'logo', 'payout'])).toBe(2)
    expect(missingTagsThatFit(['radius_default', 'payout'])).toBe(1)
    expect(missingTagsThatFit(['photos', 'documents'])).toBe(2)
    expect(missingTagsThatFit(['payout'])).toBe(1)
  })

  test('how it books, in a word for the narrow Modes column', () => {
    const v = { dropinEnabled: true, doorstepEnabled: true }
    expect(modesShort(v)).toBe('Both')
    expect(modesShort({ ...v, dropinEnabled: false })).toBe('Doorstep')
    expect(modesShort({ ...v, doorstepEnabled: false })).toBe('At garage')
    expect(modesShort({ ...v, pickupEnabled: true })).toBe('Both + pickup')
    expect(modesShort({ dropinEnabled: false, doorstepEnabled: false })).toBe(
      'None on'
    )
    expect(
      modesShort({
        dropinEnabled: false,
        doorstepEnabled: false,
        pickupEnabled: true,
      })
    ).toBe('Pickup only')
  })

  test('pickup & drop, when on, comes last', () => {
    const garage = {
      dropinEnabled: true,
      doorstepEnabled: false,
      doorstepRadiusKm: null,
      hasDoorstepArea: false,
    }
    expect(bookingParts({ ...garage, pickupEnabled: true })).toEqual([
      { text: 'At the garage' },
      { text: 'Pickup & drop' },
    ])
    expect(bookingParts({ ...garage, pickupEnabled: false })).toEqual([
      { text: 'At the garage' },
    ])
    // An older server that does not say.
    expect(bookingParts(garage)).toEqual([{ text: 'At the garage' }])
  })
})

describe('the readiness line', () => {
  test('nothing at all: Ready', () => {
    expect(readinessSummary([])).toEqual({
      needsFixing: false,
      main: 'Ready',
      optional: null,
    })
  })

  test('only optional items: still Ready, with them named in grey', () => {
    expect(
      readinessSummary([item('optional', 'logo'), item('optional', 'photos')])
    ).toEqual({
      needsFixing: false,
      main: 'Ready',
      optional: '2 optional: logo, photos',
    })
  })

  test('only items to fix: amber, and named', () => {
    expect(readinessSummary([item('fix', 'map pin')])).toEqual({
      needsFixing: true,
      main: '1 to fix: map pin',
      optional: null,
    })
  })

  test('anything blocking: the counts, with the optional ones trailing', () => {
    expect(
      readinessSummary([
        item('blocking', 'services'),
        item('fix', 'map pin'),
        item('fix', 'bays'),
        item('optional', 'logo'),
      ])
    ).toEqual({
      needsFixing: true,
      main: '1 blocking · 2 to fix',
      optional: '1 optional',
    })
    expect(readinessSummary([item('blocking', 'services')]).main).toBe(
      '1 blocking'
    )
  })

  test('the checklist is grouped Blocking, Fix, Optional, leaving out empty groups', () => {
    const groups = readinessGroups([
      item('optional', 'logo'),
      item('blocking', 'services'),
    ])
    expect(groups.map((g) => g.title)).toEqual(['Blocking', 'Optional'])
    expect(groups[0].items.map((i) => i.short)).toEqual(['services'])
  })

  test('a row opens its tab, and brings the list back with its chip', () => {
    const href = editHref('v1', '/vendors?show=pending', 'services')
    expect(href).toBe(
      '/vendors/v1/edit?tab=services&back=%2Fvendors%3Fshow%3Dpending'
    )
    const back = new URLSearchParams(href.split('?')[1]).get('back')
    expect(safeBackHref(back)).toBe('/vendors?show=pending')
    expect(editHref('v1', '/vendors')).toBe('/vendors/v1/edit?back=%2Fvendors')
  })
})

describe('documents to review', () => {
  const docs = (toReview: number) => ({
    verified: false,
    approvedRequired: 1,
    required: 4,
    toReview,
    missingRequired: 2,
    rejected: 0,
  })

  test('garages with documents waiting, never one in the Bin', () => {
    const waiting = garage({ documents: docs(2) })
    expect(matchesShow(waiting, 'documents')).toBe(true)
    expect(matchesShow(garage({ documents: docs(0) }), 'documents')).toBe(false)
    expect(matchesShow(garage({ documents: null }), 'documents')).toBe(false)
    expect(matchesShow(garage(), 'documents')).toBe(false)
    const binned = garage({
      documents: docs(1),
      deletedAt: '2026-10-16T05:00:00Z',
      live: false,
    })
    expect(matchesShow(binned, 'documents')).toBe(false)
    expect(
      documentsToReviewCount([waiting, binned, garage({ documents: docs(0) })])
    ).toBe(1)
  })

  test('its own link, and a hint that says what it is', () => {
    expect(listHref('documents')).toBe('/vendors?show=documents')
    expect(showHints('documents')[0].term).toBe('Documents to review')
  })
})

describe('Gold chips (Detlio Certified)', () => {
  const cert = (certified: boolean, eligible: boolean) => ({
    certified,
    certifiedAt: certified ? '2026-10-01T05:00:00Z' : null,
    eligible,
    lastEvaluatedAt: '2026-10-18T00:00:00Z',
    keepsUntil: null,
    endedAt: null,
    endedKind: null,
  })

  test('Gold holds Gold garages; Gold-eligible holds eligible ones not yet Gold; never the Bin', () => {
    const certified = garage({ certification: cert(true, true) })
    const slipping = garage({ certification: cert(true, false) })
    const eligible = garage({ certification: cert(false, true) })
    const neither = garage({ certification: cert(false, false) })
    const unknown = garage({ certification: null })
    const binned = garage({
      certification: cert(true, true),
      deletedAt: '2026-10-16T05:00:00Z',
      live: false,
    })
    const all = [
      certified,
      slipping,
      eligible,
      neither,
      unknown,
      binned,
      garage(),
    ]

    expect(all.filter((v) => matchesShow(v, 'certified'))).toEqual([
      certified,
      slipping,
    ])
    expect(all.filter((v) => matchesShow(v, 'eligible'))).toEqual([eligible])
    expect(certificationCounts(all)).toEqual({ certified: 2, eligible: 1 })
  })

  test('their own links and hints', () => {
    expect(parseShow('certified')).toBe('certified')
    expect(parseShow('eligible')).toBe('eligible')
    expect(listHref('eligible')).toBe('/vendors?show=eligible')
    expect(showHints('certified')[0].term).toBe('Gold')
    expect(MORE_LABELS.certified).toBe('Gold')
    expect(MORE_LABELS.eligible).toBe('Gold-eligible, not awarded')
    expect(showHints('eligible')[0].meaning).toContain('quality check')
    expect(editHref('v1', '/vendors?show=eligible', 'certification')).toBe(
      '/vendors/v1/edit?tab=certification&back=%2Fvendors%3Fshow%3Deligible'
    )
  })
})

describe('find a garage', () => {
  test('by name, area or phone digits; empty finds every garage', () => {
    const v = {
      businessName: 'Shine Auto Spa',
      phone: '+919876543210',
      city: 'Chennai',
      address: '4, Velachery Main Rd',
      pincode: '600042',
    }
    expect(matchesSearch(v, '')).toBe(true)
    expect(matchesSearch(v, 'shine')).toBe(true)
    expect(matchesSearch(v, 'velachery')).toBe(true)
    expect(matchesSearch(v, '98765 43210')).toBe(true)
    expect(matchesSearch(v, 'Adyar')).toBe(false)
    expect(matchesSearch(v, '12')).toBe(false)
  })
})

describe('search reaches the owner too', () => {
  const v = {
    businessName: 'Shine Auto Spa',
    city: 'Chennai',
    phone: '+914400000000',
    owner: { id: 'o', name: 'Deepak Menon', phone: '+919876543210' },
  }
  test("the owner's name and phone", () => {
    expect(matchesSearch(v, 'deepak')).toBe(true)
    expect(matchesSearch(v, '98765 43210')).toBe(true)
    expect(matchesSearch(v, '4400 0000')).toBe(true)
    expect(matchesSearch({ ...v, owner: null }, 'deepak')).toBe(false)
  })
})

describe('the table filters in the URL', () => {
  test('each param is an allow-list, or trimmed text', () => {
    expect(parseMissing('photos')).toBe('photos')
    expect(parseMissing('PHOTOS')).toBeNull()
    expect(parseMissing(null)).toBeNull()
    expect(parseOnboardedBy('  Raga ')).toBe('Raga')
    expect(parseOnboardedBy('   ')).toBeNull()
    expect(parseOnboardedBy('x'.repeat(150))).toHaveLength(100)
    expect(parseTeam('with')).toBe('with')
    expect(parseTeam('mine')).toBe('mine')
    expect(parseTeam('all')).toBeNull()
  })

  test('the list round-trips through its link, and the default is the bare list', () => {
    expect(garageListHref({ show: 'live' })).toBe('/vendors')
    const href = garageListHref({
      show: 'all',
      q: ' foam ',
      missing: 'payout',
      onboardedBy: ONBOARDED_NOT_SET,
      team: 'with',
    })
    expect(href).toBe(
      '/vendors?show=all&q=foam&missing=payout&onboardedBy=-&team=with'
    )
    expect(parseGarageList(new URLSearchParams(href.split('?')[1]))).toEqual({
      show: 'all',
      q: 'foam',
      missing: 'payout',
      onboardedBy: '-',
      team: 'with',
    })
    // The editor's back arrow takes it as it is.
    expect(safeBackHref(href)).toBe(href)
    expect(garageListHref({ show: 'pending' })).toBe(listHref('pending'))
  })
})

describe('Missing, Onboarded by and the team chips', () => {
  test('missing matches only a garage the API says misses it', () => {
    expect(isMissing({ missing: ['photos', 'logo'] }, 'logo')).toBe(true)
    expect(isMissing({ missing: ['photos'] }, 'logo')).toBe(false)
    expect(isMissing({}, 'logo')).toBe(false)
    expect(isMissing({}, null)).toBe(true)
  })

  test('Onboarded by: a name exactly, or Not set', () => {
    expect(matchesOnboardedBy({ onboardedByName: 'Raga' }, 'Raga')).toBe(true)
    expect(matchesOnboardedBy({ onboardedByName: 'Raga' }, 'raga')).toBe(false)
    expect(
      matchesOnboardedBy({ onboardedByName: '  ' }, ONBOARDED_NOT_SET)
    ).toBe(true)
    expect(
      matchesOnboardedBy({ onboardedByName: null }, ONBOARDED_NOT_SET)
    ).toBe(true)
    expect(matchesOnboardedBy({}, ONBOARDED_NOT_SET)).toBe(true)
    expect(
      matchesOnboardedBy({ onboardedByName: 'Raga' }, ONBOARDED_NOT_SET)
    ).toBe(false)
    expect(matchesOnboardedBy({ onboardedByName: 'Raga' }, null)).toBe(true)
  })

  test('the choices: logins A to Z, then other typed names, then Not set, with counts', () => {
    const options = onboardedByOptions(
      [
        { onboardedByName: 'Raga' },
        { onboardedByName: 'Raga' },
        { onboardedByName: 'Uncle Mani' },
        { onboardedByName: null },
        {},
      ],
      ['Raga', 'E2E Admin', 'Raga']
    )
    expect(options).toEqual([
      { value: 'E2E Admin', label: 'E2E Admin', count: 0 },
      { value: 'Raga', label: 'Raga', count: 2 },
      { value: 'Uncle Mani', label: 'Uncle Mani', count: 1 },
      { value: ONBOARDED_NOT_SET, label: 'Not set', count: 2 },
    ])
  })

  test('With team is any open list; Assigned to me is my lists only', () => {
    const onList = {
      id: 'a',
      openCollection: {
        listId: 'l',
        assigneeName: 'Raga',
        dueOn: null,
        done: 0,
        total: 3,
      },
    }
    const free = { id: 'b', openCollection: null }
    expect(matchesTeam(onList, 'with', null)).toBe(true)
    expect(matchesTeam(free, 'with', null)).toBe(false)
    expect(matchesTeam(onList, 'mine', new Set(['a']))).toBe(true)
    expect(matchesTeam(onList, 'mine', new Set(['b']))).toBe(false)
    expect(matchesTeam(onList, 'mine', null)).toBe(false)
    expect(matchesTeam(free, null, null)).toBe(true)
  })
})

describe('the table cells', () => {
  test('area: the nearby locality when pinned in Chennai, else the city', () => {
    expect(garageArea({ city: 'Chennai', lat: null, lng: null })).toBe(
      'Chennai'
    )
    const outside = {
      city: 'Vellore',
      lat: 12.92,
      lng: 79.13,
      outsideServiceCity: { town: 'Vellore', km: 125 },
    } as unknown as Parameters<typeof garageArea>[0]
    expect(garageArea(outside)).toBe('Vellore')
  })

  test('stage: Live, or the word that keeps it from customers', () => {
    expect(stageCell(garage())).toEqual({ label: 'Live', tone: 'done' })
    expect(
      stageCell(garage({ live: false, status: 'pending', isVerified: false }))
    ).toEqual({
      label: 'Pending',
      tone: 'new',
    })
    expect(stageCell(garage({ live: false, isVerified: false }))).toEqual({
      label: 'Not shown to customers',
      tone: 'attention',
    })
    expect(stageCell(garage({ live: false, status: 'archived' })).tone).toBe(
      'closed'
    )
    expect(stageCell(garage({ deletedAt: '2026-10-01T00:00:00Z' })).label).toBe(
      'Bin'
    )
  })
})

describe('the next step', () => {
  const NOW = Date.parse('2026-10-26T06:30:00Z') // 12:00 in Chennai
  const blockingItem = item('blocking', 'services', 'no_services')

  test('something blocking comes first, as the action', () => {
    const step = garageNextStep(
      garage({
        live: false,
        readiness: [{ ...blockingItem, tab: 'services' }],
        missing: ['photos'],
      } as Partial<Row>),
      NOW
    )
    expect(step).toEqual({
      text: 'Add services',
      detail: 'Blocks going live',
      tone: 'late',
      tab: 'services',
    })
  })

  test('a teammate collecting: due today in amber, late in red, else with whom', () => {
    const list = (dueOn: string | null) =>
      garage({
        openCollection: {
          listId: 'l',
          assigneeName: 'Raga',
          dueOn,
          done: 3,
          total: 11,
        },
      } as Partial<Row>)
    expect(garageNextStep(list('2026-10-26'), NOW)).toEqual({
      text: 'Due today · 3 of 11',
      detail: 'With Raga',
      tone: 'attention',
    })
    expect(garageNextStep(list('2026-10-25'), NOW)).toEqual({
      text: 'Overdue · 3 of 11',
      detail: 'With Raga',
      tone: 'late',
    })
    expect(garageNextStep(list('2026-10-29'), NOW)).toEqual({
      text: 'Due Thu 29 Oct · 3 of 11',
      detail: 'With Raga',
      tone: 'neutral',
    })
    expect(garageNextStep(list(null), NOW)?.text).toBe('Collecting · 3 of 11')
  })

  test('unverified, then a stale ask, then what to collect, then what to fix', () => {
    expect(
      garageNextStep(
        garage({ live: false, isVerified: false, lat: 13 } as Partial<Row>),
        NOW
      )?.text
    ).toBe('Show to customers')
    // With no pin the server refuses: the pin comes first.
    expect(
      garageNextStep(
        garage({ live: false, isVerified: false, lat: null } as Partial<Row>),
        NOW
      )
    ).toEqual({
      text: 'Pin first',
      detail: 'Then show to customers',
      tone: 'attention',
      tab: 'location',
    })
    const asked = garage({
      missing: ['photos'],
      openMarks: [
        {
          id: 'm',
          kind: 'photos',
          label: '',
          status: 'asked',
          askedAt: '2026-10-23T06:00:00Z',
        },
      ],
    } as Partial<Row>)
    expect(garageNextStep(asked, NOW)).toEqual({
      text: 'Chase · 3 days ago',
      detail: 'Asked, no answer yet',
      tone: 'attention',
    })
    const fresh = garage({
      missing: ['photos', 'logo'],
      openMarks: [
        {
          id: 'm',
          kind: 'photos',
          label: '',
          status: 'asked',
          askedAt: '2026-10-25T06:00:00Z',
        },
      ],
    } as Partial<Row>)
    expect(garageNextStep(fresh, NOW)).toEqual({
      text: 'Collect 2 things',
      tone: 'neutral',
    })
    const fix = garage({
      readiness: [item('fix', 'bays', 'no_bays')],
    } as Partial<Row>)
    expect(garageNextStep(fix, NOW)?.text).toBe('Set the bays')
    expect(garageNextStep(garage(), NOW)).toBeNull()
  })

  test('nothing for a garage in the Bin or archived; ranks put red first', () => {
    expect(
      garageNextStep(garage({ deletedAt: '2026-10-01T00:00:00Z' }), NOW)
    ).toBeNull()
    expect(
      garageNextStep(
        garage({ live: false, status: 'archived', isVerified: false }),
        NOW
      )
    ).toBeNull()
    expect(nextStepRank({ text: 'x', tone: 'late' })).toBeGreaterThan(
      nextStepRank({ text: 'x', tone: 'attention' })
    )
    expect(nextStepRank({ text: 'x', tone: 'neutral' })).toBeGreaterThan(
      nextStepRank(null)
    )
  })
})
