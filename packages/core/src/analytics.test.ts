import { describe, expect, test } from 'bun:test'
import { browserAsksNotToTrack, createTracker, FLUSH_MS, VISIT_KEY, type TrackerDeps } from './analytics'
import { amountBucket, browseCategory, campaignSource, cleanPath, deviceClass } from './analytics-events'

const VISIT = '6f1d2c3b-4a59-4e1f-8d2c-0b9a8e7f6d5c'
const GARAGE = '2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10'

/** A browser to drive by hand: a clock, storage, and every request it would send. */
function fakeBrowser(overrides: Partial<TrackerDeps> = {}) {
  const sent: Array<{ via: 'beacon' | 'fetch'; body: Record<string, unknown> }> = []
  const timers: Array<{ run: () => void; ms: number; cleared: boolean }> = []
  const store = new Map<string, string>()
  let path = '/garage/2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10'
  const deps: TrackerDeps = {
    endpoint: 'https://api.detlio.com/api/v1/events',
    enabled: true,
    appVersion: '0.3.0',
    privacySignal: () => false,
    viewportWidth: () => 390,
    pathname: () => path,
    search: () => '?utm_source=Instagram&mode=doorstep',
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    randomId: () => VISIT,
    sendBeacon: (_url, body) => {
      sent.push({ via: 'beacon', body: JSON.parse(body) })
      return true
    },
    fetch: async (_url, body) => {
      sent.push({ via: 'fetch', body: JSON.parse(body) })
    },
    setTimer: (run, ms) => {
      const timer = { run, ms, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimer: (handle) => {
      ;(handle as { cleared: boolean }).cleared = true
    },
    ...overrides,
  }
  const runTimers = () => {
    for (const timer of timers.splice(0)) if (!timer.cleared) timer.run()
  }
  return { deps, sent, timers, store, runTimers, goTo: (next: string) => void (path = next) }
}

describe('the tracker', () => {
  test('batches events and sends them together a few seconds later', () => {
    const browser = fakeBrowser()
    const tracker = createTracker(browser.deps)
    tracker.track('garage_view', { vendorId: GARAGE, mode: 'doorstep' })
    tracker.track('service_add', { vendorId: GARAGE, category: 'car_wash' })
    expect(browser.sent).toHaveLength(0)
    expect(browser.timers).toHaveLength(1)
    expect(browser.timers[0].ms).toBe(FLUSH_MS)

    browser.runTimers()
    expect(browser.sent).toHaveLength(1)
    expect(browser.sent[0]).toEqual({
      via: 'beacon',
      body: {
        visitId: VISIT,
        device: 'phone',
        appVersion: '0.3.0',
        events: [
          { name: 'garage_view', path: '/garage/:id', props: { vendorId: GARAGE, mode: 'doorstep' } },
          { name: 'service_add', path: '/garage/:id', props: { vendorId: GARAGE, category: 'car_wash' } },
        ],
      },
    })
  })

  test('sends at once when a batch is full, never more than 25 in one', () => {
    const browser = fakeBrowser()
    const tracker = createTracker(browser.deps)
    for (let i = 0; i < 25; i++) tracker.track('home_view')
    expect(browser.sent).toHaveLength(1)
    expect((browser.sent[0].body.events as unknown[]).length).toBe(25)
    tracker.track('home_view')
    tracker.flush()
    expect(browser.sent).toHaveLength(2)
    expect((browser.sent[1].body.events as unknown[]).length).toBe(1)
  })

  test('an empty flush (the page hidden with nothing waiting) sends nothing', () => {
    const browser = fakeBrowser()
    createTracker(browser.deps).flush()
    expect(browser.sent).toHaveLength(0)
  })

  test('falls back to fetch when sendBeacon refuses', () => {
    const browser = fakeBrowser({ sendBeacon: () => false })
    const tracker = createTracker(browser.deps)
    tracker.track('home_view')
    tracker.flush()
    expect(browser.sent.map((s) => s.via)).toEqual(['fetch'])
  })

  test('keeps one visit id for the tab, in sessionStorage, and opens it once', () => {
    const browser = fakeBrowser()
    const first = createTracker(browser.deps)
    first.start()
    first.flush()
    expect(browser.store.get(VISIT_KEY)).toBe(VISIT)
    expect(browser.sent[0].body.events).toEqual([
      { name: 'app_open', path: '/garage/:id', props: { source: 'instagram' } },
    ])

    // The same tab after a reload: the visit goes on, no second app_open.
    const again = createTracker({ ...browser.deps, randomId: () => 'not-used' })
    again.start()
    again.track('home_view')
    again.flush()
    expect(browser.sent[1].body).toMatchObject({ visitId: VISIT, events: [{ name: 'home_view' }] })
  })

  test('works without storage (private mode), keeping the visit in memory', () => {
    const browser = fakeBrowser({
      storage: {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {
          throw new Error('denied')
        },
      },
    })
    const tracker = createTracker(browser.deps)
    tracker.track('home_view')
    tracker.track('help_view', { step: 'booking' })
    tracker.flush()
    expect(browser.sent[0].body.visitId).toBe(VISIT)
  })

  test('sends nothing at all when the browser says Do Not Track or GPC', () => {
    const browser = fakeBrowser({ privacySignal: () => true })
    const tracker = createTracker(browser.deps)
    tracker.start()
    tracker.track('garage_view', { vendorId: GARAGE })
    tracker.flush()
    browser.runTimers()
    expect(browser.sent).toHaveLength(0)
    expect(browser.timers).toHaveLength(0)
    // Not even a visit id is made.
    expect(browser.store.size).toBe(0)
  })

  test('does nothing when analytics is off for the build', () => {
    const browser = fakeBrowser({ enabled: false })
    const tracker = createTracker(browser.deps)
    tracker.start()
    tracker.track('home_view')
    tracker.flush()
    expect(browser.sent).toHaveLength(0)
    expect(browser.store.size).toBe(0)
  })

  test('drops keys an event does not take, and values that are not set', () => {
    const browser = fakeBrowser()
    const tracker = createTracker(browser.deps)
    tracker.track('search', {
      category: undefined,
      queryLength: 7,
      // Not allowed on search, however it got here.
      ...({ query: 'ceramic', vendorId: GARAGE } as object),
    })
    tracker.track('garage_list_view', { mode: undefined, category: undefined })
    tracker.flush()
    expect(browser.sent[0].body.events).toEqual([
      { name: 'search', path: '/garage/:id', props: { queryLength: 7 } },
      { name: 'garage_list_view', path: '/garage/:id' },
    ])
  })

  test('never throws, whatever the browser does', () => {
    const browser = fakeBrowser({
      sendBeacon: () => {
        throw new Error('beacon broke')
      },
      fetch: () => {
        throw new Error('fetch broke')
      },
      viewportWidth: () => {
        throw new Error('no window')
      },
    })
    const tracker = createTracker(browser.deps)
    expect(() => {
      tracker.start()
      tracker.track('home_view')
      tracker.flush()
      tracker.track('home_view')
      browser.runTimers()
    }).not.toThrow()
  })

  test('a rejected fetch is swallowed', async () => {
    const browser = fakeBrowser({ sendBeacon: null, fetch: () => Promise.reject(new Error('offline')) })
    const tracker = createTracker(browser.deps)
    tracker.track('home_view')
    expect(() => tracker.flush()).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})

describe('the privacy signals', () => {
  test('Do Not Track in any of its spellings, and Global Privacy Control', () => {
    expect(browserAsksNotToTrack({ doNotTrack: '1' }, {})).toBe(true)
    expect(browserAsksNotToTrack({ doNotTrack: 'yes' }, {})).toBe(true)
    expect(browserAsksNotToTrack({}, { doNotTrack: '1' })).toBe(true)
    expect(browserAsksNotToTrack({ msDoNotTrack: '1' }, {})).toBe(true)
    expect(browserAsksNotToTrack({ globalPrivacyControl: true }, {})).toBe(true)
    expect(browserAsksNotToTrack({ doNotTrack: '0' }, {})).toBe(false)
    expect(browserAsksNotToTrack({ doNotTrack: null, globalPrivacyControl: false }, {})).toBe(false)
    expect(browserAsksNotToTrack(undefined, undefined)).toBe(false)
  })
})

describe('what goes in an event', () => {
  test('a path without its query or ids', () => {
    expect(cleanPath('/bookings/2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10/receipt?celebrate=1')).toBe(
      '/bookings/:id/receipt'
    )
    // A gift link's code never leaves the browser (0049).
    expect(cleanPath('/gift/ABCDEFGHJKMNPQRS')).toBe('/gift/:code')
    // Nor a shared certificate's token (0053).
    expect(cleanPath('/verify/AbCdEfGhIjKlMnOpQrStUvWxYz012345')).toBe('/verify/:token')
  })

  test('the device from the window width only', () => {
    expect(deviceClass(390)).toBe('phone')
    expect(deviceClass(820)).toBe('tablet')
    expect(deviceClass(1440)).toBe('desktop')
  })

  test('a campaign source only when it is a plain slug', () => {
    expect(campaignSource('?utm_source=Instagram')).toBe('instagram')
    expect(campaignSource('?utm_source=my%20friend%20Ravi')).toBeUndefined()
    expect(campaignSource('')).toBeUndefined()
  })

  test('a category only when it is one the app offers', () => {
    expect(browseCategory('coating')).toBe('coating')
    expect(browseCategory('all')).toBeUndefined()
    expect(browseCategory(null)).toBeUndefined()
  })

  test('a price band, never the price', () => {
    expect(amountBucket(1299)).toBe('1000_1999')
  })
})
