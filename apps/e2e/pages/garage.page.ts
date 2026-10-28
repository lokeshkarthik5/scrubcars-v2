import type { Page } from '@playwright/test'

/**
 * /garage/[id] — the multi-service cart.
 *
 * Selection order matters: it becomes the `?service=a,b,c` query the checkout
 * page reads back, so `add()` calls are order-significant in tests too.
 */
export class GaragePage {
  constructor(private readonly page: Page) {}

  goto = (vendorId: string) => this.page.goto(`/garage/${vendorId}`)

  /** The At garage / Doorstep / Pickup & drop switch, a radiogroup. Only
   *  rendered for a garage offering two or more; the choice rides along to
   *  checkout as `&mode=`. */
  mode = (label: 'At garage' | 'Doorstep' | 'Pickup & drop') =>
    this.page.getByRole('radio', { name: label, exact: true })

  tab = (name: 'Services' | 'Photos' | 'Reviews') => this.page.getByRole('tab', { name })

  openTab = (name: 'Services' | 'Photos' | 'Reviews') => this.tab(name).click()

  /**
   * The Add / Added toggle for one service.
   *
   * Matched on the accessible name rather than position: the page renders
   * packages above services and orders each group independently, so anything
   * index-based would silently drift.
   */
  addButton = (serviceName: string) =>
    this.page.getByRole('button', { name: `Add ${serviceName} to booking` })

  removeButton = (serviceName: string) =>
    this.page.getByRole('button', { name: `Remove ${serviceName} from booking` })

  /** Either state of the toggle — for asserting `aria-pressed` directly. */
  toggle = (serviceName: string) =>
    this.page.getByRole('button', {
      name: new RegExp(`^(Add ${serviceName} to|Remove ${serviceName} from) booking$`),
    })

  add = (serviceName: string) => this.addButton(serviceName).click()

  remove = (serviceName: string) => this.removeButton(serviceName).click()

  /** The whole card is the details control — its body button's hit area is
   *  stretched over the card, and there is no separate "Details" button. */
  openDetails = (serviceName: string) =>
    this.page.getByRole('button', { name: `View details for ${serviceName}` }).first().click()

  /** A service card's details trigger: its name, price, picture or icon and line. */
  detailsTrigger = (serviceName: string) =>
    this.page.getByRole('button', { name: `View details for ${serviceName}` }).first()

  /** The details sheet, a dialog named "<service> details". */
  detailsSheet = (serviceName: string) =>
    this.page.getByRole('dialog', { name: `${serviceName} details` })

  /** The sheet's "What's included" list (a section labelled by its heading). */
  whatsIncluded = (serviceName: string) =>
    this.detailsSheet(serviceName).getByRole('region', { name: "What's included" })

  /**
   * The designed cover of a garage with no photo, and the monogram tile of
   * one with no logo. Both are decorative (aria-hidden), hence test ids.
   */
  cover = () => this.page.getByTestId('garage-cover')

  monogram = () => this.page.getByTestId('garage-monogram')

  detailsCta = () =>
    this.page.getByRole('button', { name: /(Add to|Remove from) booking/ })

  /** The sticky bar; present only once something is selected. */
  bookButton = () => this.page.getByRole('button', { name: /^Book\b/ })

  book = () => this.bookButton().click()
}
