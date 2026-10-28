import { describe, expect, test } from 'bun:test'
import { createTracker, TEAM_DEVICE_PARAM, teamDeviceFlag, type TrackerDeps } from './analytics'
import { CLIENT_EVENTS, EVENT_PROPS, referrerDomain, visitAttribution, visitChannel } from './analytics-events'

const VISIT = '6f1d2c3b-4a59-4e1f-8d2c-0b9a8e7f6d5c'
const IG_APP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone15,3; iOS 17_5; en_IN; en-IN; scale=3.00; 1290x2796; 618023787)'
const FB_APP =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/483.0.0.48.71;]'
const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

describe('where a visit came from', () => {
  test('the referring site by its domain only, never its path or query, and never ourselves', () => {
    expect(referrerDomain('https://www.google.com/search?q=car+wash+anna+nagar', 'detlio.com')).toBe('google.com')
    expect(referrerDomain('https://l.instagram.com/?u=https%3A%2F%2Fdetlio.com', 'detlio.com')).toBe('l.instagram.com')
    expect(referrerDomain('https://detlio.com/garages', 'detlio.com')).toBeUndefined()
    expect(referrerDomain('https://www.detlio.com/', 'detlio.com')).toBeUndefined()
    expect(referrerDomain('https://vendor.detlio.com/', 'www.detlio.com')).toBeUndefined()
    expect(referrerDomain('', 'detlio.com')).toBeUndefined()
    expect(referrerDomain('android-app://com.google.android.gm/', 'detlio.com')).toBeUndefined()
    expect(referrerDomain('not a url', 'detlio.com')).toBeUndefined()
    expect(referrerDomain('http://localhost:3000/', 'detlio.com')).toBeUndefined()
  })

  test('Instagram, from its in-app browser, its links or a campaign tag', () => {
    expect(visitChannel({ userAgent: IG_APP })).toBe('instagram')
    expect(visitChannel({ referrer: 'l.instagram.com', userAgent: CHROME })).toBe('instagram')
    expect(visitChannel({ source: 'instagram', userAgent: CHROME })).toBe('instagram')
    expect(visitChannel({ source: 'ig' })).toBe('instagram')
  })

  test('Google, Facebook, WhatsApp, Direct and Other', () => {
    expect(visitChannel({ referrer: 'google.com' })).toBe('google')
    expect(visitChannel({ referrer: 'google.co.in' })).toBe('google')
    expect(visitChannel({ source: 'google' })).toBe('google')
    expect(visitChannel({ referrer: 'm.facebook.com' })).toBe('facebook')
    expect(visitChannel({ userAgent: FB_APP })).toBe('facebook')
    expect(visitChannel({ source: 'whatsapp' })).toBe('whatsapp')
    expect(visitChannel({ referrer: 'wa.me' })).toBe('whatsapp')
    expect(visitChannel({ userAgent: CHROME })).toBe('direct')
    expect(visitChannel({})).toBe('direct')
    expect(visitChannel({ referrer: 'bing.com' })).toBe('other')
    expect(visitChannel({ source: 'flyer' })).toBe('other')
    // Not fooled by a lookalike domain.
    expect(visitChannel({ referrer: 'notinstagram.com' })).toBe('other')
  })

  test('a campaign tag beats the referrer and the browser', () => {
    expect(visitChannel({ source: 'facebook', referrer: 'l.instagram.com', userAgent: IG_APP })).toBe('facebook')
    expect(visitChannel({ referrer: 'google.com', userAgent: IG_APP })).toBe('google')
  })

  test('app_open carries the utm tags as slugs, the domain and the channel, and nothing else', () => {
    expect(
      visitAttribution({
        search: '?utm_source=Instagram&utm_medium=paid_social&utm_campaign=Diwali_Wash_2026&mode=doorstep',
        referrer: 'https://l.instagram.com/?u=x',
        userAgent: IG_APP,
        ownHost: 'detlio.com',
      })
    ).toEqual({
      source: 'instagram',
      medium: 'paid_social',
      campaign: 'diwali_wash_2026',
      referrer: 'l.instagram.com',
      channel: 'instagram',
    })
    expect(visitAttribution({ search: '', referrer: '', userAgent: CHROME, ownHost: 'detlio.com' })).toEqual({
      channel: 'direct',
    })
    // A tag that isn't a plain slug (free text, an email…) is dropped, not cleaned up.
    expect(
      visitAttribution({
        search: '?utm_source=ravi@gmail.com&utm_medium=my friend Ravi&utm_campaign=' + 'x'.repeat(65),
        referrer: '',
        userAgent: CHROME,
        ownHost: 'detlio.com',
      })
    ).toEqual({ channel: 'direct' })
  })

  test('every new step is a known event with its own props', () => {
    for (const name of [
      'landing_view',
      'garage_card_seen',
      'area_pick',
      'mode_switch',
      'service_sheet_open',
      'booking_start',
      'otp_sent',
      'pay_success',
      'pay_failed',
      'request_sent',
      'free_wash_claim',
      'banner_view',
      'banner_close',
    ] as const) {
      expect(CLIENT_EVENTS).toContain(name)
      expect(EVENT_PROPS[name]).toBeDefined()
    }
    expect(EVENT_PROPS.otp_sent).toEqual([])
  })
})

describe('the team-device switch', () => {
  test(`?${TEAM_DEVICE_PARAM}=1 marks the browser, =0 clears it, anything else keeps what is stored`, () => {
    expect(teamDeviceFlag('?team-device=1', null)).toEqual({ teamDevice: true, write: 'set' })
    expect(teamDeviceFlag('?team-device=1', '1')).toEqual({ teamDevice: true, write: null })
    expect(teamDeviceFlag('?team-device=0', '1')).toEqual({ teamDevice: false, write: 'clear' })
    expect(teamDeviceFlag('?team-device=0', null)).toEqual({ teamDevice: false, write: null })
    expect(teamDeviceFlag('', '1')).toEqual({ teamDevice: true, write: null })
    expect(teamDeviceFlag('?utm_source=ig', null)).toEqual({ teamDevice: false, write: null })
    expect(teamDeviceFlag('?team-device=yes', null)).toEqual({ teamDevice: false, write: null })
    expect(teamDeviceFlag('', 'something else')).toEqual({ teamDevice: false, write: null })
  })

  function deps(overrides: Partial<TrackerDeps> = {}) {
    const sent: string[] = []
    const store = new Map<string, string>()
    const value: TrackerDeps = {
      endpoint: 'https://api.detlio.com/api/v1/events',
      enabled: true,
      appVersion: '0.3.0',
      privacySignal: () => false,
      viewportWidth: () => 390,
      pathname: () => '/',
      search: () => '',
      referrer: () => 'https://www.google.com/',
      userAgent: () => CHROME,
      ownHost: () => 'detlio.com',
      storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
      randomId: () => VISIT,
      sendBeacon: (_url, body) => {
        sent.push(body)
        return true
      },
      fetch: null,
      setTimer: () => 1,
      clearTimer: () => undefined,
      ...overrides,
    }
    return { value, sent }
  }

  test('a team device sends nothing, and has no visit id to give the sign-in', () => {
    const { value, sent } = deps({ teamDevice: () => true })
    const tracker = createTracker(value)
    tracker.start()
    tracker.track('landing_view')
    tracker.flush()
    expect(sent).toHaveLength(0)
    expect(tracker.visitId()).toBeNull()
  })

  test('any other browser opens its visit with where it came from, and gives its visit id', () => {
    const { value, sent } = deps()
    const tracker = createTracker(value)
    tracker.start()
    tracker.flush()
    expect(JSON.parse(sent[0]).events).toEqual([
      { name: 'app_open', path: '/', props: { referrer: 'google.com', channel: 'google' } },
    ])
    expect(tracker.visitId()).toBe(VISIT)
  })

  test('with DNT or analytics off there is no visit id either', () => {
    expect(createTracker(deps({ privacySignal: () => true }).value).visitId()).toBeNull()
    expect(createTracker(deps({ enabled: false }).value).visitId()).toBeNull()
  })
})
