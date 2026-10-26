/**
 * The panel's menu: five groups and twelve places instead of fourteen tabs in
 * one row (UX audit, admin mockup 01). Nothing is removed: the three issue
 * pages share one place with tabs (Issues), and the one-off tools moved to
 * Settings. Pure, so the grouping, the feature switches and "which item is
 * lit" are unit-tested without a browser.
 */

/** Places whose count comes from the Today summary (GET /admin/today). */
export type NavCountKey =
  'today' | 'bookings' | 'issues' | 'refunds' | 'garages'

export type NavIconName =
  | 'today'
  | 'bookings'
  | 'issues'
  | 'refunds'
  | 'garages'
  | 'payouts'
  | 'coverage'
  | 'offers'
  | 'rewards'
  | 'gifts'
  | 'statistics'
  | 'settings'

export interface NavItem {
  href: string
  label: string
  icon: NavIconName
  /** Other routes this place stands for, so it stays lit on them too. */
  alsoActiveOn?: string[]
  count?: NavCountKey
  /** Shown only while the API has this feature switched on. */
  feature?: NavFeature
}

export interface NavGroup {
  /** Null for the ungrouped first place (Today) and the bottom one (Settings). */
  label: string | null
  items: NavItem[]
}

/** The switched-off features hide from their group, as they hid from the row. */
export type NavFeature = 'gifts' | 'rewards' | 'guarantee'

export type NavFeatures = Partial<Record<NavFeature, boolean>>

export const TODAY_ITEM: NavItem = {
  href: '/today',
  label: 'Today',
  icon: 'today',
  count: 'today',
}

export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [TODAY_ITEM] },
  {
    label: 'Run the day',
    items: [
      {
        href: '/bookings',
        label: 'Bookings',
        icon: 'bookings',
        count: 'bookings',
      },
      {
        href: '/complaints',
        label: 'Issues',
        icon: 'issues',
        // Complaints · Redo claims · Bypass reports, one place with tabs.
        alsoActiveOn: ['/guarantee', '/bypass-reports'],
        count: 'issues',
      },
      { href: '/refunds', label: 'Refunds', icon: 'refunds', count: 'refunds' },
    ],
  },
  {
    label: 'Garages',
    items: [
      // The word the owner and customers use; the route keeps its old name
      // so every saved link and bookmark still opens.
      { href: '/vendors', label: 'Garages', icon: 'garages', count: 'garages' },
      { href: '/payouts', label: 'Payouts', icon: 'payouts' },
      { href: '/coverage', label: 'Coverage', icon: 'coverage' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { href: '/discounts', label: 'Offers', icon: 'offers' },
      {
        href: '/rewards',
        label: 'Rewards',
        icon: 'rewards',
        feature: 'rewards',
      },
      { href: '/gifts', label: 'Gifts', icon: 'gifts', feature: 'gifts' },
    ],
  },
  {
    label: 'Numbers',
    items: [{ href: '/statistics', label: 'Statistics', icon: 'statistics' }],
  },
]

/** At the bottom of the sidebar: Alerts and Start pilot clean live inside. */
export const SETTINGS_ITEM: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: 'settings',
  alsoActiveOn: ['/alerts', '/data-reset'],
}

/** The phone's bar: four places and More. Every other page is two taps away. */
export const PHONE_TABS: readonly string[] = [
  '/today',
  '/bookings',
  '/complaints',
  '/vendors',
]

function shown(item: NavItem, features: NavFeatures): boolean {
  return !item.feature || features[item.feature] === true
}

/** The groups as they are drawn: switched-off features left out, empty groups dropped. */
export function visibleGroups(features: NavFeatures): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => shown(item, features)),
  })).filter((group) => group.items.length > 0)
}

function matches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

/** Whether a place is the one open now (its own route or one it stands for). */
export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.alsoActiveOn ?? [])].some((route) =>
    matches(pathname, route)
  )
}

/** Every place, in menu order, Settings last. */
export function allItems(features: NavFeatures): NavItem[] {
  return [
    ...visibleGroups(features).flatMap((group) => group.items),
    SETTINGS_ITEM,
  ]
}

/** The place lit for a route, or null (the login door, a page outside the menu). */
export function activeItem(pathname: string): NavItem | null {
  // Every place, switched on or not: a feature page stays lit while the menu
  // is still waiting to hear the switch.
  const everything = [
    ...NAV_GROUPS.flatMap((group) => group.items),
    SETTINGS_ITEM,
  ]
  return everything.find((item) => isActive(item, pathname)) ?? null
}

/** "Run the day › Issues": the group and the place, for the top of the page. */
export function breadcrumb(
  pathname: string
): { group: string | null; page: string } | null {
  if (isActive(SETTINGS_ITEM, pathname))
    return { group: null, page: SETTINGS_ITEM.label }
  for (const group of NAV_GROUPS) {
    const item = group.items.find((candidate) => isActive(candidate, pathname))
    if (item) return { group: group.label, page: item.label }
  }
  return null
}

/** The places the phone's More sheet lists: everything not on the bar. */
export function moreGroups(features: NavFeatures): NavGroup[] {
  const groups = visibleGroups(features)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !PHONE_TABS.includes(item.href)),
    }))
    .filter((group) => group.items.length > 0)
  return [...groups, { label: 'More', items: [SETTINGS_ITEM] }]
}
