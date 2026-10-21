import { afterAll, describe, expect, mock, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppShell } from '@repo/ui/sc/app-shell'

// The navs read the path from the App Router, which a test has none of.
let pathname = '/bookings'
mock.module('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}))

// The session, as HubNav reads it. A server render only ever sees a zustand
// store's initial state, so the store is stood in for here.
let session: { isSessionReady: boolean; user: { id: string } | null } = {
  isSessionReady: false,
  user: null,
}
mock.module('@repo/core/stores/auth-store', () => ({
  useAuthStore: <T,>(select: (s: typeof session) => T) => select(session),
}))

// Imported after the mocks, so HubNav sees them.
const { CustomerShell } = await import('./customer-shell')

const saved = process.env.NEXT_PUBLIC_HOME_HUB
afterAll(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_HOME_HUB
  else process.env.NEXT_PUBLIC_HOME_HUB = saved
})

/** Renders a customer screen's shell at a path with the hub flag set so. */
function shellAt(path: string, hub: string | undefined, showNav = true) {
  pathname = path
  if (hub === undefined) delete process.env.NEXT_PUBLIC_HOME_HUB
  else process.env.NEXT_PUBLIC_HOME_HUB = hub
  return renderToStaticMarkup(
    <CustomerShell showNav={showNav} showBrand className="gap-4 py-4">
      <p>Content</p>
    </CustomerShell>
  )
}

/** The lit item of the floating nav, by its accessible name. */
function litItems(html: string) {
  return [...html.matchAll(/<a aria-label="([^"]+)" aria-current="page"/g)].map(
    (m) => m[1]
  )
}

describe('CustomerShell with the Home hub off (production)', () => {
  test('is AppShell exactly as before: the flat bar, Search and all', () => {
    for (const hub of [undefined, '', 'off', 'true']) {
      const html = shellAt('/bookings', hub)
      pathname = '/bookings'
      const before = renderToStaticMarkup(
        <AppShell showNav showBrand className="gap-4 py-4">
          <p>Content</p>
        </AppShell>
      )
      expect(html).toBe(before)
      expect(html).toContain('>Search</span>')
      expect(html).toContain(
        'padding-bottom:calc(5rem + env(safe-area-inset-bottom))'
      )
      expect(html).not.toContain('aria-label="Main"')
      expect(html).not.toContain('New booking')
    }
  })

  test('the old Home tab still stands for the garage list', () => {
    const html = shellAt('/garages', undefined)
    expect(html).toMatch(
      /<a aria-current="page" class="[^"]*" href="\/garages">/
    )
  })
})

describe('CustomerShell with the Home hub on', () => {
  test('draws the floating pill in place of the flat bar, with room under the content', () => {
    const html = shellAt('/bookings', 'on')
    expect(html).toContain('aria-label="Main"')
    expect(html).not.toContain('>Search</span>')
    expect(html).toContain(
      'padding-bottom:calc(112px + env(safe-area-inset-bottom))'
    )
    for (const name of ['Home', 'Map', 'New booking', 'Bookings', 'Profile']) {
      expect(html).toContain(`aria-label="${name}"`)
    }
    // Every item is a 44pt target or more: four labelled tabs 48pt tall,
    // and the 48pt +.
    expect(html.match(/min-h-12 min-w-\[52px\]/g)?.length).toBe(4)
    expect(html.match(/size-12/g)?.length).toBe(1)
    // Each tab says its name under its icon (F11).
    for (const name of ['Home', 'Map', 'Bookings', 'Profile']) {
      expect(html).toContain(`>${name}</span>`)
    }
  })

  test('lights the right item, and only that one', () => {
    expect(litItems(shellAt('/bookings', 'on'))).toEqual(['Bookings'])
    expect(litItems(shellAt('/bookings/abc', 'on'))).toEqual(['Bookings'])
    expect(litItems(shellAt('/profile', 'on'))).toEqual(['Profile'])
    expect(litItems(shellAt('/home', 'on'))).toEqual(['Home'])
    expect(litItems(shellAt('/search', 'on'))).toEqual([])
  })

  test('the list lights nothing for a customer, and Home for a visitor', () => {
    // A session not yet checked, then a customer: the hub is Home, not the list.
    for (const user of [null, { id: 'customer' }]) {
      session = { isSessionReady: user !== null, user }
      expect(litItems(shellAt('/garages', 'on'))).toEqual([])
      expect(shellAt('/garages', 'on')).not.toMatch(
        /aria-label="New booking"[^>]*aria-current/
      )
    }

    session = { isSessionReady: true, user: null }
    try {
      expect(litItems(shellAt('/garages', 'on'))).toEqual(['Home'])
      // Home still goes to /home, which sends a visitor back here.
      expect(shellAt('/garages', 'on')).toMatch(
        /aria-label="Home" aria-current="page"[^>]*href="\/home"/
      )
    } finally {
      session = { isSessionReady: false, user: null }
    }
  })

  test('+ opens the list of garages', () => {
    expect(shellAt('/profile', 'on')).toMatch(
      /aria-label="New booking"[^>]*href="\/garages"/
    )
  })

  test('a screen without a nav gets none, and no padding for one', () => {
    const html = shellAt('/bookings', 'on', false)
    expect(html).not.toContain('<nav')
    expect(html).not.toContain('padding-bottom')
  })
})
