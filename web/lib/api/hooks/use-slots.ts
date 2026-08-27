'use client'

import { useQuery } from '@tanstack/react-query'
import { getAvailableSlots } from '@/lib/api/bookings'
import { getVendorWorkingHours } from '@/lib/api/vendors'

export const slotKeys = {
  all: ['slots'] as const,
  workingHours: (vendorId: string) =>
    [...slotKeys.all, 'working-hours', vendorId] as const,
  available: (vendorId: string, serviceId: string, date: string) =>
    [...slotKeys.all, 'available', vendorId, serviceId, date] as const,
}

/**
 * The vendor's weekly opening hours, used to grey out days they are closed.
 * Long stale time — a garage's opening hours do not move during a checkout.
 */
export function useVendorWorkingHours(vendorId: string) {
  return useQuery({
    queryKey: slotKeys.workingHours(vendorId),
    queryFn: () => getVendorWorkingHours(vendorId),
    staleTime: 5 * 60_000,
  })
}

/**
 * Bookable times for one vendor/service/date.
 *
 * Keyed on the date so switching days is a fresh query rather than a mutation
 * of shared state — which is what lets the picker show a skeleton for the new
 * day instead of the previous day's times. Deliberately *not* using
 * `keepPreviousData`: stale times for the wrong date look real and clickable.
 */
export function useAvailableSlots(params: {
  vendorId: string
  serviceId: string | null
  date: string | null
}) {
  const { vendorId, serviceId, date } = params

  return useQuery({
    queryKey: slotKeys.available(vendorId, serviceId ?? '', date ?? ''),
    queryFn: () =>
      getAvailableSlots({ vendorId, serviceId: serviceId!, date: date! }),
    enabled: Boolean(serviceId && date),
    // Slots go stale as other customers book, so re-check on return to the tab.
    staleTime: 15_000,
  })
}
