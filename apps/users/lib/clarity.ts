/**
 * Microsoft Clarity: heatmaps, scroll depth, rage and dead taps, and
 * recordings of real visits, for the owner to see why customers leave
 * (admin's Statistics → Behaviour links to them). components/clarity.tsx
 * mounts it; components/analytics.tsx passes it our usage events (a tag per
 * step, so recordings can be filtered by how far a visit got).
 *
 * Only for a customer who said Allow to analytics and marketing cookies
 * (lib/consent.ts `analyticsAllowed`), only when the build has a project id
 * (NEXT_PUBLIC_CLARITY_ID), never on a page whose address holds a code or a
 * booking's id (lib/meta-pixel.ts `pixelExcluded`), never on a team device.
 *
 * What Clarity is told by us: our event names as a "step" tag and an event,
 * and the visit's channel (instagram, google…). Never a name, number,
 * address, code or id. Clarity records the page itself, so fields and areas
 * that show personal details carry data-clarity-mask="true" (CLARITY_MASK),
 * and Clarity masks what is typed into every field by default; keep the
 * project's masking on "Balanced" or "Strict" in Clarity's settings.
 */
import type { TrackedEvent } from '@repo/core/analytics'
import { analyticsAllowed } from './consent'
import { currentPageExcluded } from './meta-pixel'

/** Spread on an element whose text Clarity must never record. */
export const CLARITY_MASK = { 'data-clarity-mask': 'true' } as const

/** A Clarity project id: a short code of letters and digits. */
const PROJECT_ID = /^[a-z0-9]{6,20}$/i

/** The project id from the build, or null when Clarity is off. */
export function clarityProjectId(
  raw: string | undefined = process.env.NEXT_PUBLIC_CLARITY_ID
): string | null {
  const id = raw?.trim()
  return id && PROJECT_ID.test(id) ? id : null
}

/** The id of the script tag that loads Clarity, so it is added once. */
export const CLARITY_SCRIPT_ID = 'ms-clarity-js'

export function clarityScriptUrl(projectId: string): string {
  return `https://www.clarity.ms/tag/${projectId}`
}

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] }
type ClarityWindow = Window & { clarity?: ClarityFn }

/**
 * Puts Clarity's `clarity` queue on the page (Microsoft's snippet, without
 * its script tag: loadClarityScript adds that once the page is idle), so
 * calls made before the script arrives wait. Returns false when it was
 * already there.
 */
export function installClarity(
  win: ClarityWindow = window as ClarityWindow
): boolean {
  const fresh = !win.clarity
  if (fresh) {
    const clarity: ClarityFn = function (...args: unknown[]) {
      ;(clarity.q = clarity.q || []).push(args)
    }
    win.clarity = clarity
  }
  // Consent given (the banner's Allow), again after a withdrawal: analytics
  // storage only. Clarity's ad storage stays denied; we use it for nothing
  // but our own site.
  win.clarity!('consentv2', {
    ad_Storage: 'denied',
    analytics_Storage: 'granted',
  })
  return fresh
}

/** Adds Clarity's script tag, once. */
export function loadClarityScript(projectId: string, doc: Document = document) {
  if (doc.getElementById(CLARITY_SCRIPT_ID)) return
  const script = doc.createElement('script')
  script.id = CLARITY_SCRIPT_ID
  script.async = true
  script.src = clarityScriptUrl(projectId)
  doc.head.appendChild(script)
}

/**
 * The customer changed their answer to Only essential mid-visit: Clarity
 * stops recording and clears its cookies (its own API for a withdrawn
 * consent). Nothing if it was never loaded.
 */
export function withdrawClarity(win: ClarityWindow = window as ClarityWindow) {
  try {
    win.clarity?.('consent', false)
  } catch {
    // Never let a measurement break the page.
  }
}

/**
 * Pauses recording on a page Clarity stays off (its address holds a code or
 * a booking's id) and resumes it after. Clarity's own pause/resume calls.
 */
export function pauseClarity(
  paused: boolean,
  win: ClarityWindow = window as ClarityWindow
) {
  try {
    win.clarity?.(paused ? 'pause' : 'resume')
  } catch {
    // Never let a measurement break the page.
  }
}

/**
 * The calls one of our events makes: the step as a tag (filter recordings
 * by "step") and as an event, and on the visit's first event the channel it
 * came from. Event names and the channel only: never another prop.
 */
export function clarityCallsFor(event: TrackedEvent): unknown[][] {
  const calls: unknown[][] = [
    ['set', 'step', event.name],
    ['event', event.name],
  ]
  const channel = event.props?.channel
  if (event.name === 'app_open' && typeof channel === 'string') {
    calls.push(['set', 'channel', channel])
  }
  return calls
}

/** The listener components/analytics.tsx gives `onTrack`. Never throws. */
export function mirrorToClarity(event: TrackedEvent) {
  try {
    if (typeof window === 'undefined') return
    const clarity = (window as ClarityWindow).clarity
    // Only once Clarity is on the page, which needs consent; checked again
    // here in case the answer changed since.
    if (!clarity || !analyticsAllowed() || currentPageExcluded()) return
    for (const call of clarityCallsFor(event)) clarity(...call)
  } catch {
    // Never let a measurement break the page.
  }
}
