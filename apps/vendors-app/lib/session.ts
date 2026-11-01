import { createNativeSession } from '@repo/core/native-session';
import * as SecureStore from 'expo-secure-store';

const KEY = 'detlio.refreshToken';
// Never carried to another phone through a backup.
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const session = createNativeSession('vendor', {
  get: () => SecureStore.getItemAsync(KEY, OPTIONS),
  set: (token) => SecureStore.setItemAsync(KEY, token, OPTIONS),
  clear: () => SecureStore.deleteItemAsync(KEY, OPTIONS),
});

session.install();
