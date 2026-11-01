import { beforeEach, expect, mock, test } from 'bun:test';

const store = (globalThis as unknown as { __secureStore: Map<string, string> }).__secureStore;
mock.module('expo-location', () => ({}));
mock.module('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => undefined }) }, Platform: { OS: 'ios' } }));

const { onBeforeSignOut, useAuth } = await import('./auth');
const { useLocationStore } = await import('./location');
const { pendingPayment } = await import('./pending-payment');

const signedIn = { id: 'u1', name: 'Ravi' } as never;
const here = { lat: 13.0827, lng: 80.2707, label: 'Current location', source: 'gps', updatedAt: 1 } as const;

beforeEach(() => {
  store.clear();
  useAuth.setState({ status: 'ready', user: signedIn });
  useLocationStore.setState({ location: here, promptDismissedAt: 5 });
});

test('signing out never waits on a server call, and clears the phone first', async () => {
  let seenUser: unknown = 'not called';
  let signal: AbortSignal | undefined;
  const stop = onBeforeSignOut((options) => {
    seenUser = useAuth.getState().user;
    signal = options.signal;
    return new Promise(() => undefined);
  });
  pendingPayment.write({ kind: 'booking', bookingId: 'b1', vendorName: 'G', startedAt: 1 });
  await useAuth.getState().signOut();
  stop();
  // The hook began while the session could still speak.
  expect(seenUser).toBe(signedIn);
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(useAuth.getState().user).toBeNull();
  expect(pendingPayment.list()).toEqual([]);
});

test('precise location is gone after signing out, and after deleting', async () => {
  await useAuth.getState().signOut();
  expect(useLocationStore.getState().location).toBeNull();
  expect(useLocationStore.getState().promptDismissedAt).toBeNull();
  expect(store.get('detlio.location')).not.toContain('13.08');

  useLocationStore.setState({ location: here });
  await useAuth.getState().forgetDeleted();
  expect(useLocationStore.getState().location).toBeNull();
});

test('a guest can still choose a place afterwards', async () => {
  await useAuth.getState().signOut();
  useLocationStore.getState().setArea({ slug: 'adyar', name: 'Adyar', lat: 13, lng: 80 });
  expect(useLocationStore.getState().location?.label).toBe('Adyar');
});
