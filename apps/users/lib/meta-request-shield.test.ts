import { describe, expect, test } from 'bun:test'
import {
  isMetaPixelRequest,
  originAndPath,
  scrubMetaBody,
  scrubMetaUrl,
  shieldMetaRequests,
  type ShieldWindow,
} from './meta-request-shield'

const GARAGE = '2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10'
const ADDRESS = '6f1d2c3b-4a59-4e1f-8d2c-0b9a8e7f6d5c'
/** Checkout, as the garage page sends a customer there. */
const CHECKOUT = `https://detlio.com/book/${GARAGE}?service=a1,b2&mode=doorstep&code=DIWALI50&address=${ADDRESS}`
/** Sign-in on the way to it: the same choices inside ?next=. */
const SIGN_IN = `https://detlio.com/login?next=${encodeURIComponent(`/book/${GARAGE}?code=DIWALI50&address=${ADDRESS}`)}`

/** A Pixel request as fbevents.js builds one. */
const pixelUrl = (dl: string, rl: string) =>
  `https://www.facebook.com/tr/?id=891710590692874&ev=InitiateCheckout&dl=${encodeURIComponent(dl)}&rl=${encodeURIComponent(rl)}&if=false&ts=1`

/** Nothing of the query is left anywhere in what goes out. */
function expectNoQueryLeft(sent: string) {
  const decoded = decodeURIComponent(decodeURIComponent(sent))
  expect(decoded).not.toContain('DIWALI50')
  expect(decoded).not.toContain(ADDRESS)
  expect(decoded).not.toContain('service=')
  expect(decoded).not.toContain('next=')
}

describe('an address as Meta may have it', () => {
  test('a checkout address carrying ?code=…&address=… keeps only its path', () => {
    expect(originAndPath(CHECKOUT)).toBe(`https://detlio.com/book/${GARAGE}`)
    expect(originAndPath(SIGN_IN)).toBe('https://detlio.com/login')
    expect(originAndPath('https://detlio.com/garages#list')).toBe(
      'https://detlio.com/garages'
    )
    expect(originAndPath('javascript:alert(1)')).toBe('')
    expect(originAndPath('')).toBe('')
  })

  test('only requests to the Pixel endpoint are touched', () => {
    expect(isMetaPixelRequest('https://www.facebook.com/tr/?id=1')).toBe(true)
    expect(isMetaPixelRequest('https://www.facebook.com/tr?id=1')).toBe(true)
    expect(isMetaPixelRequest('https://facebook.com/tr/')).toBe(true)
    expect(isMetaPixelRequest('https://api.detlio.com/api/v1/events')).toBe(
      false
    )
    expect(isMetaPixelRequest('https://notfacebook.com/tr/')).toBe(false)
    expect(isMetaPixelRequest('https://www.facebook.com/privacy/policy/')).toBe(
      false
    )
    const other = `https://api.detlio.com/api/v1/x?dl=${encodeURIComponent(CHECKOUT)}`
    expect(scrubMetaUrl(other)).toBe(other)
  })
})

describe('what goes to Meta', () => {
  test('a GET: dl and rl come out as origin + path, the rest as it was', () => {
    const sent = new URL(scrubMetaUrl(pixelUrl(CHECKOUT, SIGN_IN)))
    expect(sent.searchParams.get('dl')).toBe(
      `https://detlio.com/book/${GARAGE}`
    )
    expect(sent.searchParams.get('rl')).toBe('https://detlio.com/login')
    expect(sent.searchParams.get('ev')).toBe('InitiateCheckout')
    expect(sent.searchParams.get('id')).toBe('891710590692874')
    expectNoQueryLeft(sent.toString())
  })

  test('a POST body, as text, URLSearchParams or FormData', () => {
    const text = `id=1&ev=AddPaymentInfo&dl=${encodeURIComponent(CHECKOUT)}&rl=${encodeURIComponent(SIGN_IN)}`
    const fromText = scrubMetaBody(text)
    expect(fromText.ok).toBe(true)
    const params = new URLSearchParams(
      fromText.ok ? (fromText.body as string) : ''
    )
    expect(params.get('dl')).toBe(`https://detlio.com/book/${GARAGE}`)
    expect(params.get('rl')).toBe('https://detlio.com/login')
    expectNoQueryLeft(String(fromText.ok && fromText.body))

    const form = new FormData()
    form.append('dl', CHECKOUT)
    form.append('ev', 'Purchase')
    const fromForm = scrubMetaBody(form)
    expect(fromForm.ok && (fromForm.body as FormData).get('dl')).toBe(
      `https://detlio.com/book/${GARAGE}`
    )
    expect(fromForm.ok && (fromForm.body as FormData).get('ev')).toBe(
      'Purchase'
    )
    // The page's own FormData is not changed under it.
    expect(form.get('dl')).toBe(CHECKOUT)
  })

  test('a body it cannot read is not sent', () => {
    expect(scrubMetaBody(new Blob([CHECKOUT])).ok).toBe(false)
    expect(scrubMetaBody(new ArrayBuffer(8)).ok).toBe(false)
  })
})

describe('in front of the page', () => {
  function fakeWindow() {
    const beacons: Array<{ url: string; body: unknown }> = []
    const fetches: Array<{ url: unknown; body: unknown }> = []
    const xhrs: Array<{ url: unknown; body: unknown }> = []
    const images: string[] = []
    const attributes: string[] = []
    const forms: Array<{ action: string; values: Record<string, string> }> = []

    class FakeXhr {
      url: unknown
      open(_method: unknown, url: unknown) {
        this.url = url
      }
      send(body?: unknown) {
        xhrs.push({ url: this.url, body })
      }
    }
    class FakeImage {
      private value = ''
      get src() {
        return this.value
      }
      set src(next: string) {
        this.value = next
        images.push(next)
      }
    }
    class FakeElement {
      tagName = 'IMG'
      setAttribute(_name: string, value: string) {
        attributes.push(value)
      }
    }
    class FakeForm {
      action = ''
      elements: Array<{ name: string; value: string }> = []
      submit() {
        forms.push({
          action: this.action,
          values: Object.fromEntries(
            this.elements.map((e) => [e.name, e.value])
          ),
        })
      }
    }
    const win = {
      location: { href: CHECKOUT },
      navigator: {
        sendBeacon: (url: string, body?: unknown) => {
          beacons.push({ url, body })
          return true
        },
      },
      fetch: async (
        url: unknown,
        init?: { body?: unknown; method?: string }
      ) => {
        fetches.push({ url, body: init?.body })
        return {}
      },
      XMLHttpRequest: FakeXhr,
      HTMLImageElement: FakeImage,
      Element: FakeElement,
      HTMLFormElement: FakeForm,
    }
    return {
      win,
      beacons,
      fetches,
      xhrs,
      images,
      attributes,
      forms,
      FakeXhr,
      FakeImage,
      FakeElement,
      FakeForm,
    }
  }

  test('every way fbevents.js can send carries the checkout address as its path only', async () => {
    const page = fakeWindow()
    expect(shieldMetaRequests(page.win as unknown as ShieldWindow)).toBe(true)
    expect(shieldMetaRequests(page.win as unknown as ShieldWindow)).toBe(false)
    const url = pixelUrl(CHECKOUT, SIGN_IN)
    const body = `ev=Purchase&dl=${encodeURIComponent(CHECKOUT)}`

    page.win.navigator.sendBeacon(url, body)
    await page.win.fetch(url, { method: 'POST', body })
    const xhr = new page.FakeXhr()
    xhr.open('POST', url)
    xhr.send(body)
    const image = new page.FakeImage()
    image.src = url
    new page.FakeElement().setAttribute('src', url)
    const form = new page.FakeForm()
    form.action = 'https://www.facebook.com/tr/'
    form.elements = [
      { name: 'dl', value: CHECKOUT },
      { name: 'rl', value: SIGN_IN },
      { name: 'ev', value: 'Purchase' },
    ]
    form.submit()

    const everything = JSON.stringify({
      beacons: page.beacons,
      fetches: page.fetches,
      xhrs: page.xhrs,
      images: page.images,
      attributes: page.attributes,
      forms: page.forms,
    })
    expectNoQueryLeft(everything)
    expect(page.beacons).toHaveLength(1)
    expect(page.fetches).toHaveLength(1)
    expect(page.xhrs).toHaveLength(1)
    expect(page.images).toHaveLength(1)
    expect(page.forms[0].values).toEqual({
      dl: `https://detlio.com/book/${GARAGE}`,
      rl: 'https://detlio.com/login',
      ev: 'Purchase',
    })
    expect(new URL(page.images[0]).searchParams.get('dl')).toBe(
      `https://detlio.com/book/${GARAGE}`
    )
  })

  test("the page's own requests go through untouched", async () => {
    const page = fakeWindow()
    shieldMetaRequests(page.win as unknown as ShieldWindow)
    const own = `https://api.detlio.com/api/v1/booking-intents?code=DIWALI50`
    await page.win.fetch(own, { body: '{"code":"DIWALI50"}' })
    page.win.navigator.sendBeacon(
      'https://api.detlio.com/api/v1/events',
      '{"x":1}'
    )
    const image = new page.FakeImage()
    image.src = 'https://cdn.detlio.com/garage.jpg?w=600'
    expect(page.fetches[0]).toEqual({ url: own, body: '{"code":"DIWALI50"}' })
    expect(page.beacons[0]).toEqual({
      url: 'https://api.detlio.com/api/v1/events',
      body: '{"x":1}',
    })
    expect(page.images[0]).toBe('https://cdn.detlio.com/garage.jpg?w=600')
  })

  test('a Pixel request it cannot check is not sent', async () => {
    const page = fakeWindow()
    shieldMetaRequests(page.win as unknown as ShieldWindow)
    expect(
      page.win.navigator.sendBeacon(
        pixelUrl(CHECKOUT, ''),
        new Blob([CHECKOUT])
      )
    ).toBe(false)
    await expect(
      page.win.fetch(pixelUrl(CHECKOUT, ''), { body: new Blob([CHECKOUT]) })
    ).rejects.toThrow()
    expect(page.beacons).toHaveLength(0)
    expect(page.fetches).toHaveLength(0)
  })
})
