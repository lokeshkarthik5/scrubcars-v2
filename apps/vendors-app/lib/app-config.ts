import { apiClient } from '@repo/core/api/client';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

/** GET /app-config (PR #101). */
export interface AppConfigAnswer {
  minVersion: string | null;
  latestVersion: string | null;
  updateRequired: boolean;
  storeUrl: string | null;
}

export const APP_VERSION = Constants.expoConfig?.version ?? '';

/**
 * Whether to stop at the update screen: only a clear yes from the server. No
 * answer, an error, an old server without the route, or an odd answer all let the
 * person in. There is no remembered lock either: the server is asked again each
 * time the app comes to the front.
 */
export function mustUpdate(answer: unknown): answer is AppConfigAnswer {
  return Boolean(answer && (answer as AppConfigAnswer).updateRequired === true);
}

async function readAppConfig(): Promise<unknown> {
  return apiClient<AppConfigAnswer>('/app-config', {
    auth: false,
    params: { app: 'garage', platform: Platform.OS === 'android' ? 'android' : 'ios', version: APP_VERSION },
  });
}

export function useForcedUpdate(): AppConfigAnswer | null {
  const [required, setRequired] = useState<AppConfigAnswer | null>(null);
  useEffect(() => {
    const check = () => {
      readAppConfig()
        .then((answer) => setRequired(mustUpdate(answer) ? answer : null))
        .catch(() => setRequired(null));
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, []);
  return required;
}
