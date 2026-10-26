/**
 * Send to team (0059): one collection list per teammate, of everything the
 * ticked garages still miss. The panel's own words for it: who is suggested
 * to collect, the summary counts, due dates, and the plain-text list a
 * teammate gets on WhatsApp. (The Telegram post is built on the server.)
 */
import type {
  AdminLogin,
  AdminVendor,
  AdminVendorCollection,
} from '@repo/core/api/admin'
import type {
  CollectionGarageBrief,
  CollectionItem,
  CollectionList,
} from '@repo/core/api/admin-collection'
import { googleMapsLink } from '@repo/core/contact-links'
import {
  collectionItemDone,
  isMissingKey,
  MISSING_KEYS,
  MISSING_TABS,
  type MissingKey,
} from '@repo/core/onboarding-marks'
import { normaliseIndianMobile } from '@repo/core/phone'

const DAY_MS = 24 * 60 * 60 * 1000
const IST_MS = 5.5 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
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

/** "2 garages", "1 thing". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

// ─── Names and collectors ────────────────────────────────────────────────────

/** Names compared the way people type them: case and spacing aside. */
export function sameName(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const norm = (s: string | null | undefined) =>
    (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return norm(a) !== '' && norm(a) === norm(b)
}

/** The logins a list can go to: turned on. */
export function collectorLogins(
  logins: readonly AdminLogin[] | undefined
): AdminLogin[] {
  return (logins ?? []).filter((login) => login.status === 'active')
}

/**
 * Who is suggested to collect for a garage: the login whose name is its
 * "Onboarded by", or null (unassigned) when that is not set or is nobody
 * with a login.
 */
export function suggestedLogin(
  vendor: Pick<AdminVendor, 'onboardedByName'>,
  logins: readonly AdminLogin[]
): AdminLogin | null {
  if (!vendor.onboardedByName) return null
  return (
    logins.find((login) => sameName(login.name, vendor.onboardedByName)) ?? null
  )
}

export const UNASSIGNED = 'unassigned'

export interface CollectorGroup<V> {
  /** The suggested login's id, or UNASSIGNED. */
  key: string
  loginId: string | null
  vendors: V[]
}

/**
 * The ticked garages, one group per suggested collector, in the order the
 * garages came; the unassigned ones last.
 */
export function groupByOnboarder<
  V extends Pick<AdminVendor, 'onboardedByName'>,
>(vendors: readonly V[], logins: readonly AdminLogin[]): CollectorGroup<V>[] {
  const groups = new Map<string, CollectorGroup<V>>()
  const unassigned: V[] = []
  for (const vendor of vendors) {
    const login = suggestedLogin(vendor, logins)
    if (!login) {
      unassigned.push(vendor)
      continue
    }
    const group = groups.get(login.id)
    if (group) group.vendors.push(vendor)
    else
      groups.set(login.id, {
        key: login.id,
        loginId: login.id,
        vendors: [vendor],
      })
  }
  const out = [...groups.values()]
  if (unassigned.length > 0) {
    out.push({ key: UNASSIGNED, loginId: null, vendors: unassigned })
  }
  return out
}

// ─── What to collect ─────────────────────────────────────────────────────────

/** A garage's missing keys, each once, in MISSING_KEYS order. */
export function collectKinds(
  vendor: Pick<AdminVendor, 'missing'>
): MissingKey[] {
  const have = new Set((vendor.missing ?? []).filter(isMissingKey))
  return MISSING_KEYS.filter((key) => have.has(key))
}

/** "4 garages · 11 things to collect" (garages with nothing left are not counted). */
export function sendSummary(
  garages: ReadonlyArray<{ kinds: readonly unknown[] }>
): {
  garages: number
  things: number
  line: string
} {
  const withSome = garages.filter((g) => g.kinds.length > 0)
  const things = withSome.reduce((sum, g) => sum + g.kinds.length, 0)
  return {
    garages: withSome.length,
    things,
    line: `${plural(withSome.length, 'garage')} · ${plural(things, 'thing')} to collect`,
  }
}

/** The sheet's main button: "Send to Raga", or "Send 2 lists". */
export function sendButtonLabel(names: readonly string[]): string {
  if (names.length === 1) {
    const name = names[0]?.trim()
    return name ? `Send to ${name}` : 'Send'
  }
  return `Send ${names.length} lists`
}

/**
 * The Send to team subtitle, true to what the sheet shows: "3 lists, split
 * by who onboarded each garage", "One list for Raga", or, before anyone is
 * picked, "One list of everything these garages are missing".
 */
export function sendSubtitle(
  lists: ReadonlyArray<{ name: string | null }>
): string {
  if (lists.length > 1) {
    return `${plural(lists.length, 'list')}, split by who onboarded each garage`
  }
  const name = lists[0]?.name?.trim()
  return name
    ? `One list for ${name}`
    : 'One list of everything these garages are missing'
}

/**
 * How many garages each login already has on their open lists, for "has 2
 * garages" next to them in the collector picker. Keyed by login id.
 */
export function openGaragesByLogin(
  lists: readonly CollectionList[]
): Map<string, number> {
  const out = new Map<string, number>()
  for (const card of collectorCards(lists)) {
    if (!card.key.startsWith('name:')) out.set(card.key, card.garages)
  }
  return out
}

/** The garage's area for a list ("Adyar"), else its city; '' with neither. */
export function garageBriefArea(
  garage: Pick<CollectionGarageBrief, 'city'> & { area?: string | null }
): string {
  return garage.area?.trim() || garage.city?.trim() || ''
}

/** The Garages "Marks" cell: "With Raga · due 29 Oct · 3/11". */
export function withTeamLine(c: AdminVendorCollection): string {
  const due = c.dueOn ? ` · due ${shortDate(c.dueOn)}` : ''
  return `With ${c.assigneeName}${due} · ${c.done}/${c.total}`
}

// ─── Phones and maps ─────────────────────────────────────────────────────────

/** A teammate's phone, as saved: the 10 digits of an Indian mobile. */
export function teammatePhone(raw: string): string {
  return normaliseIndianMobile(raw.trim())
}

/** Why a teammate's phone can't be saved, or null. Empty is fine (optional). */
export function teammatePhoneProblem(raw: string): string | null {
  if (!raw.trim()) return null
  return /^[6-9]\d{9}$/.test(teammatePhone(raw))
    ? null
    : 'A 10-digit mobile number, starting 6 to 9'
}

/** "98400 11203" for reading; anything else as it came. */
export function displayPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = normaliseIndianMobile(phone)
  return /^\d{10}$/.test(digits)
    ? `${digits.slice(0, 5)} ${digits.slice(5)}`
    : phone
}

/**
 * The garage's map: its own Google Maps link when that is one, else a
 * search for its pin; null with neither.
 */
export function vendorMapsUrl(v: {
  lat: number | null
  lng: number | null
  mapsUrl?: string | null
}): string | null {
  const own = googleMapsLink(v.mapsUrl)
  if (own) return own
  if (v.lat === null || v.lng === null) return null
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return null
  return `https://www.google.com/maps/search/?api=1&query=${v.lat.toFixed(6)},${v.lng.toFixed(6)}`
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/** A YYYY-MM-DD as a UTC-noon Date, or null. */
function calendarDate(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const date = new Date(`${day}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** India's calendar day for a moment, as YYYY-MM-DD. */
export function istToday(now: number = Date.now()): string {
  return new Date(now + IST_MS).toISOString().slice(0, 10)
}

/** "29 Oct". */
export function shortDate(day: string): string {
  const date = calendarDate(day)
  if (!date) return day
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/** "Thu 29 Oct", with the year only when it isn't this one. */
export function dueDate(day: string, now: number = Date.now()): string {
  const date = calendarDate(day)
  if (!date) return day
  const text = `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
  return date.getUTCFullYear() === Number(istToday(now).slice(0, 4))
    ? text
    : `${text} ${date.getUTCFullYear()}`
}

/** Whole days from today (India) to the due day: 0 today, -1 a day late. */
export function daysUntil(
  day: string,
  now: number = Date.now()
): number | null {
  const date = calendarDate(day)
  const today = calendarDate(istToday(now))
  if (!date || !today) return null
  return Math.round((date.getTime() - today.getTime()) / DAY_MS)
}

/** The due chip: "3 days left", "Due today", "2 days late". */
export function dueChip(
  day: string | null,
  now: number = Date.now()
): { text: string; tone: 'late' | 'attention' | 'neutral' } | null {
  if (!day) return null
  const days = daysUntil(day, now)
  if (days === null) return null
  if (days < 0) return { text: `${plural(-days, 'day')} late`, tone: 'late' }
  if (days === 0) return { text: 'Due today', tone: 'attention' }
  if (days === 1) return { text: 'Due tomorrow', tone: 'attention' }
  return { text: `${plural(days, 'day')} left`, tone: 'neutral' }
}

// ─── Lists ───────────────────────────────────────────────────────────────────

/** 0–100. */
export function progressPercent(p: { done: number; total: number }): number {
  return p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
}

export type ItemState = 'cleared' | 'collected' | 'to_collect'

/** Cleared (saved on the garage) wins over collected. */
export function itemState(
  item: Pick<CollectionItem, 'status' | 'cleared'>
): ItemState {
  if (item.cleared) return 'cleared'
  return item.status === 'collected' ? 'collected' : 'to_collect'
}

/** Where a collected thing is saved: the editor tab for its kind, or null for a custom one. */
export function saveToGarageHref(
  item: Pick<CollectionItem, 'vendorId' | 'kind'>
): string | null {
  if (!isMissingKey(item.kind)) return null
  return `/vendors/${item.vendorId}/edit?tab=${MISSING_TABS[item.kind]}`
}

/** A list's items for one garage, in the list's order. */
export function itemsOf(
  list: Pick<CollectionList, 'items'>,
  vendorId: string
): CollectionItem[] {
  return list.items.filter((item) => item.vendorId === vendorId)
}

/** "2/3" for one garage. */
export function garageProgress(items: readonly CollectionItem[]): {
  done: number
  total: number
} {
  return { done: items.filter(collectionItemDone).length, total: items.length }
}

/** The admin link to one list, as the Telegram post has it. */
export function listHref(listId: string, origin = ''): string {
  return `${origin}/today?list=${encodeURIComponent(listId)}`
}

/**
 * The list as plain text, for WhatsApp to the teammate: the same shape as
 * the Telegram post. Done items are left out; a garage with nothing left
 * too.
 */
export function listText(
  list: Pick<
    CollectionList,
    | 'id'
    | 'assigneeName'
    | 'createdByName'
    | 'dueOn'
    | 'note'
    | 'garages'
    | 'items'
  >,
  origin: string,
  now: number = Date.now()
): string {
  const lines: string[] = [`Collection list for ${list.assigneeName}`]
  lines.push(
    list.dueOn
      ? `From ${list.createdByName} · by ${dueDate(list.dueOn, now)}`
      : `From ${list.createdByName}`
  )
  if (list.note?.trim()) lines.push(`Note: ${list.note.trim()}`)
  const garages = list.garages
    .map((garage) => ({
      garage,
      items: itemsOf(list, garage.id).filter((i) => !collectionItemDone(i)),
    }))
    .filter((g) => g.items.length > 0)
  const things = garages.reduce((sum, g) => sum + g.items.length, 0)
  lines.push(
    `${plural(garages.length, 'garage')} · ${plural(things, 'thing')} to collect`
  )
  garages.forEach(({ garage, items }, index) => {
    lines.push('')
    lines.push(
      `${index + 1}. ${garage.businessName}${garageBriefArea(garage) ? `, ${garageBriefArea(garage)}` : ''}`
    )
    const who = [garage.ownerName, displayPhone(garage.ownerPhone)]
      .filter(Boolean)
      .join(' · ')
    if (who) lines.push(who)
    if (garage.mapsUrl) lines.push(`Map: ${garage.mapsUrl}`)
    for (const item of items) lines.push(`☐ ${item.label}`)
  })
  lines.push('')
  lines.push(`Open the list in admin: ${listHref(list.id, origin)}`)
  return lines.join('\n')
}

export interface CollectorCard {
  /** The login's id, or the typed name. */
  key: string
  name: string
  garages: number
  done: number
  total: number
  /** The earliest due day of their open lists. */
  dueOn: string | null
  /** The list "Open list" goes to: the one due first. */
  listId: string
  lists: number
}

/**
 * The Garages page's cards: one per person with open lists, their garages
 * and progress summed; the one due soonest first.
 */
export function collectorCards(
  lists: readonly CollectionList[]
): CollectorCard[] {
  const byPerson = new Map<
    string,
    { card: CollectorCard; vendors: Set<string> }
  >()
  for (const list of lists) {
    if (!list.open) continue
    const key = personKey(list)
    let entry = byPerson.get(key)
    if (!entry) {
      entry = {
        card: {
          key,
          name: list.assigneeName,
          garages: 0,
          done: 0,
          total: 0,
          dueOn: list.dueOn,
          listId: list.id,
          lists: 0,
        },
        vendors: new Set(),
      }
      byPerson.set(key, entry)
    } else if (
      list.dueOn &&
      (!entry.card.dueOn || list.dueOn < entry.card.dueOn)
    ) {
      entry.card.dueOn = list.dueOn
      entry.card.listId = list.id
    }
    entry.card.lists += 1
    entry.card.done += list.progress.done
    entry.card.total += list.progress.total
    for (const garage of list.garages) entry.vendors.add(garage.id)
  }
  return [...byPerson.values()]
    .map(({ card, vendors }) => ({ ...card, garages: vendors.size }))
    .sort((a, b) => {
      if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn)
      if (a.dueOn) return -1
      if (b.dueOn) return 1
      return a.name.localeCompare(b.name)
    })
}

/** The person a list is for, as collectorCards keys them. */
function personKey(
  list: Pick<CollectionList, 'assigneeLoginId' | 'assigneeName'>
): string {
  return (
    list.assigneeLoginId ?? `name:${list.assigneeName.trim().toLowerCase()}`
  )
}

/**
 * Where and when a list went: "Sent 26 Oct to Telegram and Raga’s Today".
 * "Telegram" only when it was posted there, the Today inbox only for a
 * login (a typed name has none).
 */
export function sentLine(
  list: Pick<
    CollectionList,
    'createdAt' | 'telegramSentAt' | 'assigneeLoginId' | 'assigneeName'
  >
): string {
  const time = Date.parse(list.createdAt)
  const day = Number.isNaN(time) ? '' : ` ${shortDate(istToday(time))}`
  const to = [
    list.telegramSentAt ? 'Telegram' : null,
    list.assigneeLoginId ? `${list.assigneeName.trim()}’s Today` : null,
  ].filter(Boolean)
  return `Sent${day}${to.length > 0 ? ` to ${to.join(' and ')}` : ''}`
}

/**
 * The With team cards' "Sent … to …" line, one per collectorCards key: from
 * that person's newest open list.
 */
export function collectorSentLines(
  lists: readonly CollectionList[]
): Map<string, string> {
  const newest = new Map<string, CollectionList>()
  for (const list of lists) {
    if (!list.open) continue
    const key = personKey(list)
    const seen = newest.get(key)
    if (!seen || Date.parse(list.createdAt) > Date.parse(seen.createdAt)) {
      newest.set(key, list)
    }
  }
  return new Map([...newest].map(([key, list]) => [key, sentLine(list)]))
}
