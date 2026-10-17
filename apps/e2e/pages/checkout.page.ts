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

  /** The At garage / Doorstep / Pickup & drop toggle. Only rendered for a
   *  garage offering two or more. */
  bookingType = (label: 'At garage' | 'Doorstep' | 'Pickup & drop') =>
    this.page.getByRole('button', { name: label, exact: true })

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

  // ─── doorstep ────────────────────────────────────────────────────────────

  /**
   * The address step. Mounts only for doorstep, and only once a slot is
   * chosen — drop-in never asks, because the customer comes to the garage.
   */
  addressStep = () => this.page.getByRole('heading', { name: /Where should we come/i })

  /** The same step for pickup & drop, which asks where the car is collected from. */
  pickupAddressStep = () =>
    this.page.getByRole('heading', { name: /Where should we collect your car/i })

  addressCard = (label: string | RegExp) =>
    this.page.getByRole('button', { name: label })

  async pickAddress(label: string | RegExp) {
    await this.addressCard(label).click()
  }

  /**
   * Shown when the chosen address has no coordinates. The server refuses such
   * a booking (ADDRESS_LOCATION_REQUIRED) because it cannot run the coverage
   * check, so this prompt is the only way past it.
   */
  pinPrompt = () => this.page.getByText(/Pin the exact spot/i)

  /** Geolocation is granted per-context at Chennai, which is where the seeded
   *  garages are — so this drops a pin inside MAIN's doorstep radius. */
  useCurrentLocation = () =>
    this.page.getByRole('button', { name: /Use my current location/i }).click()

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
   *  amount, the next missing step, and the in-flight state — including the
   *  paid one, which can no longer be pressed. */
  cta = () =>
    this.page.getByRole('button', {
      name: /^(Pay ₹|Confirm booking|Processing payment|Payment received|Pick a time|Choose your car|Add your car|Choose an address|Choose another address|Add your address|Pin your address|Remove the unpriced service)/,
    })

  /**
   * Pays, once the CTA offers to.
   *
   * The wait is not decoration. While a step is missing the CTA is live and
   * scrolls to that step, so clicking it early no longer waits on a disabled
   * button — it would scroll, and the spec would carry on as if it had paid.
   */
  async pay() {
    const cta = this.cta()
    await expect(cta).toHaveText(/^(Pay ₹|Confirm booking)/)
    await cta.click()
  }
}
