/**
 * The target counter above the Garages table (0064, mockup garages-list A):
 * live garages against the team's target, with the part "almost ready";
 * garages added this week against last week; those not live yet, and how
 * many only need photos or a logo; and live garages by area. Worked out
 * here from the list the page already holds (GET /admin/vendors is the
 * whole set). Pure.
 */
import type { AdminVendor } from '@repo/core/api/admin'
import type { GarageTarget } from '@repo/core/garage-target'
import { garageArea, isInBin, isLive, isNotLiveYet } from './vendor-list'

type Garage = Pick<
  AdminVendor,
  | 'live'
  | 'status'
  | 'isVerified'
  | 'bookingsPausedAt'
  | 'deletedAt'
  | 'createdAt'
  | 'readiness'
  | 'missing'
  | 'city'
  | 'lat'
  | 'lng'
  | 'outsideServiceCity'
>

/** Nothing that blocks or needs fixing: only optional items, or none. */
function onlyOptionalLeft(v: Pick<AdminVendor, 'readiness'>): boolean {
  return (v.readiness ?? []).every((item) => item.severity === 'optional')
}

/** In the count when the target counts every garage onboarded: not binned or archived. */
export function isOnboarded(v: Garage): boolean {
  return !isInBin(v) && v.status !== 'archived'
}

/**
 * Not live yet, with nothing left but optional things (a logo, photos…):
 * the amber part of the bar.
 */
export function isAlmostReady(v: Garage): boolean {
  return isNotLiveYet(v) && v.readiness !== undefined && onlyOptionalLeft(v)
}

/** Not live yet, and all it misses is its photos, its logo or both. */
export function onlyNeedsPhotosOrLogo(v: Garage): boolean {
  if (!isNotLiveYet(v) || !onlyOptionalLeft(v)) return false
  const missing = v.missing ?? []
  return (
    missing.length > 0 &&
    missing.every((key) => key === 'photos' || key === 'logo')
  )
}

export interface TargetFigures {
  /** Live garages, or every one onboarded, as the target says. */
  count: number
  target: number
  /** Almost ready, counted only towards live garages. */
  almostReady: number
  /** Whole percent of the target reached, 0–100. */
  percent: number
  /** Of the bar, 0–100: what is done, and the amber part after it. */
  doneWidth: number
  almostWidth: number
  toGo: number
}

export function targetFigures(
  vendors: readonly Garage[],
  target: GarageTarget
): TargetFigures {
  const live = target.counts === 'live'
  const count = vendors.filter((v) =>
    live ? !isInBin(v) && isLive(v) : isOnboarded(v)
  ).length
  const almostReady = live ? vendors.filter(isAlmostReady).length : 0
  const of = Math.max(1, target.target)
  const doneWidth = Math.min(100, (count / of) * 100)
  return {
    count,
    target: target.target,
    almostReady,
    percent: Math.min(100, Math.floor((count / of) * 100)),
    doneWidth,
    almostWidth: Math.min(100 - doneWidth, (almostReady / of) * 100),
    toGo: Math.max(0, target.target - count),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000
const IST_MS = 5.5 * 60 * 60 * 1000

/** The instant this IST week began: Monday, 00:00 in Chennai. */
export function istWeekStart(now: number): number {
  const ist = new Date(now + IST_MS)
  const midnight = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate()
  )
  const sinceMonday = (ist.getUTCDay() + 6) % 7
  return midnight - sinceMonday * DAY_MS - IST_MS
}

/** Garages added this IST week (Monday on), and the week before. The Bin is left out. */
export function addedByWeek(
  vendors: readonly Garage[],
  now: number
): { thisWeek: number; lastWeek: number } {
  const start = istWeekStart(now)
  const before = start - 7 * DAY_MS
  let thisWeek = 0
  let lastWeek = 0
  for (const v of vendors) {
    if (isInBin(v)) continue
    const at = Date.parse(v.createdAt)
    if (Number.isNaN(at)) continue
    if (at >= start && at <= now) thisWeek += 1
    else if (at >= before && at < start) lastWeek += 1
  }
  return { thisWeek, lastWeek }
}

/** "1 more than last week", "2 fewer than last week", "Same as last week". */
export function weekCompareText({
  thisWeek,
  lastWeek,
}: {
  thisWeek: number
  lastWeek: number
}): string {
  const diff = thisWeek - lastWeek
  if (diff === 0) return 'Same as last week'
  return `${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} than last week`
}

/** Garages not live yet, and how many of them only need photos or a logo. */
export function notLiveFigures(vendors: readonly Garage[]): {
  count: number
  onlyPhotosOrLogo: number
} {
  return {
    count: vendors.filter(isNotLiveYet).length,
    onlyPhotosOrLogo: vendors.filter(onlyNeedsPhotosOrLogo).length,
  }
}

/** Live garages by area (the neighbourhood their pin is near), most first. */
export function liveByArea(
  vendors: readonly Garage[],
  top = 4
): Array<{ area: string; count: number }> {
  const counts = new Map<string, number>()
  for (const v of vendors) {
    if (isInBin(v) || !isLive(v)) continue
    const area = garageArea(v)
    counts.set(area, (counts.get(area) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
    .slice(0, top)
}

/** "28% there · 9 almost ready · 36 to go by 31 Dec". */
export function targetLine(
  figures: TargetFigures,
  endsOn: string | null,
  now: number = Date.now()
): string {
  const parts = [`${figures.percent}% there`]
  if (figures.almostReady > 0) parts.push(`${figures.almostReady} almost ready`)
  if (figures.toGo === 0) parts.push('target reached')
  else
    parts.push(
      `${figures.toGo} to go${endsOn ? ` by ${dayText(endsOn, now)}` : ''}`
    )
  return parts.join(' · ')
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** "31 Dec", with the year when it is not this one ("31 Mar 2027"). */
export function dayText(day: string, now: number = Date.now()): string {
  const at = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(at.getTime())) return day
  const thisYear = new Date(now + IST_MS).getUTCFullYear()
  const year = at.getUTCFullYear()
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}${year === thisYear ? '' : ` ${year}`}`
}
