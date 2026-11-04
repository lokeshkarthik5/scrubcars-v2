import type { GarageClaim, GuaranteeConfig } from '@repo/core/api/guarantee';
import { apiClient } from '@repo/core/api/client';
import { getGarageAgreement } from '@repo/core/api/agreements';
import { getGarageRequestCount } from '@repo/core/api/booking-requests';
import { getGarageTier } from '@repo/core/api/tiers';
import type { ApiVendorProfile, ApiWorkingHours } from '@repo/core/api/types';
import { useQuery } from '@tanstack/react-query';

/**
 * Reads whose core module can't come to the phone: api/vendors.ts imports the
 * auth store and image-upload, api/guarantee.ts photo preparation, and the hooks
 * in api/hooks/use-tiers.ts the admin hooks. The same requests, copied from
 * those files, so the endpoints stay the one place they are.
 */

/** packages/core/src/api/vendors.ts */
export const getMyVendor = () => apiClient<ApiVendorProfile>('/vendors/me');
export const getWorkingHours = () => apiClient<ApiWorkingHours[]>('/vendors/me/working-hours');
export const getVendorWorkingHours = (id: string) =>
  apiClient<ApiWorkingHours[]>(`/vendors/${id}/working-hours`, { auth: false });
export const getVendorClosures = (id: string) => apiClient<string[]>(`/vendors/${id}/closures`, { auth: false });

export const pauseBookings = (reason?: string) =>
  apiClient<ApiVendorProfile>('/vendors/me/pause', { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) });
export const resumeBookings = () => apiClient<ApiVendorProfile>('/vendors/me/resume', { method: 'POST' });

/** packages/core/src/api/guarantee.ts */
const getGuaranteeConfig = () => apiClient<GuaranteeConfig>('/guarantee/config', { auth: false });
const getGarageClaims = (scope: 'open' | 'closed') =>
  apiClient<{ items: GarageClaim[]; reviewHours: number }>('/vendors/me/guarantee/claims', { params: { scope } });

/** apps/vendors/app/home/page.tsx: a ₹0 for a failed load would read as no money. */
export async function weekEarnings(): Promise<number> {
  const data = await apiClient<{ weekEarnings: number }>('/vendors/me/earnings', { params: { period: 'week' } });
  return Number(data.weekEarnings);
}

/** packages/core/src/api/hooks/use-tiers.ts */
export function useGarageTier(vendorId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['tier', 'garage', vendorId],
    queryFn: getGarageTier,
    enabled: Boolean(vendorId) && enabled,
    retry: false,
  });
}

export function useGarageAgreement(vendorId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['agreement', 'garage', vendorId],
    queryFn: getGarageAgreement,
    enabled: Boolean(vendorId) && enabled,
    retry: false,
  });
}

/** packages/core/src/api/hooks/use-booking-requests.ts */
export function useGarageRequestCount() {
  return useQuery({
    queryKey: ['requests', 'garage-count'],
    queryFn: getGarageRequestCount,
    refetchInterval: 30_000,
    retry: false,
  });
}

/** packages/core/src/api/hooks/use-guarantee.ts */
export function useGuaranteeConfig(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['guarantee', 'config'],
    queryFn: getGuaranteeConfig,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useGarageClaims(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['guarantee', 'garage', 'open'],
    queryFn: () => getGarageClaims('open'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
