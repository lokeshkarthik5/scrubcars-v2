import { apiClient } from '@repo/core/api/client';

/**
 * A phone's alerts (PR #102, migration 0067), not in packages/core yet. Until
 * that server is live these answer 404, which the switch says as a failure. The
 * token travels in the body, never the URL.
 */
export type DevicePlatform = 'ios' | 'android';

export interface DeviceStatus {
  registered: boolean;
  devices: number;
}

export const registerPushDevice = (token: string, platform: DevicePlatform) =>
  apiClient<DeviceStatus>('/vendors/me/push/devices', {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
  });

/**
 * Under the garage it was turned on in, whichever is active now: the server only
 * deletes a token for the same person and garage.
 */
export const removePushDevice = (token: string, vendorId: string) =>
  apiClient<DeviceStatus>('/vendors/me/push/devices', {
    method: 'DELETE',
    headers: { 'X-Vendor-Id': vendorId },
    body: JSON.stringify({ token }),
  });

export type PushTestResult = 'sent' | 'expired' | 'failed';

/**
 * "Send me a test notification" (PR #113). The body is always sent, because the
 * route needs a JSON body: `{ token }` for one phone, `{}` for every phone of
 * this person's turned on for the garage. This app always names its own phone,
 * so a test never lands on another of the person's phones.
 */
export const sendPushDeviceTest = (token?: string) =>
  apiClient<{ result: PushTestResult }>('/vendors/me/push/devices/test', {
    method: 'POST',
    body: JSON.stringify(token ? { token } : {}),
  });
