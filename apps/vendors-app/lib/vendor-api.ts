import { apiClient } from '@repo/core/api/client';
import { mapBooking } from '@repo/core/api/mappers';
import type {
  ApiBooking,
  ApiServiceArea,
  ApiVendorClosure,
  ApiVendorProfile,
  ApiWorkingHours,
} from '@repo/core/api/types';
import type { Booking } from '@repo/core/types';

/**
 * The garage's own side of packages/core/src/api/vendors.ts, whose module imports
 * image-upload and the auth store and so can't come to the phone. The same
 * requests, so the endpoints stay the one place they are. Photos and the logo take
 * the JPEG bytes lib/photo-prepare.ts made, in place of a browser File.
 * getMyVendor, getWorkingHours, pauseBookings and resumeBookings are in garage-api.ts.
 */
export type { ApiServiceArea, ApiVendorClosure };

export interface VendorProfileInput {
  whatsapp?: string;
  email?: string;
  yearsInOperation?: string;
  mapsUrl?: string;
  /** Null clears it, and the garage then covers the default 10 km. */
  doorstepRadiusKm?: number | null;
  geoSource?: 'gps' | 'map_pin';
  bays?: number;
  jobsPerDay?: number | null;
  vehicleTypes?: string[];
}

export const createVendor = (
  data: {
    businessName: string;
    phone: string;
    address: string;
    city: string;
    pincode: string;
    lat: number;
    lng: number;
  } & VendorProfileInput
) => apiClient<ApiVendorProfile>('/vendors', { method: 'POST', body: JSON.stringify(data) });

export const updateVendorSettings = (
  data: Partial<{
    businessName: string;
    phone: string;
    address: string;
    city: string;
    pincode: string;
    lat: number;
    lng: number;
  }> &
    VendorProfileInput
) => apiClient<ApiVendorProfile>('/vendors/me', { method: 'PATCH', body: JSON.stringify(data) });

export const updateVendorJobTypes = (data: {
  dropinEnabled?: boolean;
  doorstepEnabled?: boolean;
  doorstepRadiusKm?: number;
  pickupEnabled?: boolean;
  pickupRadiusKm?: number | null;
  pickupTermsAccepted?: boolean;
}) => apiClient<ApiVendorProfile>('/vendors/me/job-types', { method: 'PATCH', body: JSON.stringify(data) });

export const updateSlotInterval = (slotIntervalMins: 30 | 45 | 60) =>
  apiClient<ApiVendorProfile>('/vendors/me/slot-interval', {
    method: 'PATCH',
    body: JSON.stringify({ slotIntervalMins }),
  });

export const setVendorWorkingHours = (
  days: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[]
) => apiClient<ApiWorkingHours[]>('/vendors/me/working-hours', { method: 'PUT', body: JSON.stringify({ days }) });

/** Open on the selected days, closed on the rest (none selected means all seven). */
export async function setWorkingHoursForDays(openDays: number[], openTime: string, closeTime: string) {
  const open = openDays.length ? new Set(openDays) : new Set([0, 1, 2, 3, 4, 5, 6]);
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: openTime.length === 5 ? `${openTime}:00` : openTime,
    closeTime: closeTime.length === 5 ? `${closeTime}:00` : closeTime,
    isClosed: !open.has(dayOfWeek),
  }));
  await setVendorWorkingHours(days);
}

/** From today, or from an earlier day for a month the bookings calendar pages back to. */
export const getMyClosures = (from?: string) =>
  apiClient<ApiVendorClosure[]>('/vendors/me/closures', { ...(from && { params: { from } }) });

/** Comes back with the bookings already on that day: the owner sorts them out with the customers. */
export async function addClosure(data: { date: string; reason?: string }) {
  const result = await apiClient<{ closure: ApiVendorClosure; bookings: ApiBooking[] }>('/vendors/me/closures', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return { closure: result.closure, bookings: result.bookings.map(mapBooking) as Booking[] };
}

export const removeClosure = (id: string) =>
  apiClient<ApiVendorClosure>(`/vendors/me/closures/${id}`, { method: 'DELETE' });

export const getServiceAreas = () => apiClient<ApiServiceArea[]>('/vendors/me/service-areas');
export const createServiceArea = (data: { areaName: string; pincode: string; radiusKm?: number }) =>
  apiClient<ApiServiceArea>('/vendors/me/service-areas', { method: 'POST', body: JSON.stringify(data) });
export const deleteServiceArea = (id: string) =>
  apiClient<ApiServiceArea>(`/vendors/me/service-areas/${id}`, { method: 'DELETE' });

export interface ApiVendorPhoto {
  id: string;
  url: string;
  sortOrder: number;
  createdAt: string;
}

const putBytes = async (uploadUrl: string, bytes: Uint8Array) => {
  const sent = await fetch(uploadUrl, {
    method: 'PUT',
    body: bytes as unknown as BodyInit,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (!sent.ok) throw new Error('Upload failed. Please try again.');
};

export const setVendorLogo = (url: string) =>
  apiClient<ApiVendorProfile>('/vendors/me/logo', { method: 'PUT', body: JSON.stringify({ url }) });
export const deleteVendorLogo = () => apiClient<ApiVendorProfile>('/vendors/me/logo', { method: 'DELETE' });

/** Presign, PUT the prepared JPEG, save the public URL on the garage. */
export async function uploadVendorLogo(bytes: Uint8Array) {
  const { uploadUrl, publicUrl } = await apiClient<{ uploadUrl: string; publicUrl: string }>(
    '/vendors/me/logo/upload-url',
    { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg' }) }
  );
  await putBytes(uploadUrl, bytes);
  return setVendorLogo(publicUrl);
}

export const getMyPhotos = () => apiClient<ApiVendorPhoto[]>('/vendors/me/photos');
export const deleteVendorPhoto = (id: string) =>
  apiClient<ApiVendorPhoto>(`/vendors/me/photos/${id}`, { method: 'DELETE' });

export async function uploadVendorPhoto(bytes: Uint8Array) {
  const { uploadUrl, publicUrl } = await apiClient<{ uploadUrl: string; publicUrl: string }>(
    '/vendors/me/photos/upload-url',
    { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg' }) }
  );
  await putBytes(uploadUrl, bytes);
  return apiClient<ApiVendorPhoto>('/vendors/me/photos', { method: 'POST', body: JSON.stringify({ url: publicUrl }) });
}
