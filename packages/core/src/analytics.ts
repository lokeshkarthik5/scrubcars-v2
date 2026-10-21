import {
  campaignSource,
  cleanPath,
  deviceClass,
  EVENT_PROPS,
  MAX_EVENTS_PER_BATCH,
  type ClientEventName,
  type EventProps,
} from '@repo/core/analytics-events'

/**
 * Detlio's own usage events, for the admin's Funnel: the customer app says
 * what a visit did (saw a garage, started checkout, pressed Pay…) and this
 * sends it to our API, POST /events, in small batches. No third party.
 *
 * - A visit is a random id kept in sessionStorage: it ends with the tab, and
 *   the next visit is a new one. No cookie, no localStorage.
 * - Nothing is sent when the browser says Do Not Track or Global Privacy
 *   Control, or when the build has analytics off (development, E2E and
 *   previews, unless NEXT_PUBLIC_ANALYTICS=on).
 * - Events wait in memory and go every few seconds, as soon as a batch is
 *   full, and when the page is hidden or closed, by navigator.sendBeacon
 *   (fetch with keepalive where that is refused).
 * - Nothing here ever throws or waits: a lost event is a gap in a chart,
 *   never a broken page. The answer is never read.
 */

/** How long an event waits for others to share its request. */
export const FLUSH_MS = 5000

/** Where the visit id is kept: the tab's sessionStorage, never a cookie. */
export const VISIT_KEY = 'detlio:visit'

/** Events held before the app has started the tracker (a page's first effects run first). */
const MAX_EARLY = MAX_EVENTS_PER_BATCH

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface QueuedEvent {
  name: ClientEventName
  path: string
  props?: Record<string, string | number>
}

/** What the tracker needs from the browser, passed in so tests can stand in for it. */
export interface TrackerDeps {
  endpoint: string
  enabled: boolean
  appVersion: string
  /** True when the browser asks not to be tracked (DNT or GPC). */
  privacySignal: () => boolean
  viewportWidth: () => number
  pathname: () => string
  search: () => string
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | null
  randomId: () => string
  sendBeacon: ((url: string, body: string) => boolean) | null
  fetch: ((url: string, body: string) => Promise<unknown>) | null
  setTimer: (run: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}

export interface Tracker {
  /** Opens the visit: app_open when it is a new one. */
  start(): void
  track<N extends ClientEventName>(name: N, props?: EventProps[N]): void
  /** Sends whatever is waiting, now. */
  flush(): void
}

/** Only the keys the event may carry, and only values that are set. */
function allowedProps(name: ClientEventName, props: object | undefined) {
  if (!props) return undefined
  const out: Record<string, string | number> = {}
  for (const key of EVENT_PROPS[name] as readonly string[]) {
    const value = (props as Record<string, unknown>)[key]
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function createTracker(deps: TrackerDeps): Tracker {
  const queue: QueuedEvent[] = []
  let timer: unknown = null
  let visit: { id: string; isNew: boolean } | null = null

  const active = () => deps.enabled && !deps.privacySignal()

  function visitId() {
    if (visit) return visit
    let stored: string | null = null
    try {
      stored = deps.storage?.getItem(VISIT_KEY) ?? null
    } catch {
      stored = null
    }
    if (stored && UUID_RE.test(stored)) {
      visit = { id: stored, isNew: false }
    } else {
      visit = { id: deps.randomId(), isNew: true }
      try {
        deps.storage?.setItem(VISIT_KEY, visit.id)
      } catch {
        // Private mode or storage full: the visit lives in memory instead.
      }
    }
    return visit
  }

  function send(body: string) {
    try {
      if (deps.sendBeacon?.(deps.endpoint, body)) return
    } catch {
      // Fall through to fetch.
    }
    try {
      deps.fetch?.(deps.endpoint, body)?.catch(() => undefined)
    } catch {
      // Nothing else to try; the events are dropped.
    }
  }

  function flush() {
    try {
      if (timer !== null) {
        deps.clearTimer(timer)
        timer = null
      }
      if (queue.length === 0) return
      if (!active()) {
        queue.length = 0
        return
      }
      const { id } = visitId()
      const device = deviceClass(deps.viewportWidth())
      while (queue.length > 0) {
        const events = queue.splice(0, MAX_EVENTS_PER_BATCH)
        send(JSON.stringify({ visitId: id, device, appVersion: deps.appVersion, events }))
      }
    } catch {
      queue.length = 0
    }
  }

  function track<N extends ClientEventName>(name: N, props?: EventProps[N]) {
    try {
      if (!active()) return
      const event: QueuedEvent = { name, path: cleanPath(deps.pathname()) }
      const kept = allowedProps(name, props)
      if (kept) event.props = kept
      queue.push(event)
      if (queue.length >= MAX_EVENTS_PER_BATCH) flush()
      else if (timer === null) timer = deps.setTimer(flush, FLUSH_MS)
    } catch {
      // Never let a measurement break the page.
    }
  }

  return {
    start() {
      try {
        if (!active()) return
        if (visitId().isNew) track('app_open', { source: campaignSource(deps.search()) })
      } catch {
        // As above.
      }
    },
    track,
    flush,
  }
}

// ─── The app's one tracker ───────────────────────────────────────────────────

function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Do Not Track (any of its spellings) or Global Privacy Control. */
export function browserAsksNotToTrack(
  nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean; msDoNotTrack?: string } | undefined,
  win: { doNotTrack?: string | null } | undefined
): boolean {
  const dnt = nav?.doNotTrack ?? win?.doNotTrack ?? nav?.msDoNotTrack
  return dnt === '1' || dnt === 'yes' || nav?.globalPrivacyControl === true
}

let tracker: Tracker | null = null
let early: Array<() => void> = []
let started = false

/**
 * Starts the app's tracker once, in the browser. Before it starts, events
 * wait (a page's own first effects run before the layout's); if analytics
 * is off they are dropped.
 */
export function initAnalytics(config: { endpoint: string; enabled: boolean; appVersion: string }) {
  if (started || typeof window === 'undefined') return
  started = true
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
    const win = window as Window & { doNotTrack?: string | null }
    tracker = createTracker({
      ...config,
      privacySignal: () => browserAsksNotToTrack(nav, win),
      viewportWidth: () => window.innerWidth,
      pathname: () => window.location.pathname,
      search: () => window.location.search,
      storage: (() => {
        try {
          return window.sessionStorage
        } catch {
          return null
        }
      })(),
      randomId: randomUuid,
      sendBeacon:
        typeof nav.sendBeacon === 'function' ? (url, body) => nav.sendBeacon(url, body) : null,
      fetch: (url, body) =>
        fetch(url, {
          method: 'POST',
          body,
          keepalive: true,
          credentials: 'include',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        }),
      setTimer: (run, ms) => window.setTimeout(run, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
    })
    const hidden = () => tracker?.flush()
    window.addEventListener('pagehide', hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hidden()
    })
    tracker.start()
    for (const replay of early) replay()
  } catch {
    tracker = null
  } finally {
    early = []
  }
}

/**
 * Records one event. Safe anywhere: before the tracker starts, during
 * server rendering, with analytics off or the browser asking not to be
 * tracked (then nothing is sent), and it never throws.
 */
export function track<N extends ClientEventName>(name: N, props?: EventProps[N]): void {
  try {
    if (typeof window === 'undefined') return
    if (tracker) {
      tracker.track(name, props)
      return
    }
    // Held until the layout starts the tracker, a moment later.
    if (!started && early.length < MAX_EARLY) early.push(() => tracker?.track(name, props))
  } catch {
    // Never let a measurement break the page.
  }
}
