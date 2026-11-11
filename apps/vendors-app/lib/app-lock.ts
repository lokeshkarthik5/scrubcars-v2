import * as LocalAuthentication from 'expo-local-authentication';

import { canOfferLock, lockDecision, type LockDecision } from './app-lock-rules';
import { devicePrefs } from './device-prefs';
import { t } from '@repo/core/i18n/translate';

/**
 * Face ID or fingerprint before the session is read. Off by default, kept on this phone, and
 * the phone's passcode is the fallback. A phone with nothing set up is never blocked.
 */
const KEY = 'detlio.appLock';

export const appLock = {
  enabled: () => devicePrefs.getItem(KEY) === 'on',
  set(on: boolean) {
    if (on) devicePrefs.setItem(KEY, 'on');
    else devicePrefs.removeItem(KEY);
  },
};

async function phoneCan() {
  try {
    const [hasHardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    return { hasHardware, enrolled };
  } catch {
    return { hasHardware: false, enrolled: false };
  }
}

export async function lockOnLaunch(): Promise<LockDecision> {
  if (!appLock.enabled()) return 'open';
  return lockDecision({ enabled: true, ...(await phoneCan()) });
}

export const lockOffered = async () => canOfferLock(await phoneCan());

/** True when the person proved it's them; a cancel is false, and they can try again. */
export async function askToUnlock(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('Unlock Detlio') });
    return result.success;
  } catch {
    return false;
  }
}
