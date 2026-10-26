'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconAlertTriangle,
  IconBrandWhatsapp,
  IconBuildingStore,
  IconCalendar,
  IconCalendarEvent,
  IconChartBar,
  IconChevronRight,
  IconDiscount2,
  IconGift,
  IconLogout,
  IconMap,
  IconMenu2,
  IconPhone,
  IconReceiptRefund,
  IconSettings,
  IconStar,
  IconWallet,
} from '@tabler/icons-react'
import {
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_TEL_HREF,
  SUPPORT_WHATSAPP_HREF,
} from '@repo/core/support'
import type { AdminMe } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import { BrandMark } from '@repo/ui/sc/brand-mark'
import { ScSheet } from '@repo/ui/sc/modal'
import { FindAnything } from '@/components/find-anything'
import { isGarageEditor, isWidePage } from '@/lib/admin-table'
import {
  breadcrumb,
  isActive,
  moreGroups,
  PHONE_TABS,
  SETTINGS_ITEM,
  visibleGroups,
  type NavFeatures,
  type NavIconName,
  type NavItem,
} from '@/lib/nav'
import type { NavCount, NavCounts } from '@/lib/today'

const ICONS: Record<NavIconName, typeof IconCalendar> = {
  today: IconCalendarEvent,
  bookings: IconCalendar,
  issues: IconAlertTriangle,
  refunds: IconReceiptRefund,
  garages: IconBuildingStore,
  payouts: IconWallet,
  coverage: IconMap,
  offers: IconDiscount2,
  rewards: IconStar,
  gifts: IconGift,
  statistics: IconChartBar,
  settings: IconSettings,
}

/** What a count means, read out after the place's name. */
const COUNT_WORDS: Record<string, string> = {
  today: 'open',
  bookings: 'waiting for the garage',
  issues: 'to acknowledge or decide',
  refunds: 'owed',
  garages: 'need fixing',
}

/**
 * What a count holds, on hover. The counts leave Test bookings out (as the
 * pilot numbers do), so Bookings can be lower than the list's New chip.
 */
const COUNT_TITLE: Record<string, string> = {
  today: 'Open tasks on Today. Test bookings are left out.',
  bookings:
    'Paid bookings waiting for their garage. Test bookings are left out.',
  issues: 'Complaints, redo claims and bypass reports to act on',
  refunds: 'Refunds owed',
  garages: 'Garages with documents to review or blocked from going live',
}

const COUNT_TONE: Record<NavCount['tone'], string> = {
  late: 'bg-tone-late-tint text-tone-late-text',
  attention: 'bg-tone-attention-tint text-tone-attention-text',
  neutral: 'bg-surface-elevated text-text-secondary',
}

function countFor(
  item: NavItem,
  counts: NavCounts | undefined
): NavCount | null {
  if (!item.count || !counts) return null
  const count = counts[item.count]
  return count && count.n > 0 ? count : null
}

/** The count beside a place: its figure on screen, its meaning for a screen reader. */
function CountPill({ item, count }: { item: NavItem; count: NavCount }) {
  return (
    <span
      title={COUNT_TITLE[item.count ?? '']}
      className={cn(
        'ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 font-numeric text-[12px] font-semibold leading-none',
        COUNT_TONE[count.tone]
      )}
    >
      {count.n}
      <span className="sr-only"> {COUNT_WORDS[item.count ?? ''] ?? ''}</span>
    </span>
  )
}

function SidebarLink({
  item,
  pathname,
  counts,
}: {
  item: NavItem
  pathname: string
  counts: NavCounts | undefined
}) {
  const active = isActive(item, pathname)
  const Icon = ICONS[item.icon]
  const count = countFor(item, counts)
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-[14px] font-medium transition-colors',
        active
          ? 'bg-surface-elevated text-text-primary'
          : 'text-text-secondary hover:bg-surface hover:text-text-primary'
      )}
    >
      {/* The bar's one red: the marker beside the open place. */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-brand-red"
        />
      )}
      <Icon size={18} stroke={1.6} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{item.label}</span>
      {count && <CountPill item={item} count={count} />}
    </Link>
  )
}

/**
 * Who is signed in (personal logins, 0058): an initial, the name every
 * action is signed with, and the login under it.
 */
function SignedInPerson({ me }: { me: AdminMe }) {
  const initial = me.name.trim().charAt(0).toUpperCase() || '?'
  const sub =
    me.kind === 'shared'
      ? 'Shared login'
      : me.username
        ? `@${me.username}`
        : null
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-[13px] font-semibold text-text-primary"
      >
        {initial}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium text-text-primary">
          {me.name}
        </span>
        {sub && (
          <span className="truncate text-[12px] text-text-secondary">
            {sub}
          </span>
        )}
      </span>
    </div>
  )
}

const FOOT_LINK =
  'flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary'

function Sidebar({
  features,
  counts,
  me,
  onLogout,
}: {
  features: NavFeatures
  counts: NavCounts | undefined
  me?: AdminMe
  onLogout?: () => void
}) {
  const pathname = usePathname()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col border-r border-border bg-brand-black md:flex">
      <div className="flex items-center gap-2 px-5 pb-3 pt-4">
        <BrandMark height={24} priority />
        <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[12px] font-medium text-text-secondary">
          Admin
        </span>
      </div>
      <div className="px-3 pb-3">
        <FindAnything />
      </div>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
          {visibleGroups(features).map((group) => (
            <div key={group.label ?? 'top'} className="flex flex-col gap-0.5">
              {group.label && (
                <p className="px-2.5 pb-1 text-[12px] font-medium text-text-muted">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  counts={counts}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-border px-3 pt-2">
          <SidebarLink
            item={SETTINGS_ITEM}
            pathname={pathname}
            counts={counts}
          />
        </div>
      </nav>
      {/* Who is signed in, then help and the way out, under the menu. */}
      {me && (
        <div className="mx-3 mt-1 border-t border-border px-2 pb-1 pt-3">
          <SignedInPerson me={me} />
        </div>
      )}
      <div className="flex items-center gap-0.5 px-3 pb-3 pt-0.5">
        <a
          href={SUPPORT_TEL_HREF}
          title={`Call support · ${SUPPORT_PHONE_DISPLAY}`}
          className={FOOT_LINK}
        >
          <IconPhone size={18} stroke={1.6} aria-hidden="true" />
          Support
        </a>
        <a
          href={SUPPORT_WHATSAPP_HREF}
          target="_blank"
          rel="noopener noreferrer"
          title={`WhatsApp support · ${SUPPORT_PHONE_DISPLAY}`}
          className={FOOT_LINK}
        >
          <IconBrandWhatsapp size={18} stroke={1.6} aria-hidden="true" />
          <span className="sr-only">WhatsApp support</span>
        </a>
        {onLogout && (
          // Neutral, not red: logging out is not what this screen is for.
          <button
            type="button"
            onClick={onLogout}
            className={cn(FOOT_LINK, 'ml-auto')}
            aria-label="Logout"
          >
            <IconLogout size={18} stroke={1.6} aria-hidden="true" />
            Log out
          </button>
        )}
      </div>
    </aside>
  )
}

/** The phone's top bar: the brand, the search and the way out. */
function PhoneHeader({ onLogout }: { onLogout?: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-brand-black/95 backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <BrandMark height={22} priority />
        <div className="flex items-center gap-1">
          <FindAnything compact />
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Logout"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface hover:text-text-primary"
            >
              <IconLogout size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

/** The phone's bar: Today · Bookings · Issues · Garages · More, with red counts. */
function PhoneBar({
  features,
  counts,
  me,
}: {
  features: NavFeatures
  counts: NavCounts | undefined
  me?: AdminMe
}) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const tabs = visibleGroups(features)
    .flatMap((group) => group.items)
    .filter((item) => PHONE_TABS.includes(item.href))
  const more = moreGroups(features)
  const moreActive = more.some((group) =>
    group.items.some((item) => isActive(item, pathname))
  )

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface md:hidden"
      >
        <div className="mx-auto flex max-w-[520px] items-center justify-around px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5">
          {tabs.map((item) => {
            const active = isActive(item, pathname)
            const Icon = ICONS[item.icon]
            const count = countFor(item, counts)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                // The name first, then the count: the badge is drawn before
                // the word, but "Bookings, 2 waiting for the garage" is what
                // is said.
                aria-label={
                  count
                    ? `${item.label}, ${count.n} ${COUNT_WORDS[item.count ?? '']}`
                    : item.label
                }
                className="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1"
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 h-1 w-1 rounded-full bg-brand-red"
                  />
                )}
                <span className="relative">
                  <Icon
                    aria-hidden="true"
                    size={22}
                    stroke={active ? 2 : 1.5}
                    className={active ? 'text-text-primary' : 'text-text-muted'}
                  />
                  {count && (
                    <span
                      aria-hidden="true"
                      title={COUNT_TITLE[item.count ?? '']}
                      className="absolute -right-2.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-brand-red px-1 font-numeric text-[12px] font-semibold leading-[18px] text-white"
                    >
                      {count.n}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-[11.5px] font-medium',
                    active ? 'text-text-primary' : 'text-text-muted'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1"
          >
            {moreActive && (
              <span
                aria-hidden="true"
                className="absolute -top-1 h-1 w-1 rounded-full bg-brand-red"
              />
            )}
            <IconMenu2
              aria-hidden="true"
              size={22}
              stroke={moreActive ? 2 : 1.5}
              className={moreActive ? 'text-text-primary' : 'text-text-muted'}
            />
            <span
              className={cn(
                'text-[11.5px] font-medium',
                moreActive ? 'text-text-primary' : 'text-text-muted'
              )}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      <ScSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        aria-label="More pages"
      >
        <nav aria-label="More pages" className="flex flex-col gap-4 px-4 pb-2">
          {me && (
            <div className="border-b border-border px-1 pb-3">
              <SignedInPerson me={me} />
            </div>
          )}
          {more.map((group) => (
            <div key={group.label ?? 'top'} className="flex flex-col">
              {group.label && (
                <p className="px-1 pb-1 text-[12px] font-medium text-text-muted">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = ICONS[item.icon]
                const count = countFor(item, counts)
                const active = isActive(item, pathname)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className="flex min-h-12 items-center gap-3 border-b border-border px-1 text-[15px] text-text-primary last:border-b-0"
                  >
                    <Icon
                      size={20}
                      stroke={1.6}
                      aria-hidden="true"
                      className="text-text-secondary"
                    />
                    <span className="flex-1">{item.label}</span>
                    {count ? (
                      <span className="text-[13px] font-medium text-warning">
                        <span className="font-numeric">{count.n}</span>{' '}
                        {COUNT_WORDS[item.count ?? '']}
                      </span>
                    ) : (
                      <IconChevronRight
                        size={18}
                        aria-hidden="true"
                        className="text-text-muted"
                      />
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </ScSheet>
    </>
  )
}

/**
 * "Run the day › Issues" above the page, on a laptop. Not on the garage
 * editor, whose header has its own "Garages › <name>".
 */
function Breadcrumb() {
  const pathname = usePathname()
  const crumb = breadcrumb(pathname)
  if (!crumb || isGarageEditor(pathname)) return null
  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden border-b border-border px-6 py-3 md:block"
    >
      <ol
        className={cn(
          'mx-auto flex w-full items-center gap-1 text-[13px]',
          isWidePage(pathname) ? 'max-w-[1600px]' : 'max-w-[1100px]'
        )}
      >
        {/* "Garages › Garages" says nothing twice. */}
        {crumb.group && crumb.group !== crumb.page && (
          <li className="flex items-center gap-1 text-text-secondary">
            {crumb.group}
            <IconChevronRight size={14} aria-hidden="true" />
          </li>
        )}
        <li aria-current="page" className="font-medium text-text-primary">
          {crumb.page}
        </li>
      </ol>
    </nav>
  )
}

/**
 * The panel's frame: a grouped sidebar with counts on a laptop, a five-tab
 * bar with More on a phone (UX audit mockup 01). Replaces the shared
 * PanelShell's single row of fourteen tabs, which hid six of them past the
 * edge of a laptop screen and left Gifts unreachable on a phone.
 */
export function AdminShell({
  features,
  counts,
  me,
  onLogout,
  children,
}: {
  features: NavFeatures
  counts?: NavCounts
  /** Who is signed in; drawn once the session check has answered. */
  me?: AdminMe
  onLogout?: () => void
  children: React.ReactNode
}) {
  // Bookings, Garages and the garage editor are tables and two-column
  // forms: the reading column would cut them short.
  const wide = isWidePage(usePathname())
  return (
    <div className="flex min-h-dvh w-full bg-brand-black text-text-primary">
      <Sidebar
        features={features}
        counts={counts}
        me={me}
        onLogout={onLogout}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneHeader onLogout={onLogout} />
        <Breadcrumb />
        <main
          className={cn(
            'mx-auto flex w-full flex-1 flex-col gap-5 px-4 py-4 md:px-6 md:py-6',
            wide ? 'max-w-[1600px]' : 'max-w-[1100px]',
            // Clear the phone's bar; on a laptop it is gone.
            'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6'
          )}
        >
          {children}
        </main>
      </div>
      <PhoneBar features={features} counts={counts} me={me} />
    </div>
  )
}
