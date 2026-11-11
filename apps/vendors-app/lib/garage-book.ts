import { apiClient } from '@repo/core/api/client';
import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { useAuth } from './auth';
import { APP_VERSION } from './app-config';
import { devicePrefs } from './device-prefs';

/**
 * Whether Garage Book is on (0072): the app-config answer's `garageBook`, which is the
 * server's GARAGE_BOOK switch. Off, or no answer from an older API, the app is exactly as
 * it was: today's tabs and screens. The last answer is kept on the phone so the bar does
 * not flash from the old one to the new on every start.
 */
const REMEMBER = 'detlio.garageBook';

async function readSwitch(): Promise<boolean> {
  const answer = await apiClient<{ garageBook?: boolean }>('/app-config', {
    auth: false,
    params: { app: 'garage', platform: Platform.OS === 'android' ? 'android' : 'ios', version: APP_VERSION },
  });
  const on = answer?.garageBook === true;
  devicePrefs.setItem(REMEMBER, on ? '1' : '0');
  return on;
}

export function useGarageBookOn(): boolean {
  const signedIn = useAuth((s) => s.user !== null);
  const query = useQuery({
    queryKey: ['app-config', 'garage-book'],
    queryFn: readSwitch,
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });
  if (query.data !== undefined) return query.data;
  return devicePrefs.getItem(REMEMBER) === '1';
}
