import { msg } from './i18n/translate'

/**
 * Deleting an account in the app (0066): the words both apps show. The
 * server decides (apps/server/src/lib/account-deletion.ts): it keeps the
 * money records and blanks the person, and refuses only while something is
 * open, saying what to do first.
 */

/** The word typed before "Delete my account" works. */
export const ACCOUNT_DELETION_CONFIRM = 'DELETE'

/** English keys: a screen shows t(ACCOUNT_DELETION_WORDS.title) and so on. */
export const ACCOUNT_DELETION_WORDS = {
  title: msg('Delete your account?'),
  blockedIntro: msg('Your account can be deleted once these are done:'),
  deletedHeading: msg('Deleted now'),
  deleted: [
    msg('Your name, phone number, email and profile photo'),
    msg('Your saved cars’ number plates and colours, and your saved addresses'),
    msg('The addresses on your past bookings'),
    msg('Saved garages, slot alerts, area lists, requests to garages and notifications on your devices'),
    msg('Every sign-in, on every device'),
  ],
  keptHeading: msg('Kept'),
  kept: [
    msg('Your bookings, receipts, payments and refunds, without your name or number: the law says we keep money records'),
    msg('Your reviews, shown as “Former customer”'),
    msg('Complaints you made, with the name and number you gave then, as our record of how we answered them'),
  ],
  final: msg('This can’t be undone. You can sign up again later with the same number, as a new account.'),
  doneTitle: msg('Your account is deleted'),
  doneBody: msg('You’re signed out on every device. Thanks for using Detlio.'),
} as const
