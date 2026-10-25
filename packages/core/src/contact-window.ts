import type { ContactWindow } from '@repo/core/types'

/**
 * How the contact window reads in the customer app and the garage portal
 * (owner decision, 18 Oct 2026). The server decides it
 * (apps/server/src/lib/contact-window.ts) and sends the numbers only inside
 * it, with `contactWindow` so a hidden number can be explained. The numbers
 * here are twins of the server's (contact-window.parity.test.ts). Pure; the
 * clock is passed in.
 */

/** The window opens this long before the slot starts. */
export const CONTACT_OPENS_HOURS_BEFORE = 2
/** A finished job's window stays open this long after completion. */
export const CONTACT_STAYS_HOURS_AFTER = 1
/** A booking nobody started closes this long after its slot's start. */
export const CONTACT_NOT_STARTED_HOURS_AFTER = 2

/** Where a booking stands against its window. */
export type ContactWindowState = 'open' | 'before' | 'after'

/**
 * Open is the server's word. Otherwise a window whose end has passed is
 * "after" (done, cancelled, or never started); one still to come is
 * "before". A payload without a window (an older server) is open: the
 * numbers it carries are the ones to show.
 */
export function contactWindowState(window: ContactWindow | null | undefined, now: number): ContactWindowState {
  if (!window || window.open) return 'open'
  if (window.closesAt && new Date(window.closesAt).getTime() <= now) return 'after'
  return 'before'
}

/** The customer's line where the garage's Call and WhatsApp would be. */
export function garageNumberHiddenLine(state: Exclude<ContactWindowState, 'open'>): string {
  return state === 'before'
    ? `The garage's number shows ${CONTACT_OPENS_HOURS_BEFORE} hours before your booking.`
    : "The garage's number is hidden after your booking."
}

/** The garage's line where the customer's Call and WhatsApp would be. */
export function customerNumberHiddenLine(state: Exclude<ContactWindowState, 'open'>): string {
  return state === 'before'
    ? `Customer's number shows ${CONTACT_OPENS_HOURS_BEFORE} hours before the job.`
    : "Customer's number is hidden after the job."
}

/**
 * The WhatsApp message a garage sends Detlio support when it needs the
 * customer outside the window: the booking named, so nobody has to ask.
 */
export function garageSupportMessage(garageName: string, reference: string): string {
  return `Hi Detlio, this is ${garageName || 'a garage'} about booking ${reference}. We need to reach the customer.`
}
