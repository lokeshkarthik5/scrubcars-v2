import { getPushConfig } from '@repo/core/api/push';
import { toast } from '@repo/native-ui/toast';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { onBeforeSignOut, useAuth } from './auth';
import { devicePrefs } from './device-prefs';
import { errorText } from './error-text';
import { registerPushDevice, removePushDevice } from './push-api';
import { createPushController, type PermissionState } from './push-controller';

const toState = (result: { status: string }): PermissionState =>
  result.status === 'granted' ? 'granted' : result.status === 'denied' ? 'denied' : 'undetermined';

const platform = Platform.OS === 'android' ? 'android' : 'ios';

const controller = createPushController({
  getPermission: async () => toState(await Notifications.getPermissionsAsync()),
  requestPermission: async () => toState(await Notifications.requestPermissionsAsync()),
  getProjectId: () => {
    const fromConfig = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    return Constants.easConfig?.projectId ?? fromConfig?.eas?.projectId ?? null;
  },
  getToken: async (projectId) => (await Notifications.getExpoPushTokenAsync({ projectId })).data,
  register: (token) => registerPushDevice(token, platform),
  remove: removePushDevice,
  storage: devicePrefs,
});

onBeforeSignOut((options) => controller.forget(options));

if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync('default', {
    name: 'Booking updates',
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => undefined);
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

export const PUSH_CONFIG_KEY = ['push', 'customer', 'config'];

/** The web's usePushDevice, for this phone: the server's config and this phone's own state. */
export function usePushDevice() {
  const userId = useAuth((s) => s.user?.id ?? null);
  const config = useQuery({
    queryKey: PUSH_CONFIG_KEY,
    queryFn: () => getPushConfig('customer'),
    enabled: Boolean(userId),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [subscribed, setSubscribed] = useState(() => controller.isOn(userId));
  const [devices, setDevices] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setPermission(await controller.refresh(userId));
    setSubscribed(controller.isOn(userId));
  }, [userId]);

  // Coming back from the phone's settings may have changed the answer.
  useEffect(() => {
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    const update = () => void check();
    listeners.add(update);
    return () => {
      subscription.remove();
      listeners.delete(update);
    };
  }, [check]);

  const turnOn = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const { result, devices } = await controller.turnOn(userId);
      if (result === 'on') {
        setDevices(devices ?? null);
        changed();
        toast.success('Notifications are on for this phone');
      } else if (result === 'no_project') {
        toast.error("This build of the app can't get notifications.");
      } else {
        toast.error('Notifications are blocked for this app in the phone’s settings.');
      }
      setPermission(await Notifications.getPermissionsAsync().then(toState));
    } catch (error) {
      toast.error(errorText(error, "Couldn't turn notifications on. Try again."));
    } finally {
      setBusy(false);
    }
  }, [userId]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try {
      await controller.turnOff();
      changed();
      toast.success('Notifications are off for this phone');
    } catch (error) {
      toast.error(errorText(error, "Couldn't turn notifications off. Try again."));
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    loaded: config.isFetched,
    enabled: config.isError ? null : (config.data?.enabled ?? null),
    bookingUpdates: config.data?.bookingUpdates ?? true,
    reminders: config.data?.reminders ?? true,
    denied: permission === 'denied',
    subscribed,
    busy,
    turnOn,
    devices,
    turnOff,
  };
}
