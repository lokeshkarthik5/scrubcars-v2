/**
 * The Home hub's look on the rest of the customer app (NEXT_PUBLIC_HOME_HUB is
 * on in .env.e2e and in CI's build): the floating pill nav on every screen
 * that has a nav, with the right item lit, and the red hero pill on a
 * screen's one main action — the garage page's Book Now, checkout's Pay, a
 * final bill's Pay, the add-car sheet's Save car and the add-address sheet's
 * Save address — with its shine played once per visit.
 *
 * With the flag off none of this is drawn; the suite cannot see that build,
 * so the old nav and button are pinned by apps/users unit tests
 * (customer-shell.test.tsx, main-action.test.tsx).
 *
 * Read-only throughout: nothing here books, pays or saves, so it shares the
 * browse customer with discovery, and the bill customer (whose booking has a
 * final bill due) with home.spec.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import { BOOKINGS, SERVICES, VENDORS } from '../../support/seed-ids'

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })

/** The one item of the pill marked as the current page, or none. */
const lit = (page: Page) => nav(page).locator('[aria-current="page"]')

test.describe('the floating nav, app-wide @p0', () => {
  test.use({ storageState: asRole('customer-browse') })

  const screens: Array<[path: string, item: string]> = [
    ['/bookings', 'Bookings'],
    ['/profile', 'Profile'],
    ['/map', 'Map'],
  ]

  for (const [path, item] of screens) {
    test(`is on ${path}, with ${item} lit`, async ({ page }) => {
      await page.goto(path)
      await expect(nav(page)).toBeVisible()
      await expect(lit(page)).toHaveCount(1)
      await expect(nav(page).getByRole('link', { name: item, exact: true })).toHaveAttribute(
        'aria-current',
        'page'
      )
      // Search is not a tab any more (owner decision D9).
      await expect(nav(page).getByRole('link', { name: 'Search' })).toHaveCount(0)
    })
  }

  // A signed-in customer's Home is the hub, so the list is not it; the + is
  // an action, never lit (lib/hub-nav.ts). A visitor's list lights Home
  // (garages.spec.ts).
  for (const path of ['/garages', '/search']) {
    test(`is on ${path}, with nothing lit`, async ({ page }) => {
      await page.goto(path)
      await expect(nav(page)).toBeVisible()
      await expect(lit(page)).toHaveCount(0)
      await expect(nav(page).getByRole('link', { name: 'Search' })).toHaveCount(0)
    })
  }

  test('+ opens the list of garages', async ({ page }) => {
    await page.goto('/search')
    await expect(nav(page)).toBeVisible()

    await nav(page).getByRole('link', { name: 'New booking' }).click()
    await expect(page).toHaveURL(/\/garages$/)
    await expect(page.getByRole('heading', { name: 'Nearby Garages' })).toBeVisible()
  })

  test('every item is a 44pt target', async ({ page }) => {
    await page.goto('/profile')
    const items = nav(page).getByRole('link')
    await expect(items).toHaveCount(5)
    for (const box of await Promise.all((await items.all()).map((item) => item.boundingBox()))) {
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })

  test("the page's last control scrolls clear of the pill", async ({ page }) => {
    await page.goto('/profile')
    const logOut = page.getByRole('button', { name: 'Log out' })
    await expect(logOut).toBeVisible()
    // Above the pill's scrim too (96pt), not just the pill: a button read
    // through the fade is half hidden. The flat bar's 80pt padding would not
    // clear it.
    const { height } = page.viewportSize()!
    const scrimTop = height - 96
    expect((await nav(page).boundingBox())!.y).toBeGreaterThan(scrimTop)

    // Polled, scrolling each time: the cars and addresses arrive after the
    // button does and push it down.
    await expect
      .poll(async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        const button = (await logOut.boundingBox())!
        return button.y + button.height <= scrimTop
      })
      .toBe(true)
  })

  test("the top-level titles are the hub's large light ones", async ({ page }) => {
    for (const [path, title] of [
      ['/bookings', 'Bookings'],
      ['/profile', 'Profile'],
    ]) {
      await page.goto(path)
      const heading = page.getByRole('heading', { level: 1, name: title })
      await expect(heading).toHaveCSS('font-size', '34px')
      await expect(heading).toHaveCSS('font-weight', '300')
    }
  })
})

test.describe('one red hero action per screen @p0', () => {
  test.use({ storageState: asRole('customer-browse') })

  test("the garage page's Book Now, once something is picked", async ({ page }) => {
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.main.id)
    await expect(page.getByText(SERVICES.wash.name).first()).toBeVisible()
    await expect(page.locator('.cta-hero')).toHaveCount(0)

    await garage.add(SERVICES.wash.name)
    await expect(page.locator('.cta-hero')).toHaveCount(1)
    await expect(garage.bookButton()).toHaveClass(/cta-hero/)
    await expect(garage.bookButton()).toHaveAccessibleName('Book Now')
  })

  test("the garage page's Add buttons are not red beside it", async ({ page }) => {
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.main.id)
    const add = garage.addButton(SERVICES.wash.name)
    await expect(add).toBeVisible()
    // Graphite outline: Book Now's gradient is the page's one red.
    await expect(add).not.toHaveCSS('background-color', 'rgb(239, 50, 64)')
    await expect(add).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  })

  test("checkout's Pay, once nothing is left to pick; the add-car sheet's Save car", async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])

    // Graphite while a step is missing: red only ever means "this pays".
    await expect(checkout.cta()).toHaveText(/^Pick a time/)
    await expect(page.locator('.cta-hero')).toHaveCount(0)

    await checkout.pickTomorrowSlot()
    await expect(checkout.cta()).toHaveText(/^Pay ₹/)
    await expect(page.locator('.cta-hero')).toHaveCount(1)
    await expect(checkout.cta()).toHaveClass(/cta-hero/)

    // The sheet over it has its own one main action. Nothing is saved.
    await checkout.addCar()
    const sheet = page.getByRole('dialog', { name: 'Add a car' })
    await expect(sheet.getByRole('button', { name: 'Save car' })).toHaveClass(/cta-hero/)
    await expect(sheet.getByRole('button', { name: 'Cancel' })).not.toHaveClass(/cta-hero/)
    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet).toBeHidden()
  })

  test("doorstep checkout's add-address sheet: Save address is its hero, like Save car", async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])
    await checkout.bookingType('Doorstep').click()
    await checkout.pickTomorrowSlot()
    await expect(checkout.addressStep()).toBeVisible()

    // "Add an address" with none saved, "Add another address" otherwise.
    await page.getByRole('button', { name: /^Add (an|another) address$/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Add an address' })
    await expect(sheet.getByRole('button', { name: 'Save address' })).toHaveClass(/cta-hero/)
    await expect(sheet.getByRole('button', { name: 'Cancel' })).not.toHaveClass(/cta-hero/)
    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet).toBeHidden()
  })

  test('the shine plays once: enabling Save car again does not replay it', async ({ page }) => {
    // As after a dismissed payment sheet: the hero is disabled mid-shine and
    // enabled again. Two sweeps per visit is the limit the motion was
    // approved under (useHeroShine).
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])
    await checkout.pickTomorrowSlot()
    await checkout.addCar()
    const sheet = page.getByRole('dialog', { name: 'Add a car' })
    const save = sheet.getByRole('button', { name: 'Save car' })
    const shine = () =>
      save.evaluate((button) => getComputedStyle(button, '::after').animationName)
    /** How far into its run the band is, in ms, or null when it is not running. */
    const shineAt = () =>
      save.evaluate((button) => {
        const run = button
          .getAnimations({ subtree: true })
          .find((a) => (a as CSSAnimation).animationName === 'cta-shine-intro')
        return run ? Number(run.currentTime) : null
      })

    // Disabled until the form is complete, and a disabled hero never shines.
    await expect(save).toBeDisabled()
    await sheet.getByLabel('Make', { exact: true }).fill('Maruti')
    await sheet.getByLabel('Model', { exact: true }).fill('Swift')
    await expect(save).toBeEnabled()
    expect(await shine()).toBe('cta-shine-intro')
    // Past the 0.4 s delay: the band is sweeping.
    await expect.poll(shineAt).toBeGreaterThan(700)

    // Cut short, then enabled again. Nothing is saved.
    await sheet.getByLabel('Model', { exact: true }).fill('')
    await expect(save).toBeDisabled()
    await sheet.getByLabel('Model', { exact: true }).fill('Swift')
    await expect(save).toBeEnabled()
    await expect(save).toHaveClass(/cta-hero-rested/)
    await expect.poll(shine).toBe('none')

    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet).toBeHidden()
  })

  test('the shine plays on arrival, and not at all under reduced motion', async ({ page }) => {
    const garage = new GaragePage(page)
    const shine = () =>
      garage.bookButton().evaluate((button) => {
        const after = getComputedStyle(button, '::after')
        return { display: after.display, animation: after.animationName }
      })

    await garage.goto(VENDORS.main.id)
    await garage.add(SERVICES.wash.name)
    expect(await shine()).toEqual({ display: 'block', animation: 'cta-shine-intro' })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect((await shine()).display).toBe('none')
  })
})

test.describe('a final bill to pay @p0', () => {
  test.use({ storageState: asRole('customer-homeBill') })

  test("its Pay is the booking page's one hero action; the booking lights Bookings", async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.homeBillJob}`)
    const bill = page.locator('#final-bill')
    await expect(bill.getByRole('heading', { name: 'Final bill' })).toBeVisible()
    await expect(page.locator('.cta-hero')).toHaveCount(1)
    await expect(bill.getByRole('button', { name: 'Pay ₹800' })).toHaveClass(/cta-hero/)

    await expect(lit(page)).toHaveCount(1)
    await expect(nav(page).getByRole('link', { name: 'Bookings', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })
})
