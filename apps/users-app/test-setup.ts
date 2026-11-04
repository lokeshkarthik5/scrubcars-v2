/**
 * Loaded before every test file (bunfig.toml). Bun's module mocks are shared across files in a
 * run, so a mock in one file can decide what another sees, depending on the order files run in.
 * The phone's stores live here, once, complete.
 */
import { beforeEach, mock } from 'bun:test';

const store = new Map<string, string>();

/** What the tests read back: the phone's secure storage. */
(globalThis as { __secureStore?: Map<string, string> }).__secureStore = store;

mock.module('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'test',
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void store.set(key, value),
  deleteItemAsync: async (key: string) => void store.delete(key),
}));

mock.module('expo-local-authentication', () => ({
  hasHardwareAsync: async () => false,
  isEnrolledAsync: async () => false,
  authenticateAsync: async () => ({ success: false }),
}));

mock.module('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => undefined }), useNetworkState: () => ({}) }));

beforeEach(() => store.clear());
