import {
  cleanPath,
  deviceClass,
  EVENT_PROPS,
  MAX_EVENTS_PER_BATCH,
  type ClientEventName,
  type EventProps,
  visitAttribution,
} from '@repo/core/analytics-events'

/**
 * Detlio's own usage events, for the admin's Funnel: the customer app says
 * what a visit did (saw a garage, started checkout, pressed Pay…) and this
 * sends it to our API, POST /events, in small batches. No third party.
 *
 * - A visit is a random id kept in sessionStorage: it ends with the tab, and
 *   the next visit is a new one. No cookie, no localStorage.
 * - Nothing is sent when the browser says Do Not Track or Global Privacy
 *   Control, from a team device (detlio.com/?team-device=1, below), or when
 *   the build has analytics off (development, E2E and previews, unless
 *   NEXT_PUBLIC_ANALYTICS=on).
 * - The visit's first event, app_open, says where it came from: utm_ tags,
 *   the referring site's domain (never its address) and the channel those
 *   add up to (analytics-events.ts visitAttribution).
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

/**
 * The team-device flag, in localStorage: a browser the Detlio team uses to
 * test the site, which then sends nothing to our step log, Clarity or Meta,
 * so the team's own clicks never count. Set by opening
 * detlio.com/?team-device=1 once on that browser; ?team-device=0 clears it.
 * A switch for the team, not a customer setting: it holds "1" and nothing
 * else.
 */
export const TEAM_DEVICE_KEY = 'detlio:team-device'

/** The query parameter that sets (1) or clears (0) the team-device flag. */
export const TEAM_DEVICE_PARAM = 'team-device'

/**
 * Whether this browser is a team device, after the page's query has had its
 * say: ?team-device=1 makes it one, ?team-device=0 stops it being one,
 * anything else leaves the stored flag as it is. Returns the new flag and
 * what to do with storage ('set', 'clear' or nothing).
 */
export function teamDeviceFlag(
  search: string,
  stored: string | null
): { teamDevice: boolean; write: 'set' | 'clear' | null } {
  let asked: string | null = null
  try {
    asked = new URLSearchParams(search).get(TEAM_DEVICE_PARAM)
  } catch {
    asked = null
  }
  if (asked === '1') return { teamDevice: true, write: stored === '1' ? null : 'set' }
  if (asked === '0') return { teamDevice: false, write: stored === null ? null : 'clear' }
  return { teamDevice: stored === '1', write: null }
}

/**
 * True on a browser the team marked with ?team-device=1 (TEAM_DEVICE_KEY),
 * applying the page's own ?team-device= first. False on the server, or when
 * localStorage can't be read. One localStorage read: cheap enough to ask
 * on every check.
 */
export function isTeamDevice(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const storage = window.localStorage
    const flag = teamDeviceFlag(window.location.search, storage.getItem(TEAM_DEVICE_KEY))
    if (flag.write === 'set') storage.setItem(TEAM_DEVICE_KEY, '1')
    if (flag.write === 'clear') storage.removeItem(TEAM_DEVICE_KEY)
    return flag.teamDevice
  } catch {
    return false
  }
}

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
  /** document.referrer: only its domain is kept, on app_open. */
  referrer?: () => string
  /** navigator.userAgent: only read for "Instagram"'s in-app browser, never kept. */
  userAgent?: () => string
  /** Our own host, so moving between our pages is not a referrer. */
  ownHost?: () => string
  /** A team device (isTeamDevice) sends nothing. */
  teamDevice?: () => boolean
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
  /** The visit's id while this browser records events, else null. */
  visitId(): string | null
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

  const active = () => deps.enabled && !deps.privacySignal() && !deps.teamDevice?.()

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
        if (visitId().isNew) {
          track(
            'app_open',
            visitAttribution({
              search: deps.search(),
              referrer: deps.referrer?.() ?? '',
              userAgent: deps.userAgent?.() ?? '',
              ownHost: deps.ownHost?.() ?? '',
            })
          )
        }
      } catch {
        // As above.
      }
    },
    track,
    flush,
    visitId() {
      try {
        return active() ? visitId().id : null
      } catch {
        return null
      }
    },
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

// ─── Listeners: one more place an event goes ─────────────────────────────────

/** One recorded event, as a listener sees it: only the props the event may carry. */
export interface TrackedEvent {
  name: ClientEventName
  props?: Record<string, string | number>
}

export type TrackListener = (event: TrackedEvent) => void

export interface TrackHub {
  emit(name: ClientEventName, props?: object): void
  /** Adds a listener; returns the way to remove it. */
  subscribe(listener: TrackListener): () => void
}

/**
 * Hands every `track` call to whoever listens: the customer app's Meta Pixel
 * mapping (apps/users/lib/meta-events.ts), which decides for itself whether
 * to send anything. Independent of the first-party tracker: it runs whether
 * or not NEXT_PUBLIC_ANALYTICS is on, and a listener checks its own consent.
 *
 * Events recorded before anyone listens (a page's first effects run before
 * the layout's) wait, at most MAX_EARLY of them, and go to the first
 * listener. A listener that throws never stops the others, or the page.
 */
export function createTrackHub(): TrackHub {
  const listeners = new Set<TrackListener>()
  let waiting: TrackedEvent[] | null = []

  function deliver(listener: TrackListener, event: TrackedEvent) {
    try {
      listener(event)
    } catch {
      // A listener's failure is its own.
    }
  }

  return {
    emit(name, props) {
      try {
        const event: TrackedEvent = { name }
        const kept = allowedProps(name, props)
        if (kept) event.props = kept
        if (listeners.size === 0) {
          if (waiting && waiting.length < MAX_EARLY) waiting.push(event)
          return
        }
        for (const listener of [...listeners]) deliver(listener, event)
      } catch {
        // Never let a measurement break the page.
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      const held = waiting
      waiting = null
      if (held) for (const event of held) deliver(listener, event)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const hub = createTrackHub()

/**
 * Calls `listener` with every event the app records from now on (and those
 * recorded before the first listener arrived). Returns the way to stop.
 */
export function onTrack(listener: TrackListener): () => void {
  return hub.subscribe(listener)
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
      referrer: () => document.referrer,
      userAgent: () => nav.userAgent,
      ownHost: () => window.location.hostname,
      teamDevice: isTeamDevice,
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
 * This visit's random id, while the tracker is recording (analytics on, no
 * DNT/GPC, not a team device), else null. Sent with the sign-in code, so the
 * API can put the new session's account on this visit's earlier events.
 */
export function currentVisitId(): string | null {
  try {
    return tracker?.visitId() ?? null
  } catch {
    return null
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
    hub.emit(name, props)
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
