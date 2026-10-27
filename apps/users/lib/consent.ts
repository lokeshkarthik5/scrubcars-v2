/**
 * The customer's cookie choice: marketing cookies (Meta's Pixel) or only the
 * essential ones. Kept in a first-party cookie, `detlio_consent`, for a year,
 * so it is the same on every page and survives a closed tab.
 *
 * A browser that says Do Not Track or Global Privacy Control has already
 * answered: it counts as "essential" whatever the cookie says, and is never
 * asked. Nothing loads the Pixel until the answer is "marketing"
 * (components/meta-pixel.tsx).
 */
import { browserAsksNotToTrack } from '@repo/core/analytics'

export const CONSENT_COOKIE = 'detlio_consent'

export type ConsentChoice = 'marketing' | 'essential'

/** One year, in seconds. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365

/** The stored choice in a `document.cookie` string, or null when there is none (or it is not one of ours). */
export function parseConsentCookie(
  cookieString: string | null | undefined
): ConsentChoice | null {
  if (!cookieString) return null
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== CONSENT_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    if (value === 'marketing' || value === 'essential') return value
  }
  return null
}

/** What to assign to `document.cookie` to keep a choice: a year, the whole site, SameSite=Lax. */
export function consentCookieString(
  choice: ConsentChoice,
  secure: boolean
): string {
  return `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`
}

/** The choice that counts: a privacy signal always means essential. */
export function effectiveConsent(
  stored: ConsentChoice | null,
  privacySignal: boolean
): ConsentChoice | null {
  return privacySignal ? 'essential' : stored
}

/** Whether to ask: no choice yet and no privacy signal, or the customer opened Cookie settings. */
export function shouldAsk(
  state: Pick<ConsentState, 'stored' | 'privacySignal' | 'settingsOpen'>
): boolean {
  return state.settingsOpen || (state.stored === null && !state.privacySignal)
}

// ─── The browser's copy ──────────────────────────────────────────────────────

export interface ConsentState {
  /** What the cookie says, null until the customer chooses. */
  stored: ConsentChoice | null
  /** Do Not Track or Global Privacy Control is on. */
  privacySignal: boolean
  /** Cookie settings was tapped: ask again even though there is an answer. */
  settingsOpen: boolean
  /** False until read in the browser (server rendering and hydration). */
  ready: boolean
}

const SERVER_STATE: ConsentState = {
  stored: null,
  privacySignal: false,
  settingsOpen: false,
  ready: false,
}

let state: ConsentState = SERVER_STATE
/** The last choice made here, for a browser that refuses to keep the cookie. */
let madeHere: ConsentChoice | null = null
const listeners = new Set<() => void>()

function readPrivacySignal(): boolean {
  try {
    const nav = navigator as Navigator & {
      globalPrivacyControl?: boolean
      msDoNotTrack?: string
    }
    return browserAsksNotToTrack(
      nav,
      window as Window & { doNotTrack?: string | null }
    )
  } catch {
    return false
  }
}

function readStored(): ConsentChoice | null {
  try {
    return parseConsentCookie(document.cookie) ?? madeHere
  } catch {
    return madeHere
  }
}

/**
 * The browser's state, read afresh (the cookie can change in another tab)
 * but the same object while nothing has changed, as useSyncExternalStore
 * needs.
 */
function current(): ConsentState {
  if (typeof window === 'undefined') return SERVER_STATE
  const stored = readStored()
  const privacySignal = readPrivacySignal()
  if (
    !state.ready ||
    state.stored !== stored ||
    state.privacySignal !== privacySignal
  ) {
    state = {
      stored,
      privacySignal,
      settingsOpen: state.ready && state.settingsOpen,
      ready: true,
    }
  }
  return state
}

function update(next: Partial<ConsentState>) {
  state = { ...current(), ...next }
  for (const listener of [...listeners]) listener()
}

/** For useSyncExternalStore. */
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getConsentSnapshot(): ConsentState {
  return current()
}

export function getServerConsentSnapshot(): ConsentState {
  return SERVER_STATE
}

/** The choice in force now, in the browser: null when none has been made. */
export function currentConsent(): ConsentChoice | null {
  const now = current()
  return effectiveConsent(now.stored, now.privacySignal)
}

/** True only when the customer allowed marketing cookies and the browser sends no privacy signal. */
export function marketingAllowed(): boolean {
  return currentConsent() === 'marketing'
}

/** Keeps the customer's choice and closes the question. */
export function saveConsent(choice: ConsentChoice) {
  madeHere = choice
  try {
    document.cookie = consentCookieString(
      choice,
      window.location.protocol === 'https:'
    )
  } catch {
    // Cookies blocked: the choice still holds for this page.
  }
  update({ stored: choice, settingsOpen: false })
}

/** Cookie settings: show the question again. */
export function openConsentSettings() {
  update({ settingsOpen: true })
}

/** Closes Cookie settings without changing anything. */
export function closeConsentSettings() {
  update({ settingsOpen: false })
}
