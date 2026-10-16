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

export const EDIT_TAB_LABELS: Record<EditTab, string> = {
  details: 'Details',
  location: 'Location',
  operations: 'Operations',
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

// ─── Unsaved changes ─────────────────────────────────────────────────────────

/** Each tab's values in a form that compares: what the page loaded, or holds now. */
export type TabValues = Record<EditTab, unknown>

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
 * The tabs whose values differ from what was loaded (or last saved), in tab
 * order. Undefined and a missing key read the same, as JSON drops both.
 */
export function dirtyTabs(saved: TabValues, current: TabValues): EditTab[] {
  return EDIT_TABS.filter((tab) => stableJson(saved[tab]) !== stableJson(current[tab]))
}

/** "a", "a and b", "a, b and c". */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The save bar's line: "Unsaved changes in Operations and Services". */
export function unsavedChangesLine(tabs: readonly EditTab[]): string {
  if (tabs.length === 0) return 'No unsaved changes'
  return `Unsaved changes in ${joinAnd(tabs.map((tab) => EDIT_TAB_LABELS[tab]))}`
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
