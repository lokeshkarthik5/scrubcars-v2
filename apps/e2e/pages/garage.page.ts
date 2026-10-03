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

  /** The At garage / Doorstep switch, a radiogroup. Only rendered for a garage
   *  doing both; the choice rides along to checkout as `&mode=`. */
  mode = (label: 'At garage' | 'Doorstep') =>
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

  detailsCta = () =>
    this.page.getByRole('button', { name: /(Add to|Remove from) booking/ })

  /** The sticky bar; present only once something is selected. */
  bookButton = () => this.page.getByRole('button', { name: /^Book\b/ })

  book = () => this.bookButton().click()
}
