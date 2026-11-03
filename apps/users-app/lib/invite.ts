import { devicePrefs } from './device-prefs';

/**
 * The invite a visitor opened before signing up: the code and the API's signed note of when it
 * was opened, kept on this phone only until the new account takes it up. Never sent anywhere
 * but back to the API's claim, and never logged.
 */
const KEY = 'detlio.invite';

export interface StoredInvite {
  code: string;
  token: string;
}

export function readStoredInvite(code: string): StoredInvite | null {
  try {
    const raw = devicePrefs.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredInvite>;
    if (typeof parsed.code !== 'string' || typeof parsed.token !== 'string') return null;
    return parsed.code.toUpperCase() === code.toUpperCase() ? { code: parsed.code, token: parsed.token } : null;
  } catch {
    return null;
  }
}

export const storeInvite = (invite: StoredInvite) => devicePrefs.setItem(KEY, JSON.stringify(invite));
export const forgetInvite = () => devicePrefs.removeItem(KEY);
