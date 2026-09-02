import type { Page } from '@playwright/test'

/** /bookings/[id] — confirmation and lifecycle. */
export class BookingPage {
  constructor(private readonly page: Page) {}

  goto = (id: string) => this.page.goto(`/bookings/${id}`)

  statusBadge = () => this.page.getByText(/^(PENDING|CONFIRMED|IN PROGRESS|COMPLETED|CANCELLED)$/)

  // Cancel sits behind an inline confirm rather than a dialog, so the reason
  // field and the confirm button only exist after the first click.
  openCancel = () => this.page.getByRole('button', { name: 'Cancel Booking' }).click()
  cancelReason = () => this.page.getByRole('textbox').last()
  confirmCancel = () => this.page.getByRole('button', { name: /Confirm cancel/i }).click()

  openReschedule = () => this.page.getByRole('button', { name: 'Reschedule', exact: true }).click()
  confirmReschedule = () =>
    this.page.getByRole('button', { name: 'Confirm reschedule' }).click()
  /** Disabled stand-in shown once the cap is reached. */
  rescheduleBlocked = () => this.page.getByRole('button', { name: 'No reschedules left' })
  /** The remaining-moves line, e.g. "2 of 2 left". */
  rescheduleAllowance = () => this.page.getByText(/of 2 left/)

  payNow = () => this.page.getByRole('button', { name: /^Pay/ }).click()

  /** Toast text — the app surfaces server refusals this way. */
  toast = () => this.page.locator('[role="alert"]')

  /** The id in the URL. Reschedule navigates to a *new* booking, so specs have
   *  to read where they ended up rather than assume. */
  currentId(): string {
    const match = new URL(this.page.url()).pathname.match(/\/bookings\/([^/?]+)/)
    if (!match) throw new Error(`Not on a booking page: ${this.page.url()}`)
    return match[1]
  }
}
