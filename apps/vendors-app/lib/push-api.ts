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
