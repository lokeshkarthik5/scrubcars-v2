import { afterEach, describe, expect, test } from 'bun:test'
import type { TrackedEvent } from '@repo/core/analytics'
import {
  CLARITY_MASK,
  CLARITY_SCRIPT_ID,
  clarityCallsFor,
  clarityProjectId,
  clarityScriptUrl,
  installClarity,
  loadClarityScript,
  mirrorToClarity,
  pauseClarity,
  withdrawClarity,
} from './clarity'

type Calls = unknown[][]
type Win = Parameters<typeof installClarity>[0]
const queue = (win: Win) =>
  (win as unknown as { clarity: { q: Calls } }).clarity.q

describe('the project id', () => {
  test('only a plain Clarity id turns it on', () => {
    expect(clarityProjectId('abcd1234ef')).toBe('abcd1234ef')
    expect(clarityProjectId(' abcd1234ef ')).toBe('abcd1234ef')
    expect(clarityProjectId(undefined)).toBeNull()
    expect(clarityProjectId('')).toBeNull()
    expect(clarityProjectId('abc')).toBeNull()
    expect(clarityProjectId('abcd1234"><script>')).toBeNull()
    expect(clarityScriptUrl('abcd1234ef')).toBe(
      'https://www.clarity.ms/tag/abcd1234ef'
    )
  })
})

describe('on the page', () => {
  test("installs Clarity's queue once, with analytics storage only", () => {
    const win = {} as Win
    expect(installClarity(win)).toBe(true)
    expect(installClarity(win)).toBe(false)
    expect(queue(win)).toEqual([
      ['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }],
      ['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }],
    ])
  })

  // The Privacy Policy has a section with id="clarity", so window.clarity is
  // that element until Clarity's queue replaces it. Calling the element
  // crashed the page when Allow came after Only essential (CI E2E, 29 Oct).
  test('a page element named "clarity" is not taken for Clarity', () => {
    const element = { tagName: 'SECTION' }
    const win = { clarity: element } as unknown as Win
    withdrawClarity(win)
    pauseClarity(true, win)
    expect(installClarity(win)).toBe(true)
    expect(queue(win)).toEqual([
      ['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }],
    ])
  })

  test('Only essential mid-visit withdraws it; a page it stays off pauses it', () => {
    const win = {} as Win
    withdrawClarity(win) // never loaded: nothing to do, and no throw
    installClarity(win)
    pauseClarity(true, win)
    pauseClarity(false, win)
    withdrawClarity(win)
    expect(queue(win).slice(1)).toEqual([
      ['pause'],
      ['resume'],
      ['consent', false],
    ])
  })

  test('adds the script tag once', () => {
    const added: Array<{ id: string; src: string; async: boolean }> = []
    const doc = {
      getElementById: (id: string) => added.find((s) => s.id === id) ?? null,
      createElement: () => ({ id: '', src: '', async: false }),
      head: {
        appendChild: (el: { id: string; src: string; async: boolean }) =>
          added.push(el),
      },
    } as unknown as Document
    loadClarityScript('abcd1234ef', doc)
    loadClarityScript('abcd1234ef', doc)
    expect(added).toEqual([
      {
        id: CLARITY_SCRIPT_ID,
        src: 'https://www.clarity.ms/tag/abcd1234ef',
        async: true,
      },
    ])
  })

  test('the mask attribute is the one Clarity reads', () => {
    expect(CLARITY_MASK).toEqual({ 'data-clarity-mask': 'true' })
  })
})

describe('our steps, as Clarity tags', () => {
  const heard = (
    name: TrackedEvent['name'],
    props?: TrackedEvent['props']
  ): TrackedEvent => (props ? { name, props } : { name })

  test('the step name as a tag and an event, and nothing else from its props', () => {
    expect(
      clarityCallsFor(
        heard('booking_start', { vendorId: 'v', serviceCount: 2 })
      )
    ).toEqual([
      ['set', 'step', 'booking_start'],
      ['event', 'booking_start'],
    ])
  })

  test("the visit's channel, on its first event", () => {
    expect(
      clarityCallsFor(
        heard('app_open', {
          channel: 'instagram',
          campaign: 'diwali',
          referrer: 'l.instagram.com',
        })
      )
    ).toEqual([
      ['set', 'step', 'app_open'],
      ['event', 'app_open'],
      ['set', 'channel', 'instagram'],
    ])
  })

  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  afterEach(() => {
    delete g.window
    delete g.document
  })

  function browser(cookie: string, pathname = '/garages') {
    g.document = { cookie }
    const win = {
      location: { pathname, search: '', protocol: 'https:' },
    } as unknown as Win
    g.window = win
    installClarity(win)
    return win
  }

  test('sent only with Allow, and never on a page it stays off', () => {
    const allowed = browser('detlio_consent=all')
    mirrorToClarity(heard('landing_view'))
    expect(queue(allowed).slice(1)).toEqual([
      ['set', 'step', 'landing_view'],
      ['event', 'landing_view'],
    ])

    for (const cookie of [
      'detlio_consent=essential',
      'detlio_consent=marketing',
      '',
    ]) {
      const win = browser(cookie)
      mirrorToClarity(heard('landing_view'))
      expect(queue(win)).toHaveLength(1)
    }

    const bookingPage = browser(
      'detlio_consent=all',
      '/bookings/2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10'
    )
    mirrorToClarity(heard('help_view', { step: 'booking' }))
    expect(queue(bookingPage)).toHaveLength(1)
  })
})
