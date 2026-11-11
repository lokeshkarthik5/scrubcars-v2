import { ApiError } from '@repo/core/api/client';
import { getPushConfig } from '@repo/core/api/push';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { toast } from '@repo/native-ui/toast';

import { onBeforeSignOut, useAuth } from './auth';
import { devicePrefs } from './device-prefs';
import { registerPushDevice, removePushDevice, sendPushDeviceTest } from './push-api';
import { createPushController, type PermissionState } from './push-controller';
import { errorText } from './error-text';
import { pushTestErrorOutcome, pushTestResultOutcome, TEST_FALLBACK, TEST_NOT_ON, type PushTestOutcome } from './push-test';
import { t } from '@repo/core/i18n/translate';

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

/** Before leaving a garage, while the seat can still remove its alerts. */
export async function forgetPushForGarage(vendorId: string): Promise<boolean> {
  const wasOn = await controller.forgetGarage(vendorId);
  changed();
  return wasOn;
}

/** A leave the server refused: the phone goes back on. */
export async function restorePushForGarage(vendorId: string) {
  await controller.turnOn(vendorId).catch(() => undefined);
  changed();
}

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
  /** False once the API says it has no test route (device push is off there): hide the button. */
  canTest: boolean;
  /** To this phone only: its own token is sent, never "all my phones". */
  sendTest: () => Promise<void>;
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
  const [noTestRouteFor, setNoTestRouteFor] = useState<string | null>(null);

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
        toast.success(t('Notifications are on for this device'));
      } else if (result === 'no_project') {
        toast.error(t("This build of the app can't get alerts."));
      } else {
        toast.error(t('Notifications are blocked for this app.'));
      }
      setPermission(await Notifications.getPermissionsAsync().then(toState));
    } catch (error) {
      toast.error(errorText(error, t("Couldn't turn notifications on. Try again.")));
    } finally {
      setBusy(false);
    }
  }, [vendorId]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try {
      await controller.turnOff();
      changed();
      toast.success(t('Notifications are off for this device'));
    } catch (error) {
      toast.error(errorText(error, t("Couldn't turn notifications off. Try again.")));
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    if (!vendorId) return;
    setBusy(true);
    const show = (outcome: PushTestOutcome) => {
      if (outcome.tone === 'success') toast.success(outcome.message);
      else toast.error(outcome.message);
      if (outcome.hideButton) setNoTestRouteFor(vendorId);
      if (outcome.turnOff) {
        controller.markGone(vendorId);
        setSubscribed(false);
        changed();
      }
    };
    try {
      const token = controller.tokenFor(vendorId);
      if (!token) {
        setSubscribed(false);
        toast.error(t(TEST_NOT_ON));
        return;
      }
      const { result } = await sendPushDeviceTest(token);
      show(pushTestResultOutcome(result));
    } catch (error) {
      const fallback = errorText(error, t(TEST_FALLBACK));
      show(
        error instanceof ApiError
          ? pushTestErrorOutcome(error, fallback)
          : { tone: 'error', message: fallback },
      );
    } finally {
      setBusy(false);
    }
  }, [vendorId]);

  return {
    loaded: config.isFetched,
    enabled: config.isError ? null : (config.data?.enabled ?? null),
    support: permission === 'denied' ? 'denied' : 'supported',
    subscribed,
    devices,
    busy,
    turnOn,
    turnOff,
    canTest: noTestRouteFor !== vendorId,
    sendTest,
  };
}
