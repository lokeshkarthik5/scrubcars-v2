import { getPushConfig } from '@repo/core/api/push';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { toast } from '@/components/toast';

import { onBeforeSignOut, useAuth } from './auth';
import { devicePrefs } from './device-prefs';
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

// A new booking must ring through on Android, and 13+ asks only once a channel exists.
if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync('default', {
    name: 'Booking alerts',
    importance: Notifications.AndroidImportance.MAX,
  }).catch(() => undefined);
}

/** The banner, "Alerts: Off" and the settings switch all read this phone's one state. */
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

export type PushSupport = 'supported' | 'denied';

export interface PushDevice {
  loaded: boolean;
  /** Null when the API couldn't be asked. */
  enabled: boolean | null;
  support: PushSupport;
  subscribed: boolean;
  devices: number;
  busy: boolean;
  turnOn: () => Promise<void>;
  turnOff: () => Promise<void>;
}

/** The web's usePushDevice, for this phone: one read of the config per garage, and this phone's state. */
export function usePushDevice(): PushDevice {
  const vendorId = useAuth((s) => s.activeVendorId);
  const config = useQuery({
    queryKey: ['push', 'garage', 'config', vendorId],
    queryFn: () => getPushConfig('garage'),
    enabled: Boolean(vendorId),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [subscribed, setSubscribed] = useState(() => controller.isOn(vendorId));
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setPermission(await controller.refresh(vendorId));
    setSubscribed(controller.isOn(vendorId));
  }, [vendorId]);

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
    if (!vendorId) return;
    setBusy(true);
    try {
      const { result, devices: count } = await controller.turnOn(vendorId);
      if (result === 'on') {
        setDevices(count ?? 0);
        changed();
        toast.success('Notifications are on for this device');
      } else if (result === 'no_project') {
        toast.error("This build of the app can't get alerts.");
      } else {
        toast.error('Notifications are blocked for this app.');
      }
      setPermission(await Notifications.getPermissionsAsync().then(toState));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't turn notifications on. Try again.");
    } finally {
      setBusy(false);
    }
  }, [vendorId]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try {
      await controller.turnOff();
      changed();
      toast.success('Notifications are off for this device');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't turn notifications off. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    loaded: config.isFetched,
    enabled: config.isError ? null : (config.data?.enabled ?? null),
    support: permission === 'denied' ? 'denied' : 'supported',
    subscribed,
    devices,
    busy,
    turnOn,
    turnOff,
  };
}
