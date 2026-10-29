/**
 * Deleting an account in the app (0066): the words both apps show. The
 * server decides (apps/server/src/lib/account-deletion.ts): it keeps the
 * money records and blanks the person, and refuses only while something is
 * open, saying what to do first.
 */

/** The word typed before "Delete my account" works. */
export const ACCOUNT_DELETION_CONFIRM = 'DELETE'

export const ACCOUNT_DELETION_WORDS = {
  title: 'Delete your account?',
  blockedIntro: 'Your account can be deleted once these are done:',
  deletedHeading: 'Deleted now',
  deleted: [
    'Your name, phone number, email and profile photo',
    'Your saved cars’ number plates and colours, and your saved addresses',
    'The addresses on your past bookings',
    'Saved garages, slot alerts, area lists, requests to garages and notifications on your devices',
    'Every sign-in, on every device',
  ],
  keptHeading: 'Kept, without your name or number',
  kept: [
    'Your bookings, receipts, payments and refunds: the law says we keep money records',
    'Your reviews, shown as “Former customer”',
    'Complaints you made, as our record of how we answered them',
  ],
  final: 'This can’t be undone. You can sign up again later with the same number, as a new account.',
  doneTitle: 'Your account is deleted',
  doneBody: 'You’re signed out on every device. Thanks for using Detlio.',
} as const
