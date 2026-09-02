import { expect, type Page } from '@playwright/test'

/**
 * /book/[vendorId] — checkout.
 *
 * The page reveals itself progressively: the car step only mounts once a slot
 * is chosen, and the summary only once a car is. Methods here follow that
 * order, and each waits for its own section rather than for a fixed timeout.
 */
export class CheckoutPage {
  constructor(private readonly page: Page) {}

  goto = (vendorId: string, serviceIds: string[]) =>
    this.page.goto(`/book/${vendorId}?service=${serviceIds.join(',')}`)

  bookingType = (label: 'Drop In' | 'Doorstep') =>
    this.page.getByRole('button', { name: label })

  /** Tomorrow, never today: it keeps the run independent of the wall clock and
   *  clear of the 2-hour cancel/reschedule cutoff. */
  async pickTomorrow() {
    await this.page.getByRole('button', { name: /Tmrw/ }).click()
  }

  /** Every time button in the grid — the app renders them as "06:00 AM". */
  slots = () => this.page.getByRole('button', { name: /^\d{1,2}:\d{2}\s(AM|PM)$/ })

  /** The first bookable time. Asserts the selection landed, so a later failure
   *  points at the real problem rather than at a slot that never took. */
  async pickFirstSlot() {
    const slot = this.slots().first()
    await slot.waitFor({ state: 'visible' })
    await slot.click()
    await expect(slot).toHaveAttribute('aria-pressed', 'true')
  }

  /** Picks tomorrow and the first slot on it — the common opening move. */
  async pickTomorrowSlot() {
    await this.pickTomorrow()
    await this.pickFirstSlot()
  }

  vehicleCard = (label: string | RegExp) =>
    this.page.getByRole('button', { name: label })

  async pickVehicle(label: string | RegExp) {
    await this.vehicleCard(label).click()
  }

  addCar = () => this.page.getByRole('button', { name: /Add another car/i }).click()

  // ─── promo ───────────────────────────────────────────────────────────────

  /**
   * The promo sheet.
   *
   * Scoped to the dialog throughout: the trigger row is itself named
   * "Coupons and offers Apply", so an unscoped `name: 'Apply'` matches both it
   * and the button inside the sheet.
   */
  promoSheet = () => this.page.getByRole('dialog', { name: /Coupons/i })

  openPromo = () =>
    this.page.getByRole('button', { name: /Coupons and offers/ }).click()

  async applyPromo(code: string) {
    if (!(await this.promoSheet().isVisible())) {
      await this.openPromo()
    }
    const sheet = this.promoSheet()
    await sheet.getByRole('textbox').fill(code)
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click()
  }

  /**
   * The rejection message the sheet renders inline.
   *
   * Matched by excluding the one static paragraph rather than by pattern: the
   * copy is specific per reason ("This code needs a booking of ₹1,000 or
   * more.", "This code has expired."), and a regex broad enough to cover them
   * all would also pass on the wrong message.
   */
  promoError = () =>
    this.promoSheet().locator('p').filter({ hasNotText: 'Have a code from Detlio' })

  appliedBanner = (code: string) => this.page.getByText(`${code} applied`)

  closePromo = () => this.page.keyboard.press('Escape')

  removePromo = () => this.page.getByRole('button', { name: 'Remove', exact: true }).click()

  // ─── summary ─────────────────────────────────────────────────────────────

  /** One row per service; the label is the a11y hook the app already ships. */
  removeLine = (serviceName: string) =>
    this.page.getByRole('button', { name: `Remove ${serviceName}` })

  subtotal = () => this.page.getByText('Subtotal')

  discountRow = (code: string) => this.page.getByText(`Discount (${code})`)

  /** The fixed bottom CTA. Its label is the assertion surface — it carries the
   *  amount, the disabled reason, and the in-flight state. */
  cta = () =>
    this.page.getByRole('button', {
      name: /Pay Now|Confirm booking|Processing payment|Remove the unpriced service/,
    })

  pay = () => this.cta().click()
}
