/**
 * The Home hub's screen (NEXT_PUBLIC_HOME_HUB is on in .env.e2e and in CI's
 * build): offers first, a must-act card above them, the car with Book a wash,
 * its wash bar and tile, and the customer's own ×s. The data underneath is
 * pinned at the API by home-api.spec.ts; this pins what the customer sees and
 * where each tap goes.
 *
 * Every fixture is at VENDORS.homePromo, a garage nobody else books. Its
 * codes reach only customers who booked it (HOME_OFFER_TARGETING is on in
 * .env.e2e), so an offer is always found by its code, never by counting.
 * Customers that only read are shared with home-api.spec.ts; anything this
 * file changes (an interval, an ×) belongs to a customer of its own, and is
 * reset at the start of its test so a retry starts from the seed.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import {
  BOOKINGS,
  CUSTOMERS,
  DISCOUNTS,
  NOTICES,
  SERVICES,
  VEHICLES,
  VENDORS,
} from '../../support/seed-ids'

const OFFER_CODE = DISCOUNTS.homeBooked.code

/**
 * The owner's switch for the car pictures, read from the source rather than
 * imported (@repo/e2e does not depend on @repo/core), so that flipping the
 * one line in packages/core/src/car-images.ts flips this spec with it.
 */
const CAR_PICTURES_BY_TYPE = /^export const CAR_PICTURES_BY_TYPE = true\b/m.test(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../packages/core/src/car-images.ts'),
    'utf8'
  )
)

/** The coupon for one code: its whole-ticket button names the code. */
const offerButton = (page: Page, code = OFFER_CODE) =>
  page.getByRole('button', { name: new RegExp(`code ${code}\\b`) })

// Exact: with two cars the swipe track inside is "Your cars".
const carHero = (page: Page) => page.getByRole('region', { name: 'Your car', exact: true })

/** Switches the car on Home: a tap on its name, then the car in the sheet. */
async function switchCar(page: Page, name: string) {
  await carHero(page).getByRole('button', { name: /switch car$/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Choose a car' })
  await sheet.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(sheet).toBeHidden()
  await expect(carHero(page).getByRole('heading', { name })).toBeVisible()
}

/** True when `first` comes before `second` in the document. */
async function comesBefore(first: Locator, second: Locator) {
  const a = await first.elementHandle()
  const b = await second.elementHandle()
  return a!.evaluate(
    (node, other) => !!(node.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    b
  )
}

/** Whole IST days since a seeded wash, as the server counts them. */
async function daysSinceWash(bookingId: string) {
  const istDay = (at: Date) => Math.floor((at.getTime() + 5.5 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000))
  const [row] = await sql<{ completed_at: Date }[]>`select completed_at from bookings where id = ${bookingId}`
  return istDay(new Date()) - istDay(row.completed_at)
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

test.describe('Home hub @p0', () => {
  test('signed out, /home sends the visitor to the list of garages', async ({ page }) => {
    await page.goto('/home')
    await expect(page).toHaveURL(/\/garages$/)
    await expect(page.getByRole('heading', { name: 'Nearby Garages' })).toBeVisible()
  })

  test.describe('an offer that is live', () => {
    test.use({ storageState: asRole('customer-homeOffer') })

    test('sits below the car as a dark ticket; Book a wash is the one red button', async ({ page }) => {
      await page.goto('/home?welcome=1')

      await expect(page.getByText('Welcome, Hub! Find your first car wash.')).toBeVisible()
      const offer = offerButton(page)
      await expect(offer).toBeVisible()
      await expect(offer).toHaveAccessibleName(new RegExp(DISCOUNTS.homeBooked.homeTitle))
      await expect(carHero(page)).toBeVisible()
      // The approved Home (F2): the car first, the offer one card down, so
      // the ticket never outshines the screen's red button.
      expect(await comesBefore(carHero(page), offer)).toBe(true)
      await expect(page.locator('.offer-coupon').filter({ has: offer })).toHaveClass(/offer-coupon--dark/)

      // One red action on the screen, and it is Book a wash.
      await expect(page.locator('.cta-hero')).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Book a wash' })).toHaveClass(/cta-hero/)

      // The nav's + opens the list of garages, where every booking starts.
      await page.getByRole('link', { name: 'New booking' }).click()
      await expect(page).toHaveURL(/\/garages$/)
    })

    test("tapping it lands in checkout with the code applied, and it survives a change until Remove", async ({ page }) => {
      await page.goto('/home')
      await offerButton(page).click()
      await expect(page).toHaveURL(`/garage/${VENDORS.homePromo.id}?code=${OFFER_CODE}`)

      const garage = new GaragePage(page)
      await garage.add(SERVICES.homePromoWash.name)
      await garage.add(SERVICES.homePromoInspect.name)
      await garage.book()
      await expect(page).toHaveURL(new RegExp(`/book/${VENDORS.homePromo.id}\\?.*code=${OFFER_CODE}`))

      const checkout = new CheckoutPage(page)
      await checkout.pickTomorrowSlot()
      // One car, so it is chosen; the code applied itself. 450 + 299, less
      // 25% capped at ₹150.
      await expect(checkout.appliedBanner(OFFER_CODE)).toBeVisible()
      await expect(checkout.cta()).toHaveText('Pay ₹599')

      // A smaller cart: checked again, and still applied, at 25% of 450.
      await checkout.removeLine(SERVICES.homePromoInspect.name).click()
      await expect(checkout.appliedBanner(OFFER_CODE)).toBeVisible()
      // Paise only when there are any, and then both digits (F7).
      await expect(checkout.cta()).toHaveText('Pay ₹337.50')

      // Remove is for good: off the link too, so a reload does not bring it back.
      await checkout.removePromo()
      await expect(checkout.appliedBanner(OFFER_CODE)).toHaveCount(0)
      await expect(checkout.cta()).toHaveText('Pay ₹450')
      await expect(page).not.toHaveURL(/code=/)
      // The × on a line changes the cart, not the link, so a reload brings
      // back both services the link names; what must not come back is the code.
      await page.reload()
      await checkout.pickTomorrowSlot()
      await expect(checkout.cta()).toHaveText('Pay ₹749')
      await expect(checkout.appliedBanner(OFFER_CODE)).toHaveCount(0)
    })

    test('Book again opens checkout with the same service', async ({ page }) => {
      await page.goto('/home')
      const tile = page.getByRole('link', { name: /^Book again/ })
      await expect(tile).toContainText(SERVICES.homePromoWash.name)
      await expect(tile).toContainText('₹450')
      await tile.click()

      await expect(page).toHaveURL(`/book/${VENDORS.homePromo.id}?service=${SERVICES.homePromoWash.id}`)
      const checkout = new CheckoutPage(page)
      await checkout.pickTomorrowSlot()
      // One line, so it has no × of its own: the summary names it, at its
      // price, with no code (none was tapped, and none is pending).
      await expect(page.getByText(SERVICES.homePromoWash.name).first()).toBeVisible()
      await expect(checkout.cta()).toHaveText('Pay ₹450')
    })
  })

  test.describe("Home's code, once the cart no longer fits it", () => {
    // Only reads: a code is checked, never redeemed, and nothing is paid.
    test.use({ storageState: asRole('customer-coupons') })

    test('checkout says why it no longer applies, and Remove clears it', async ({ page }) => {
      const code = DISCOUNTS.fixedMinOrder.code
      await page.goto(`/book/${VENDORS.main.id}?service=${SERVICES.detail.id},${SERVICES.wash.id}&code=${code}`)
      const checkout = new CheckoutPage(page)
      await checkout.pickTomorrowSlot()
      await checkout.pickVehicle(/Hyundai i20/)
      // 1999 + 499 clears the ₹1,000 minimum, so it applied itself.
      await expect(checkout.appliedBanner(code)).toBeVisible()
      await expect(checkout.cta()).toHaveText('Pay ₹2,398')

      // 499 alone does not. Checked again, and said, in the server's words:
      // never a saving that quietly vanishes.
      await checkout.removeLine(SERVICES.detail.name).click()
      const problem = page.getByRole('status').filter({ hasText: `${code} doesn't apply to this booking.` })
      await expect(problem).toContainText('This code needs a booking of ₹1,000 or more.')
      await expect(checkout.appliedBanner(code)).toHaveCount(0)
      await expect(checkout.cta()).toHaveText('Pay ₹499')

      // The customer can let it go: off the page and off the link.
      await page.getByRole('button', { name: `Remove ${code}` }).click()
      await expect(problem).toHaveCount(0)
      await expect(page).not.toHaveURL(/code=/)
      await expect(page.getByRole('button', { name: /Coupons and offers/ })).toBeVisible()
    })
  })

  test.describe('a bill to pay', () => {
    test.use({ storageState: asRole('customer-homeBill') })

    test('sits above the offer, and Pay is the one red button; Book a wash steps down', async ({ page }) => {
      await page.goto('/home')

      const bill = page.getByRole('region', { name: `Final bill from ${VENDORS.homePromo.name}` })
      await expect(bill).toBeVisible()
      await expect(offerButton(page)).toBeVisible()
      expect(await comesBefore(bill, offerButton(page))).toBe(true)

      const pay = bill.getByRole('link', { name: 'Pay ₹800' })
      await expect(page.locator('.cta-hero')).toHaveCount(1)
      await expect(pay).toHaveClass(/cta-hero/)
      const bookWash = page.getByRole('button', { name: 'Book a wash' })
      await expect(bookWash).toBeVisible()
      await expect(bookWash).not.toHaveClass(/cta-hero/)

      // Paying is the booking page's bill flow, opened at the bill; ?then is
      // read once and taken off the URL, so Back or a reload does not replay it.
      await expect(pay).toHaveAttribute('href', `/bookings/${BOOKINGS.homeBillJob}?then=pay`)
      await pay.click()
      await expect(page.getByRole('heading', { name: 'Final bill' })).toBeVisible()
      await expect(page).toHaveURL(`/bookings/${BOOKINGS.homeBillJob}`)
    })
  })

  test.describe('the garage shut on the booking day', () => {
    test.use({ storageState: asRole('customer-homeClosed') })

    test('Change time opens the booking with its reschedule sheet', async ({ page }) => {
      await page.goto('/home')
      const card = page.getByRole('region', {
        name: `${VENDORS.homePromo.name} is closed on your booking day`,
      })
      await expect(card).toContainText('A holiday')
      await expect(card.getByRole('link', { name: 'Get help' })).toBeVisible()

      const changeTime = card.getByRole('link', { name: 'Change time' })
      await expect(changeTime).toHaveAttribute('href', `/bookings/${BOOKINGS.homeClosedUpcoming}?then=reschedule`)
      await changeTime.click()
      await expect(page.getByRole('dialog', { name: 'Reschedule booking' })).toBeVisible()
      // Opened once: off the URL, so a reload shows the booking, not the sheet.
      await expect(page).toHaveURL(`/bookings/${BOOKINGS.homeClosedUpcoming}`)
      await page.reload()
      await expect(page.getByRole('heading', { name: VENDORS.homePromo.name }).first()).toBeVisible()
      await expect(page.getByRole('dialog', { name: 'Reschedule booking' })).toHaveCount(0)
    })
  })

  test.describe('the wash bar', () => {
    test.use({ storageState: asRole('customer-homeScreenWash') })

    test('due and overdue, per car, and the interval the customer picks', async ({ page }) => {
      // As seeded, so a retry starts from the same place.
      await sql`
        update user_vehicles set wash_interval_days = 10
         where id in (${CUSTOMERS.homeScreenWash.vehicleId}, ${VEHICLES.homeScreenWashSecond})
      `
      const first = await daysSinceWash(BOOKINGS.homeScreenWashFirst)
      const second = await daysSinceWash(BOOKINGS.homeScreenWashSecond)

      await page.goto('/home')
      const tile = page.getByRole('button', { name: /^Last wash/ })
      // 8 days into 10: due in 2 days.
      await expect(tile).toContainText(new RegExp(`${first}\\s*days ago`))
      await expect(tile).toContainText(`Due in ${days(10 - first)}`)

      // Two cars: a tap on the car's name switches it (F2: the offers are
      // Home's only swipe row), and the tiles follow the car chosen.
      await expect(carHero(page).getByRole('heading', { name: 'Honda Amaze' })).toBeVisible()
      await switchCar(page, 'Tata Nexon')
      // 13 days into 10: overdue by 3.
      await expect(tile).toContainText(`Overdue by ${days(second - 10)}`)

      await tile.click()
      const sheet = page.getByRole('dialog', { name: 'How often to wash' })
      await expect(sheet).toContainText('Tata Nexon')
      await expect(sheet).toContainText('Default is every 14 days, every 10 days during the Oct–Dec monsoon.')
      await expect(sheet.getByRole('button', { name: 'Every 10 days' })).toHaveAttribute('aria-pressed', 'true')
      await sheet.getByRole('button', { name: 'Every 21 days' }).click()
      await expect(sheet).toBeHidden()
      await expect(tile).toContainText(`Due in ${days(21 - second)}`)
    })

    // Only reads. Follows CAR_PICTURES_BY_TYPE (read from car-images.ts
    // above), so the owner's one-line switch back to the single picture
    // needs no change here.
    test("each car shows its body type's picture, standing on the approved line", async ({ page }) => {
      await page.goto('/home')
      const hero = carHero(page)
      // One car on the stage at a time.
      const picture = () => hero.locator('img.car-hero__car')
      // What the browser actually drew, not what the markup asked for: if a
      // body-type file fails, the hero swaps in car-default under the same
      // class, so only currentSrc tells the two apart.
      const drawn = () =>
        picture().evaluate((img: HTMLImageElement) => (img.complete && img.naturalWidth > 0 ? img.currentSrc : ''))

      // As seeded: the Honda Amaze is a sedan, the Tata Nexon an SUV / MUV.
      await expect(hero.getByRole('heading', { name: 'Honda Amaze' })).toBeVisible()

      if (!CAR_PICTURES_BY_TYPE) {
        // One picture for every car, through next/image as Home launched.
        for (const name of ['Honda Amaze', 'Tata Nexon']) {
          if (name === 'Tata Nexon') await switchCar(page, name)
          await expect(picture()).not.toHaveClass(/car-hero__car--body-type/)
          await expect.poll(drawn).toContain('car-default.webp')
        }
        return
      }

      await expect(picture()).toHaveAttribute('src', '/cars/car-sedan-1200.webp')
      await expect(picture()).toHaveAttribute(
        'srcset',
        '/cars/car-sedan-1200.webp 1200w, /cars/car-sedan-2400.webp 2400w'
      )
      // Loaded and still the body-type file, so a missing or broken file
      // cannot pass as the fallback.
      await expect.poll(drawn).toContain('/cars/car-sedan-')
      await expect(picture()).toHaveClass(/car-hero__car--body-type/)

      // Placed by the tyres, not the top: they stand 217pt down the hero
      // (201pt when a must-act card makes it short), the SUV as the sedan.
      // Measured from inside the card's 1px border, as the CSS `top` is.
      const short = await hero.evaluate((el) => el.classList.contains('car-hero--short'))
      const line = short ? 201 : 217
      const onTheLine = async () => {
        const heroBox = (await hero.boundingBox())!
        const box = (await picture().boundingBox())!
        expect(Math.abs(box.y + box.height * 0.907 - (heroBox.y + 1 + line))).toBeLessThan(0.75)
      }
      await onTheLine()

      await switchCar(page, 'Tata Nexon')
      await expect(picture()).toHaveAttribute('src', '/cars/car-suv-1200.webp')
      await expect.poll(drawn).toContain('/cars/car-suv-')
      await expect(picture()).toHaveClass(/car-hero__car--body-type/)
      await onTheLine()
    })
  })

  test.describe('a new customer', () => {
    test.use({ storageState: asRole('customer-homeNew') })

    test('is asked for a car, and has no tiles yet', async ({ page }) => {
      await page.goto('/home')

      await expect(carHero(page).getByRole('heading', { name: 'Add your car' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add car' })).toHaveClass(/cta-hero/)
      await expect(page.getByRole('button', { name: /^Last wash/ })).toHaveCount(0)
      // Garages' codes are priced against a car.
      await expect(offerButton(page)).toHaveCount(0)
    })
  })

  test.describe("a notice about the customer's booking", () => {
    test.use({ storageState: asRole('customer-homeTile') })

    test('rides on the Next booking tile and leads Updates; × on it and on an offer hold', async ({ page }) => {
      await sql`delete from notice_dismissals where user_id = ${CUSTOMERS.homeTile.id}`
      await sql`delete from offer_dismissals where user_id = ${CUSTOMERS.homeTile.id}`
      const title = 'Water cut: slot may move'

      await page.goto('/home')
      // Not a card above the car: one line on the tile.
      const tile = page.getByRole('link', { name: /^Next booking/ })
      await expect(tile).toContainText(title)
      await expect(page.getByRole('region', { name: /closed on your booking day|Final bill/ })).toHaveCount(0)
      const updates = page.getByRole('list', { name: 'Latest updates' })
      await expect(updates.getByRole('listitem').first()).toContainText(title)

      await updates.getByRole('button', { name: `Hide notice: ${title}` }).click()
      await expect(updates.getByText(title)).toHaveCount(0)
      await page.reload()
      await expect(tile).toBeVisible()
      await expect(tile).not.toContainText(title)
      await expect(page.getByText(title)).toHaveCount(0)

      const coupon = page.locator('.offer-coupon').filter({ has: offerButton(page) })
      await coupon.getByRole('button', { name: 'Hide offer' }).click()
      await expect(offerButton(page)).toHaveCount(0)
      await page.reload()
      await expect(carHero(page)).toBeVisible()
      await expect(offerButton(page)).toHaveCount(0)

      // Gone on every device: the server keeps both.
      const [kept] = await sql<{ notices: number; offers: number }[]>`
        select
          (select count(*)::int from notice_dismissals
            where user_id = ${CUSTOMERS.homeTile.id} and notice_id = ${NOTICES.homeTileNote}) as notices,
          (select count(*)::int from offer_dismissals
            where user_id = ${CUSTOMERS.homeTile.id} and discount_id = ${DISCOUNTS.homeBooked.id}) as offers
      `
      expect(kept).toEqual({ notices: 1, offers: 1 })
    })
  })
})
