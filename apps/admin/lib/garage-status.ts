/**
 * The garage editor's status panel: whether customers can book the garage,
 * what stands in the way, and which tab fixes each thing. Read from the
 * server's checklist (`detail.readiness`, lib/vendor-readiness.ts), never
 * worked out again here. Pure, so it is tested in garage-status.test.ts.
 *
 * An API from before 0059 sends no readiness: then there are no lines and no
 * dots, and the panel says "Status unavailable" instead of "Nothing missing".
 */
import type { ReadinessItem } from '@repo/core/api/admin'
import type { GarageTab } from '@repo/core/onboarding-marks'

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
  /** "2 things block it · 1 to fix soon · Pending · not verified". */
  summary: string
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/**
 * The panel's first card. Live is what the garage list calls Live: Active,
 * verified, not paused, not in the Bin, and nothing blocking on its
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
  if (!state.isVerified) parts.push('not verified')

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
