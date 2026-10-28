/**
 * The garage edit page's rules that are not about one service row: which tab
 * a link may open, where the back arrow may go, which tabs hold unsaved
 * changes and why Save is off, and how a garage takes bookings in words.
 * Pure, so they are tested here (garage-edit.test.ts) rather than in a page.
 */

// ─── Tabs and links ──────────────────────────────────────────────────────────

/** The edit page's tabs, in order. The E2E specs click them by these names. */
export const EDIT_TABS = ['details', 'location', 'operations', 'services'] as const
export type EditTab = (typeof EDIT_TABS)[number]

/**
 * What each tab is called. `operations` keeps its `?tab=` value from when the
 * tab was called Operations, so old links still open it.
 */
export const EDIT_TAB_LABELS: Record<EditTab, string> = {
  details: 'Details',
  location: 'Location',
  operations: 'Hours & booking',
  services: 'Services',
}

/**
 * The tab a `?tab=` asks for, or Details. An allow-list, so a hand-edited
 * link can only ever open one of the four.
 */
export function parseEditTab(value: string | string[] | null | undefined): EditTab {
  return typeof value === 'string' && (EDIT_TABS as readonly string[]).includes(value)
    ? (value as EditTab)
    : 'details'
}

/**
 * Every tab the page has: the four "Save changes" covers, then Team & payout
 * (the garage's people and where Detlio pays it; payout is MISSING_TABS'
 * `team`), then Documents (garage documents, 0043), shown only while
 * documents are on, and Tier (Bronze / Silver / Gold, 0063, with Gold's
 * checks and Award Gold, which was Detlio Certified, 0048), always shown.
 * The last three save each action on their own. The checklist's "Documents
 * not checked" links to Documents; Telegram's Gold alerts and the list's
 * tier line to Tier. The `?tab=` value stays `certification` so saved and
 * alerted links keep working.
 */
export const PAGE_TABS = [...EDIT_TABS, 'team', 'documents', 'certification'] as const
export type PageTab = (typeof PAGE_TABS)[number]

export const PAGE_TAB_LABELS: Record<PageTab, string> = {
  ...EDIT_TAB_LABELS,
  team: 'Team & payout',
  documents: 'Documents',
  certification: 'Tier',
}

/**
 * The tab a `?tab=` asks for, Documents included while documents are on, or
 * Details. An allow-list, like parseEditTab.
 */
export function parsePageTab(value: string | string[] | null | undefined, documentsOn = true): PageTab {
  if (value === 'documents') return documentsOn ? 'documents' : 'details'
  if (value === 'certification') return 'certification'
  if (value === 'team') return 'team'
  return parseEditTab(value)
}

/** Whether a tab is one "Save changes" covers. */
export function isEditTab(tab: PageTab): tab is EditTab {
  return (EDIT_TABS as readonly string[]).includes(tab)
}

/**
 * Where the header's back arrow goes: the `?back=` a link brought along (the
 * garage list with its filters, say), when it is one of the panel's own
 * garage-list paths, or else the list itself. Anything that could leave the
 * panel — another host, `//host`, a backslash, which browsers read as a slash
 * — is ignored rather than followed.
 */
export function safeBackHref(value: string | string[] | null | undefined): string {
  const fallback = '/vendors'
  if (typeof value !== 'string') return fallback
  if (!/^\/vendors(?=$|[/?#])/.test(value)) return fallback
  if (/[\\\s]/.test(value) || value.startsWith('//')) return fallback
  return value
}

/**
 * The garage's page on the customer site, for the editor's "View as
 * customer". NEXT_PUBLIC_CARD_PHOTOS_URL is the customer site's address
 * (https://detlio.com; the users app in development).
 */
export function customerGarageUrl(
  vendorId: string,
  site: string = process.env.NEXT_PUBLIC_CARD_PHOTOS_URL ?? 'https://detlio.com'
): string {
  return `${site.replace(/\/$/, '')}/garage/${encodeURIComponent(vendorId)}`
}

// ─── Unsaved changes ─────────────────────────────────────────────────────────

/**
 * What "Save changes" covers: the four form tabs, and Go live (the stage and
 * the Verified switch), which sits in the status panel beside the tabs rather
 * than on one of them.
 */
export const DRAFT_SECTIONS = [...EDIT_TABS, 'golive'] as const
export type DraftSection = (typeof DRAFT_SECTIONS)[number]

/**
 * Each section's values in a form that compares: what the page loaded, or
 * holds now. Go live is optional, so a page without it compares the same.
 */
export type TabValues = Record<EditTab, unknown> & { golive?: unknown }

/** JSON with object keys sorted, so two equal values always print the same. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
        )
      : v
  )
}

/**
 * The sections whose values differ from what was loaded (or last saved), in
 * tab order, Go live last. Undefined and a missing key read the same, as
 * JSON drops both.
 */
export function dirtyTabs(saved: TabValues, current: TabValues): DraftSection[] {
  return DRAFT_SECTIONS.filter((tab) => stableJson(saved[tab]) !== stableJson(current[tab]))
}

/**
 * The save bar's words for each field, by section and by the key tabValues
 * gives it. Lower case: they follow "2 unsaved changes ·". The pin is two
 * keys and one field.
 */
export const FIELD_LABELS: Record<DraftSection, Record<string, string>> = {
  details: {
    ownerName: 'owner name',
    ownerPhone: 'owner phone',
    businessName: 'business name',
    phone: 'business phone',
    whatsapp: 'WhatsApp',
    email: 'email',
    yearsInOperation: 'years in operation',
    onboardedByName: 'onboarded by',
    notes: 'notes',
  },
  location: {
    address: 'address',
    city: 'city',
    pincode: 'pincode',
    mapsUrl: 'Maps link',
    lat: 'map pin',
    lng: 'map pin',
  },
  operations: {
    hours: 'hours',
    slotIntervalMins: 'slot interval',
    bays: 'bays',
    jobsPerDay: 'jobs per day',
    vehicleTypes: 'car types',
  },
  services: {},
  golive: { status: 'stage', isVerified: 'verified' },
}

/** A section that is one value, not fields (the services list). */
const SECTION_AS_ONE: Record<DraftSection, string> = {
  details: 'details',
  location: 'location',
  operations: 'hours & booking',
  services: 'services',
  golive: 'go live',
}

export interface DirtyField {
  tab: DraftSection
  label: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * Each changed field, in tab order and in the order the section lists its
 * fields, each label once: what the save bar names. The services list is
 * one change however many rows moved, as the page saves it as one list.
 */
export function dirtyFields(saved: TabValues, current: TabValues): DirtyField[] {
  const fields: DirtyField[] = []
  for (const tab of DRAFT_SECTIONS) {
    const before = saved[tab]
    const after = current[tab]
    if (stableJson(before) === stableJson(after)) continue
    if (!isRecord(before) || !isRecord(after)) {
      fields.push({ tab, label: SECTION_AS_ONE[tab] })
      continue
    }
    const keys = [...new Set([...Object.keys(after), ...Object.keys(before)])]
    const labels = new Set<string>()
    for (const key of keys) {
      if (stableJson(before[key]) === stableJson(after[key])) continue
      const label = FIELD_LABELS[tab][key] ?? key
      if (labels.has(label)) continue
      labels.add(label)
      fields.push({ tab, label })
    }
  }
  return fields
}

/** The save bar's line: "2 unsaved changes · address, map pin". */
export function saveBarLine(fields: readonly DirtyField[]): string {
  if (fields.length === 0) return 'No unsaved changes'
  const count = `${fields.length} unsaved change${fields.length === 1 ? '' : 's'}`
  return `${count} · ${fields.map((field) => field.label).join(', ')}`
}

/** The garage fields Save needs, as the form holds them (strings). */
export interface GarageRequiredFields {
  ownerName: string
  ownerPhone: string
  businessName: string
  phone: string
  address: string
  city: string
  pincode: string
}

/**
 * Why the garage's own fields keep Save off, naming the tab the field is on
 * — the admin may be on any tab when they reach for Save — or null when they
 * are all fine. The first problem only: one thing to fix at a time.
 */
export function garageFieldsProblem(form: GarageRequiredFields): string | null {
  const checks: Array<[boolean, string]> = [
    [!form.ownerName.trim(), "Add the owner's name (Details)"],
    [!/^\d{10}$/.test(form.ownerPhone.trim()), 'Owner phone must be 10 digits (Details)'],
    [!form.businessName.trim(), 'Add the business name (Details)'],
    [!/^\d{10}$/.test(form.phone.trim()), 'Business phone must be 10 digits (Details)'],
    [!form.address.trim(), 'Add the address (Location)'],
    [!form.city.trim(), 'Add the city (Location)'],
    [!/^\d{6}$/.test(form.pincode.trim()), 'Pincode must be 6 digits (Location)'],
  ]
  return checks.find(([failed]) => failed)?.[1] ?? null
}

// ─── How customers book ──────────────────────────────────────────────────────

export type BookingMode = 'garage' | 'doorstep' | 'both'

export const BOOKING_MODE_OPTIONS: Array<{ value: BookingMode; label: string; hint: string }> = [
  { value: 'garage', label: 'At the garage', hint: 'Customers drive in to the garage.' },
  { value: 'doorstep', label: 'Doorstep', hint: 'The team goes to the customer’s home.' },
  { value: 'both', label: 'Both', hint: 'Customers drive in, or the team goes to their home.' },
]

/** The garage's two switches as one choice; null when both are off. */
export function bookingModeOf(dropinEnabled: boolean, doorstepEnabled: boolean): BookingMode | null {
  if (dropinEnabled && doorstepEnabled) return 'both'
  if (dropinEnabled) return 'garage'
  if (doorstepEnabled) return 'doorstep'
  return null
}

/** The choice as the two switches the API stores. */
export function bookingModeFlags(mode: BookingMode) {
  return {
    dropinEnabled: mode !== 'doorstep',
    doorstepEnabled: mode !== 'garage',
  }
}

/**
 * How far a doorstep garage travels when it has not said. The API reads an
 * empty radius as this only from PR #42 on; before it, an empty radius
 * matches no address at all. The editor's "Empty means 10 km" is the owner's
 * decision and is true only with #42 merged, so this PR merges after it.
 */
export const DEFAULT_DOORSTEP_RADIUS_KM = 10
export const MAX_DOORSTEP_RADIUS_KM = 30

/**
 * What a customer can book, as the card's status line: "At the garage ·
 * Doorstep within 8 km", "Doorstep within 10 km (default)". Null when
 * nothing is switched on.
 *
 * A garage that drew its own doorstep area in the garage app is covered by
 * that area, and the radius is not read at all (bookings.repository.ts), so
 * the line says so rather than quote a distance nobody is held to.
 */
export function bookingReachLine(
  mode: BookingMode | null,
  radiusKm: number | null,
  { drawnArea = false }: { drawnArea?: boolean } = {}
): string | null {
  if (!mode) return null
  const parts: string[] = []
  if (mode !== 'doorstep') parts.push('At the garage')
  if (mode !== 'garage') {
    parts.push(
      drawnArea
        ? 'Doorstep within the area the garage drew'
        : radiusKm == null
          ? `Doorstep within ${DEFAULT_DOORSTEP_RADIUS_KM} km (default)`
          : `Doorstep within ${radiusKm} km`
    )
  }
  return parts.join(' · ')
}

export type RadiusInput = { ok: true; km: number | null } | { ok: false; message: string }

/**
 * The "Travels up to" box: empty is the default, otherwise a distance from 1
 * to 30 km, decimals allowed — exactly what the garage app's onboarding
 * accepts, so a radius the garage set there (7.5 km, say) is never called
 * wrong here.
 */
export function parseRadiusInput(value: string): RadiusInput {
  const trimmed = value.trim()
  if (trimmed === '') return { ok: true, km: null }
  const km = Number(trimmed)
  if (!Number.isFinite(km) || km < 1 || km > MAX_DOORSTEP_RADIUS_KM) {
    return { ok: false, message: `Enter a distance from 1 to ${MAX_DOORSTEP_RADIUS_KM} km, or leave it empty.` }
  }
  return { ok: true, km }
}

/** The radius as the box shows it: "8", "7.5", or empty for the default. */
export const radiusText = (km: number | null): string => (km != null ? String(km) : '')

// ─── Onboarded by ────────────────────────────────────────────────────────────

/** `vendors.onboarded_by_name` is varchar(100). */
export const ONBOARDED_BY_MAX = 100

/** The select's two values that are not a login's name. */
export const ONBOARDED_BY_NOT_SET = ''
export const ONBOARDED_BY_OTHER = '__other__'

/**
 * Which option the "Onboarded by" select shows for a stored name: the login
 * of that name, "Someone else…" for any other text (or while the admin is
 * typing one), or "Not set".
 */
export function onboardedBySelectValue(
  value: string,
  loginNames: readonly string[],
  typingOther: boolean
): string {
  if (typingOther) return ONBOARDED_BY_OTHER
  const name = value.trim()
  if (!name) return ONBOARDED_BY_NOT_SET
  return loginNames.includes(name) ? name : ONBOARDED_BY_OTHER
}

/** The name as saved: trimmed, and null when there is none. */
export function onboardedByInput(value: string): string | null {
  const name = value.trim().slice(0, ONBOARDED_BY_MAX)
  return name ? name : null
}
