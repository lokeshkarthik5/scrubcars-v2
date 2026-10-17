/**
 * What the garages list says when a garage can't be deleted.
 *
 * The server refuses to delete a garage that has bookings (409
 * VENDOR_HAS_BOOKINGS): the delete would cascade through the bookings and
 * their payments. The list already knows the count, so it says this on the
 * card instead of asking the admin to confirm a delete that will be refused.
 * The server's own message says "Archive it instead", which is a loop for a
 * garage that is already archived, so the wording follows the garage's
 * status. Pure, so it is unit-tested rather than read off a page.
 */

/** A garage the list can't delete, because it has been booked. */
export function deleteRefusal(status: string): string {
  return status === 'archived'
    ? "Already archived and hidden from customers. A garage with bookings can't be deleted yet."
    : "This garage has bookings, so it can't be deleted yet. Archive it to hide it from customers; its bookings are kept."
}

/** The confirm before a garage with no bookings is deleted for good. */
export function deleteConfirm(businessName: string): string {
  return `Permanently delete "${businessName}"?\n\nThis removes the garage, its services and photos, and cannot be undone.`
}
