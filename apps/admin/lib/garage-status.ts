/**
 * The garage editor's status panel: whether customers can book the garage,
 * what stands in the way, and which tab fixes each thing. Read from the
 * server's checklist (`detail.readiness`, lib/vendor-readiness.ts), never
 * worked out again here. Pure, so it is tested in garage-status.test.ts.
 *
 * An API from before 0059 sends no readiness: then there are no lines and no
 * dots, and the panel says "Status unavailable" instead of "Nothing missing".
 */
import type { AdminVendorDetail, ReadinessItem } from '@repo/core/api/admin'
import type { GarageTab, MissingKey } from '@repo/core/onboarding-marks'

export type StatusTone = 'blocking' | 'fix' | 'optional' | 'done'

export interface StatusLine {
  key: string
  tone: StatusTone
  /** "No map pin". */
  label: string
  /** "Customers can't find it on the map". */
  detail?: string
  /** The tab a tap on the line opens. */
  tab: GarageTab
}

const TONE_ORDER: Record<StatusTone, number> = {
  blocking: 0,
  fix: 1,
  optional: 2,
  done: 3,
}

/**
 * The checklist's lines, blocking first, then to fix, then optional. A
 * garage with nothing on its checklist gets one line saying so.
 */
export function statusLines(readiness?: ReadinessItem[]): StatusLine[] {
  if (!readiness) return []
  if (readiness.length === 0) {
    return [
      {
        key: 'nothing_missing',
        tone: 'done',
        label: 'Nothing missing',
        tab: 'details',
      },
    ]
  }
  return readiness
    .map((item) => ({
      key: item.key,
      tone: item.severity as StatusTone,
      label: item.label,
      ...(item.detail ? { detail: item.detail } : {}),
      tab: item.tab as GarageTab,
    }))
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
}

/**
 * The dot on each tab: red where something blocks booking, amber where
 * something should be fixed soon. Optional items leave no dot.
 */
export function tabDots(
  readiness?: ReadinessItem[]
): Partial<Record<GarageTab, 'red' | 'amber'>> {
  const dots: Partial<Record<GarageTab, 'red' | 'amber'>> = {}
  for (const item of readiness ?? []) {
    const tab = item.tab as GarageTab
    if (item.severity === 'blocking') dots[tab] = 'red'
    else if (item.severity === 'fix' && dots[tab] !== 'red') dots[tab] = 'amber'
  }
  return dots
}

export const STAGE_LABELS: Record<string, string> = {
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
}

export interface GoLiveState {
  /** As saved: an unsaved Active is not live yet. */
  status: string
  isVerified: boolean
  paused: boolean
  inBin: boolean
}

export interface StatusHeadline {
  /** Customers can find it and book it now. */
  live: boolean
  title: string
  /** "2 things block it · 1 to fix soon · Pending · not shown to customers". */
  summary: string
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/**
 * The panel's first card. Live is what the garage list calls Live: Active,
 * shown to customers, not paused, not in the Bin, and nothing blocking on its
 * checklist.
 */
export function statusHeadline(
  state: GoLiveState,
  readiness?: ReadinessItem[]
): StatusHeadline {
  const blocking =
    readiness?.filter((item) => item.severity === 'blocking').length ?? 0
  const fix = readiness?.filter((item) => item.severity === 'fix').length ?? 0
  const notActive = state.status !== 'active'
  const parts: string[] = []
  if (blocking > 0)
    parts.push(`${plural(blocking, 'thing blocks', 'things block')} it`)
  if (fix > 0) parts.push(`${fix} to fix soon`)
  if (notActive) parts.push(STAGE_LABELS[state.status] ?? state.status)
  if (!state.isVerified) parts.push('not shown to customers')

  if (state.inBin) {
    return {
      live: false,
      title: 'In the Bin',
      summary: 'Customers and its team can’t see it',
    }
  }
  if (blocking > 0 || notActive || !state.isVerified) {
    return {
      live: false,
      title: 'Customers can’t book it yet',
      summary: parts.join(' · '),
    }
  }
  if (state.paused) {
    return {
      live: false,
      title: 'Bookings paused',
      summary: ['Hidden from customers until resumed', ...parts].join(' · '),
    }
  }
  return {
    live: true,
    title: 'Live',
    summary:
      parts.length > 0 ? parts.join(' · ') : 'Customers can find and book it',
  }
}

/**
 * What the status panel, the marks panel and the tab dots read: the
 * server's checklist and what the garage still owes us. Both absent from an
 * older API.
 */
export interface EditorChecklist {
  readiness?: ReadinessItem[]
  missing?: MissingKey[]
}

/**
 * The checklist from a fresh read of the garage, after something saved on
 * its own (a photo, the pin, Pause, a service hidden). Only these two are
 * taken from it: the draft, and the saved copy it is compared with, are
 * never touched, so unsaved edits survive. The same object comes back when
 * nothing changed, so nothing re-renders for it.
 */
export function mergeChecklist(
  prev: EditorChecklist,
  fresh: Pick<AdminVendorDetail, 'readiness' | 'missing'>
): EditorChecklist {
  const next: EditorChecklist = {
    readiness: fresh.readiness,
    missing: fresh.missing,
  }
  return JSON.stringify(next) === JSON.stringify(prev) ? prev : next
}

/**
 * An Indian mobile number as people say it: "9840002102" → "98400 02102".
 * A +91 is dropped; anything that is not a mobile number after that (a
 * landline, a typo) is shown as stored.
 */
export function displayPhone(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim()
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (!/^[6-9]\d{9}$/.test(digits)) return raw
  return `${digits.slice(0, 5)} ${digits.slice(5)}`
}
