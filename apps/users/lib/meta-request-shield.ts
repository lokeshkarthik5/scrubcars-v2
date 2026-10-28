/**
 * Meta never gets a query string from us (0061, the checkout leak).
 *
 * Meta's fbevents.js builds its own requests to facebook.com and puts the
 * page's full address in them (`dl`) and the page the visitor came from
 * (`rl`): the Pixel's own facebook.com/tr, and in Chrome the same
 * parameters again to register an Attribution Reporting trigger
 * (facebook.com/privacy_sandbox/…). Checkout's address carries a promo code
 * and a saved address's id (/book/<garage>?service=…&code=…&address=…),
 * and sign-in on the way there carries it again inside ?next=. There is no
 * setting for that, so this stands in front of every way a page can send a
 * request (an image's src or any attribute holding a URL, a beacon, fetch,
 * XMLHttpRequest and a form post) and, for a request to facebook.com (any
 * subdomain, any path) only, rewrites every parameter that holds a page
 * address (`dl`, `rl`, and any other value that is an http(s) URL) with
 * `cut`: origin + path by default; lib/meta-pixel.ts also cuts a path that
 * holds a code or a booking's id (a referrer from a gift's page, a page
 * view sent just after checkout moved on to the booking). In the URL and in
 * the body. Anything it cannot rewrite (a binary body, a prepared Request
 * with a body) is not sent at all. Every other request passes through
 * untouched: the same arguments, unchanged.
 *
 * Installed once, by loadPixelScript, before fbevents.js is put on the
 * page, so only for a customer who allowed marketing cookies.
 */

/** The parameters that carry a page address. */
export const META_ADDRESS_PARAMS = ['dl', 'rl'] as const

/** How a page address is cut before Meta may have it. */
export type AddressCut = (value: string) => string

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

/** A request to Meta: facebook.com or any subdomain, any path (the Pixel's /tr, its attribution trigger). */
export function isMetaRequest(url: string, base?: string): boolean {
  try {
    const parsed = new URL(url, base)
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
    return host === 'facebook.com' || host.endsWith('.facebook.com')
  } catch {
    return false
  }
}

/** A value that is a page address: an absolute http(s) URL. */
const ABSOLUTE_URL = /^https?:\/\//i

/** Rewrites the address-holding parameters in place; true when one changed. */
function scrubParams(
  params: URLSearchParams | FormData,
  cut: AddressCut
): boolean {
  const entries = [...params.entries()]
  let changed = false
  const next = entries.map(([key, value]): [string, FormDataEntryValue] => {
    if (typeof value !== 'string') return [key, value]
    const holdsAddress =
      (META_ADDRESS_PARAMS as readonly string[]).includes(key) ||
      ABSOLUTE_URL.test(value.trim())
    if (!holdsAddress) return [key, value]
    const scrubbed = cut(value)
    if (scrubbed !== value) changed = true
    return [key, scrubbed]
  })
  if (!changed) return false
  for (const key of new Set(entries.map(([key]) => key))) params.delete(key)
  for (const [key, value] of next) {
    if (params instanceof URLSearchParams) params.append(key, String(value))
    else params.append(key, value)
  }
  return true
}

/** A Meta request's URL with its page addresses cut; any other URL, or one with nothing to cut, exactly as it was. */
export function scrubMetaUrl(
  url: string,
  base?: string,
  cut: AddressCut = originAndPath
): string {
  if (!isMetaRequest(url, base)) return url
  const parsed = new URL(url, base)
  return scrubParams(parsed.searchParams, cut) ? parsed.toString() : url
}

type Body = unknown

/**
 * A Meta request's body with its page addresses cut likewise: url-encoded
 * text, URLSearchParams or FormData. `{ ok: false }` for a body it cannot
 * read (JSON, a Blob, a buffer, a stream), which is then not sent.
 */
export function scrubMetaBody(
  body: Body,
  cut: AddressCut = originAndPath
): { ok: true; body: Body } | { ok: false } {
  if (body === undefined || body === null) return { ok: true, body }
  if (typeof body === 'string') {
    // JSON is not how the Pixel posts, and can't be checked here.
    if (/^\s*[[{]/.test(body)) return { ok: false }
    const params = new URLSearchParams(body)
    return {
      ok: true,
      body: scrubParams(params, cut) ? params.toString() : body,
    }
  }
  if (
    typeof URLSearchParams !== 'undefined' &&
    body instanceof URLSearchParams
  ) {
    const copy = new URLSearchParams(body)
    scrubParams(copy, cut)
    return { ok: true, body: copy }
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const copy = new FormData()
    for (const [key, value] of body.entries()) copy.append(key, value)
    scrubParams(copy, cut)
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

/**
 * A value that might be a request to Meta, worth parsing: a string naming
 * facebook.com. Anything else (most of what a page sets) passes untouched
 * without a URL being built.
 */
function mayBeMeta(value: unknown): value is string {
  return typeof value === 'string' && /facebook\.com/i.test(value)
}

/**
 * Installs the rewriting once on this window. Returns false when it was
 * already there (a client navigation, a second Allow). `cut` is how a page
 * address is cut (origin + path unless told otherwise).
 */
export function shieldMetaRequests(
  win: ShieldWindow,
  cut: AddressCut = originAndPath
): boolean {
  if (win.__detlioMetaShield) return false
  win.__detlioMetaShield = true
  const base = () => win.location?.href
  const isMeta = (url: string) => isMetaRequest(url, base())
  const scrubUrl = (url: string) => scrubMetaUrl(url, base(), cut)

  // navigator.sendBeacon(url, body)
  const nav = win.navigator
  if (nav && typeof nav.sendBeacon === 'function') {
    const original = nav.sendBeacon.bind(nav)
    nav.sendBeacon = (url: string, body?: Body) => {
      if (!isMeta(String(url))) return original(url, body)
      const scrubbed = scrubMetaBody(body, cut)
      if (!scrubbed.ok) return false
      return original(scrubUrl(String(url)), scrubbed.body)
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
        if (!isMeta(input.url)) return original(input, init)
        // A prepared Request's body can't be read here without consuming it.
        if (input.body !== null && input.body !== undefined) {
          return Promise.reject(
            new TypeError('Blocked: a Meta request that could not be checked')
          )
        }
        return original(scrubUrl(input.url), init)
      }
      const url = input instanceof URL ? input.href : String(input)
      if (!isMeta(url)) return original(input, init)
      const scrubbed = scrubMetaBody(init?.body, cut)
      if (!scrubbed.ok) {
        return Promise.reject(
          new TypeError('Blocked: a Meta request that could not be checked')
        )
      }
      return original(
        scrubUrl(url),
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
      this.__metaPixel = isMeta(url)
      if (this.__metaPixel) args[1] = scrubUrl(url)
      return open.apply(this, args)
    }
    xhr.send = function (this: { __metaPixel?: boolean }, body?: Body) {
      if (!this.__metaPixel) return send.call(this, body)
      const scrubbed = scrubMetaBody(body, cut)
      if (!scrubbed.ok) return undefined
      return send.call(this, scrubbed.body)
    }
  }

  // <img>.src = url (the Pixel's GET), and <img>.attributionSrc = url (an
  // Attribution Reporting registration, where the browser supports it).
  const img = win.HTMLImageElement?.prototype
  if (img) {
    for (const key of ['src', 'attributionSrc']) {
      const descriptor = findDescriptor(img, key)
      if (!descriptor?.set || !descriptor.get) continue
      const set = descriptor.set
      Object.defineProperty(img, key, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(this: unknown, value: unknown) {
          set.call(this, mayBeMeta(value) ? scrubUrl(value) : value)
        },
      })
    }
  }

  // element.setAttribute(name, url): src, attributionsrc or any other
  // attribute whose value is a request to Meta.
  const element = win.Element?.prototype
  if (element) {
    const setAttribute = element.setAttribute
    element.setAttribute = function (this: unknown, ...args: [string, string]) {
      // The same arguments as given, unless the value is a URL on facebook.com.
      const [name, value] = args
      if (!mayBeMeta(value)) return setAttribute.apply(this, args)
      return setAttribute.call(this, name, scrubUrl(value))
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
      if (typeof this.action === 'string' && isMeta(this.action)) {
        this.action = scrubUrl(this.action)
        for (const element of Array.from(this.elements)) {
          const value = element.value ?? ''
          if (
            (META_ADDRESS_PARAMS as readonly string[]).includes(
              element.name ?? ''
            ) ||
            ABSOLUTE_URL.test(value.trim())
          ) {
            element.value = cut(value)
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
