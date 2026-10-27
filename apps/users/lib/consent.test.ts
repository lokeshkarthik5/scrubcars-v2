import { afterEach, describe, expect, test } from 'bun:test'
import { browserAsksNotToTrack } from '@repo/core/analytics'
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  consentCookieString,
  currentConsent,
  effectiveConsent,
  getConsentSnapshot,
  getServerConsentSnapshot,
  marketingAllowed,
  openConsentSettings,
  parseConsentCookie,
  saveConsent,
  shouldAsk,
  subscribeConsent,
} from './consent'

describe('the consent cookie', () => {
  test('is read from a cookie string, whatever else is in it', () => {
    expect(parseConsentCookie('detlio_consent=marketing')).toBe('marketing')
    expect(
      parseConsentCookie('_fbp=fb.1.2.3; detlio_consent=essential; other=1')
    ).toBe('essential')
    expect(parseConsentCookie(' detlio_consent = marketing ')).toBe('marketing')
  })

  test('anything else is no choice at all', () => {
    expect(parseConsentCookie('')).toBeNull()
    expect(parseConsentCookie(null)).toBeNull()
    expect(parseConsentCookie(undefined)).toBeNull()
    expect(parseConsentCookie('detlio_consent=yes')).toBeNull()
    expect(parseConsentCookie('detlio_consent=')).toBeNull()
    expect(parseConsentCookie('not_detlio_consent=marketing')).toBeNull()
    expect(parseConsentCookie('detlio_consent_old=marketing')).toBeNull()
  })

  test('is written for a year, site-wide, SameSite=Lax, Secure over https', () => {
    expect(CONSENT_COOKIE).toBe('detlio_consent')
    expect(CONSENT_MAX_AGE).toBe(31_536_000)
    expect(consentCookieString('marketing', true)).toBe(
      'detlio_consent=marketing; Max-Age=31536000; Path=/; SameSite=Lax; Secure'
    )
    expect(consentCookieString('essential', false)).toBe(
      'detlio_consent=essential; Max-Age=31536000; Path=/; SameSite=Lax'
    )
    // What is written reads back as the same choice.
    expect(parseConsentCookie(consentCookieString('essential', true))).toBe(
      'essential'
    )
  })
})

describe('Do-Not-Track and Global Privacy Control', () => {
  test('count as "essential" whatever the cookie says', () => {
    expect(effectiveConsent('marketing', true)).toBe('essential')
    expect(effectiveConsent(null, true)).toBe('essential')
    expect(effectiveConsent('marketing', false)).toBe('marketing')
    expect(effectiveConsent(null, false)).toBeNull()
  })

  test('are never asked, unless they open Cookie settings', () => {
    expect(
      shouldAsk({ stored: null, privacySignal: true, settingsOpen: false })
    ).toBe(false)
    expect(
      shouldAsk({ stored: null, privacySignal: false, settingsOpen: false })
    ).toBe(true)
    expect(
      shouldAsk({
        stored: 'essential',
        privacySignal: false,
        settingsOpen: false,
      })
    ).toBe(false)
    expect(
      shouldAsk({
        stored: 'marketing',
        privacySignal: false,
        settingsOpen: true,
      })
    ).toBe(true)
    expect(
      shouldAsk({ stored: null, privacySignal: true, settingsOpen: true })
    ).toBe(true)
  })

  test('the signals are the ones first-party analytics already honours', () => {
    expect(
      effectiveConsent(
        'marketing',
        browserAsksNotToTrack({ globalPrivacyControl: true }, {})
      )
    ).toBe('essential')
    expect(
      effectiveConsent(
        'marketing',
        browserAsksNotToTrack({ doNotTrack: '1' }, {})
      )
    ).toBe('essential')
    expect(
      effectiveConsent(
        'marketing',
        browserAsksNotToTrack({ doNotTrack: '0' }, {})
      )
    ).toBe('marketing')
  })
})

describe('in the browser', () => {
  const g = globalThis as unknown as { window?: unknown; document?: unknown }

  function fakeBrowser(cookie: string, win: Record<string, unknown> = {}) {
    const jar = { cookie }
    g.document = {
      get cookie() {
        return jar.cookie
      },
      // The browser keeps name=value; the attributes are not read back.
      set cookie(value: string) {
        jar.cookie = value.split(';')[0]
      },
    }
    g.window = { location: { protocol: 'https:' }, ...win }
    return jar
  }

  afterEach(() => {
    delete g.window
    delete g.document
  })

  test('no window: the server snapshot, which asks nothing', () => {
    expect(getConsentSnapshot()).toBe(getServerConsentSnapshot())
    expect(getServerConsentSnapshot().ready).toBe(false)
    expect(marketingAllowed()).toBe(false)
  })

  test('reads the cookie, and keeps one snapshot while nothing changes', () => {
    fakeBrowser('detlio_consent=marketing')
    const first = getConsentSnapshot()
    expect(first).toMatchObject({
      stored: 'marketing',
      ready: true,
      settingsOpen: false,
    })
    expect(getConsentSnapshot()).toBe(first)
    expect(marketingAllowed()).toBe(true)
  })

  test('a choice writes the cookie, tells listeners, and closes Cookie settings', () => {
    const jar = fakeBrowser('')
    expect(currentConsent()).toBeNull()
    let heard = 0
    const stop = subscribeConsent(() => heard++)
    openConsentSettings()
    expect(getConsentSnapshot().settingsOpen).toBe(true)
    saveConsent('essential')
    stop()
    expect(jar.cookie).toBe('detlio_consent=essential')
    expect(getConsentSnapshot()).toMatchObject({
      stored: 'essential',
      settingsOpen: false,
    })
    expect(marketingAllowed()).toBe(false)
    expect(heard).toBe(2)
  })

  test('a browser asking not to be tracked is never "marketing", even with the cookie', () => {
    fakeBrowser('detlio_consent=marketing', { doNotTrack: '1' })
    expect(getConsentSnapshot().privacySignal).toBe(true)
    expect(currentConsent()).toBe('essential')
    expect(marketingAllowed()).toBe(false)
  })
})
