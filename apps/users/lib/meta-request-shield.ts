/**
 * Meta never gets a query string from us (0061, the checkout leak).
 *
 * Meta's fbevents.js builds its own requests to facebook.com/tr and puts
 * the page's full address in them (`dl`) and the page the visitor came from
 * (`rl`). Checkout's address carries a promo code and a saved address's id
 * (/book/<garage>?service=…&code=…&address=…), and sign-in on the way there
 * carries it again inside ?next=. There is no setting for that, so this
 * stands in front of every way a page can send a request (an image, a
 * beacon, fetch, XMLHttpRequest and a form post) and, for a request to
 * facebook.com/tr only, rewrites `dl` and `rl` to origin + path, in the URL
 * and in the body. Anything it cannot rewrite (a binary body, a prepared
 * Request with a body) is not sent at all. Every other request passes
 * through untouched.
 *
 * Installed once, by loadPixelScript, before fbevents.js is put on the
 * page, so only for a customer who allowed marketing cookies.
 */

/** The parameters that carry a page address. */
export const META_ADDRESS_PARAMS = ['dl', 'rl'] as const

/** An address as Meta may have it: origin and path, nothing after them. '' when it isn't one. */
export function originAndPath(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return `${url.origin}${url.pathname}`
  } catch {
    return ''
  }
}

/** A request to Meta's Pixel endpoint (facebook.com/tr, any subdomain). */
export function isMetaPixelRequest(url: string, base?: string): boolean {
  try {
    const parsed = new URL(url, base)
    const host = parsed.hostname.toLowerCase()
    return (
      (host === 'facebook.com' || host.endsWith('.facebook.com')) &&
      /^\/tr\/?$/.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

function scrubParams(params: URLSearchParams | FormData) {
  for (const key of META_ADDRESS_PARAMS) {
    const value = params.get(key)
    if (typeof value === 'string') params.set(key, originAndPath(value))
  }
}

/** A Pixel request's URL with `dl` and `rl` cut to origin + path; any other URL as it was. */
export function scrubMetaUrl(url: string, base?: string): string {
  if (!isMetaPixelRequest(url, base)) return url
  const parsed = new URL(url, base)
  scrubParams(parsed.searchParams)
  return parsed.toString()
}

type Body = unknown

/**
 * A Pixel request's body with `dl` and `rl` cut likewise: url-encoded text,
 * URLSearchParams or FormData. `{ ok: false }` for a body it cannot read
 * (a Blob, a buffer, a stream), which is then not sent.
 */
export function scrubMetaBody(
  body: Body
): { ok: true; body: Body } | { ok: false } {
  if (body === undefined || body === null) return { ok: true, body }
  if (typeof body === 'string') {
    const params = new URLSearchParams(body)
    scrubParams(params)
    return { ok: true, body: params.toString() }
  }
  if (
    typeof URLSearchParams !== 'undefined' &&
    body instanceof URLSearchParams
  ) {
    const copy = new URLSearchParams(body)
    scrubParams(copy)
    return { ok: true, body: copy }
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const copy = new FormData()
    for (const [key, value] of body.entries()) copy.append(key, value)
    scrubParams(copy)
    return { ok: true, body: copy }
  }
  return { ok: false }
}

/** The parts of a window this needs; each is optional, so a test can pass only some. */
export interface ShieldWindow {
  location?: { href: string }
  navigator?: { sendBeacon?: (url: string, body?: Body) => boolean }
  fetch?: (
    input: unknown,
    init?: { body?: Body } & Record<string, unknown>
  ) => Promise<unknown>
  XMLHttpRequest?: {
    prototype: {
      open: (...args: unknown[]) => void
      send: (body?: Body) => void
    }
  }
  HTMLImageElement?: { prototype: object }
  Element?: {
    prototype: { setAttribute: (name: string, value: string) => void }
  }
  HTMLFormElement?: { prototype: { submit: () => void } }
  Request?: new (...args: never[]) => { url: string; body: unknown }
  __detlioMetaShield?: boolean
}

/** Installs the rewriting once on this window. Returns false when it was already there. */
export function shieldMetaRequests(win: ShieldWindow): boolean {
  if (win.__detlioMetaShield) return false
  win.__detlioMetaShield = true
  const base = () => win.location?.href

  // navigator.sendBeacon(url, body)
  const nav = win.navigator
  if (nav && typeof nav.sendBeacon === 'function') {
    const original = nav.sendBeacon.bind(nav)
    nav.sendBeacon = (url: string, body?: Body) => {
      if (!isMetaPixelRequest(String(url), base())) return original(url, body)
      const scrubbed = scrubMetaBody(body)
      if (!scrubbed.ok) return false
      return original(scrubMetaUrl(String(url), base()), scrubbed.body)
    }
  }

  // fetch(input, init)
  if (typeof win.fetch === 'function') {
    const original = win.fetch.bind(win)
    win.fetch = (
      input: unknown,
      init?: { body?: Body } & Record<string, unknown>
    ) => {
      const Req = win.Request
      if (Req && input instanceof Req) {
        if (!isMetaPixelRequest(input.url, base())) return original(input, init)
        // A prepared Request's body can't be read here without consuming it.
        if (input.body !== null && input.body !== undefined) {
          return Promise.reject(
            new TypeError('Blocked: a Pixel request that could not be checked')
          )
        }
        return original(scrubMetaUrl(input.url, base()), init)
      }
      const url = input instanceof URL ? input.href : String(input)
      if (!isMetaPixelRequest(url, base())) return original(input, init)
      const scrubbed = scrubMetaBody(init?.body)
      if (!scrubbed.ok) {
        return Promise.reject(
          new TypeError('Blocked: a Pixel request that could not be checked')
        )
      }
      return original(
        scrubMetaUrl(url, base()),
        init ? { ...init, body: scrubbed.body } : init
      )
    }
  }

  // XMLHttpRequest: open(method, url, …), then send(body)
  const xhr = win.XMLHttpRequest?.prototype
  if (xhr) {
    const open = xhr.open
    const send = xhr.send
    xhr.open = function (this: { __metaPixel?: boolean }, ...args: unknown[]) {
      const url = String(args[1])
      this.__metaPixel = isMetaPixelRequest(url, base())
      if (this.__metaPixel) args[1] = scrubMetaUrl(url, base())
      return open.apply(this, args)
    }
    xhr.send = function (this: { __metaPixel?: boolean }, body?: Body) {
      if (!this.__metaPixel) return send.call(this, body)
      const scrubbed = scrubMetaBody(body)
      if (!scrubbed.ok) return undefined
      return send.call(this, scrubbed.body)
    }
  }

  // <img>.src = url (the Pixel's GET)
  const img = win.HTMLImageElement?.prototype
  if (img) {
    const descriptor = findDescriptor(img, 'src')
    if (descriptor?.set && descriptor.get) {
      const set = descriptor.set
      Object.defineProperty(img, 'src', {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(this: unknown, value: string) {
          set.call(this, scrubMetaUrl(String(value), base()))
        },
      })
    }
  }

  // <img>.setAttribute('src', url)
  const element = win.Element?.prototype
  if (element) {
    const setAttribute = element.setAttribute
    element.setAttribute = function (
      this: { tagName?: string },
      name: string,
      value: string
    ) {
      const scrubbed =
        String(name).toLowerCase() === 'src' && this.tagName === 'IMG'
          ? scrubMetaUrl(String(value), base())
          : value
      return setAttribute.call(this, name, scrubbed)
    }
  }

  // A form posted into a hidden frame (the Pixel's fallback POST).
  const form = win.HTMLFormElement?.prototype
  if (form) {
    const submit = form.submit
    form.submit = function (this: {
      action: string
      elements: ArrayLike<{ name?: string; value?: string }>
    }) {
      if (isMetaPixelRequest(this.action, base())) {
        this.action = scrubMetaUrl(this.action, base())
        for (const element of Array.from(this.elements)) {
          if (element.name === 'dl' || element.name === 'rl') {
            element.value = originAndPath(element.value ?? '')
          }
        }
      }
      return submit.call(this)
    }
  }
  return true
}

/** A property's descriptor from the object or the nearest prototype that has it. */
function findDescriptor(
  target: object,
  key: string
): PropertyDescriptor | undefined {
  for (
    let proto: object | null = target;
    proto;
    proto = Object.getPrototypeOf(proto)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key)
    if (descriptor) return descriptor
  }
  return undefined
}
