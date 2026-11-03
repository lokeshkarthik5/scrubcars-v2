import { apiClient } from '@repo/core/api/client';

/** A phone's alerts (PR #102). The token travels in the body, never the URL, and is never logged. */
export type DevicePlatform = 'ios' | 'android';

export interface DeviceStatus {
  registered: boolean;
  devices: number;
}

export const registerPushDevice = (token: string, platform: DevicePlatform) =>
  apiClient<DeviceStatus>('/users/me/push/devices', { method: 'POST', body: JSON.stringify({ token, platform }) });

export const removePushDevice = (token: string, signal?: AbortSignal) =>
  apiClient<DeviceStatus>('/users/me/push/devices', { method: 'DELETE', signal, body: JSON.stringify({ token }) });

export type DeviceTestResult = 'sent' | 'expired' | 'failed';

export const sendDeviceTest = () => apiClient<{ result: DeviceTestResult }>('/users/me/push/devices/test', { method: 'POST', body: JSON.stringify({}) });
