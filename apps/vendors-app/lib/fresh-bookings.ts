import { useBookingsStore } from '@repo/core/stores/bookings-store';

import { readGuarded } from './session-epoch';

/** Reads the jobs through the store, and empties it again if the answer came too late. */
export function readFreshBookings() {
  const store = useBookingsStore.getState();
  return readGuarded(() => store.fetchVendorBookings(), store.reset);
}
