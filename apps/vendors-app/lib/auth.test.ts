/// <reference types="bun" />
import { beforeEach, expect, mock, test } from 'bun:test';

// The phone's native modules are mocked once, in test-setup.ts (bunfig.toml).
const store = (globalThis as unknown as { __secureStore: Map<string, string> }).__secureStore;

const { appLock } = await import('./app-lock');
const { onBeforeSignOut, useAuth } = await import('./auth');

const signedIn = { id: 'u1', name: 'Om' } as never;

beforeEach(() => {
  store.clear();
  useAuth.setState({ status: 'ready', user: signedIn });
});

test('signing out never hangs on a server call, and the phone is clear after a moment', async () => {
  let seenUser: unknown = 'not called';
  let signal: AbortSignal | undefined;
  const stop = onBeforeSignOut((options) => {
    seenUser = useAuth.getState().user;
    signal = options.signal;
    // A bad signal: this call never answers.
    return new Promise(() => undefined);
  });
  const started = Date.now();
  await useAuth.getState().signOut();
  stop();
  // The hook began while the session could still speak, and was given a way to stop.
  expect(seenUser).toBe(signedIn);
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(useAuth.getState().user).toBeNull();
  expect(useAuth.getState().vendor).toBeNull();
  // Bounded by the short wait, not by the server.
  expect(Date.now() - started).toBeLessThan(5000);
}, 10_000);

test('a quick server is not waited for beyond its answer', async () => {
  const stop = onBeforeSignOut(async () => undefined);
  const started = Date.now();
  await useAuth.getState().signOut();
  stop();
  expect(Date.now() - started).toBeLessThan(1000);
  expect(useAuth.getState().user).toBeNull();
});

test('the Face ID lock is off again once signed out', async () => {
  appLock.set(true);
  expect(appLock.enabled()).toBe(true);
  await useAuth.getState().signOut();
  expect(appLock.enabled()).toBe(false);
});
