import * as SecureStore from 'expo-secure-store';

/**
 * Small values kept on this phone, none of them a credential: light or dark, the area
 * chosen, the tip closed today, the car and code picked on Home. Secure storage only
 * because it has synchronous reads, which the first render needs. Never throws.
 */
export const devicePrefs = {
  getItem(key: string): string | null {
    try {
      return SecureStore.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      SecureStore.setItem(key, value);
    } catch {
      // It just isn't remembered.
    }
  },
  removeItem(key: string): void {
    SecureStore.deleteItemAsync(key).catch(() => undefined);
  },
};
