'use client'

import { useQuery } from '@tanstack/react-query'
import { getAvailableSlots } from '@repo/core/api/bookings'
import { getVendorClosures, getVendorWorkingHours } from '@repo/core/api/vendors'
import type { BookingType } from '@repo/core/types'

export const slotKeys = {
  all: ['slots'] as const,
  workingHours: (vendorId: string) =>
    [...slotKeys.all, 'working-hours', vendorId] as const,
  closures: (vendorId: string) =>
    [...slotKeys.all, 'closures', vendorId] as const,
  available: (
    vendorId: string,
    serviceIds: string[],
    date: string,
    bookingType: BookingType,
    rescheduleOf: string | null = null
  ) =>
    [...slotKeys.all, 'available', vendorId, serviceIds.join(','), date, bookingType, rescheduleOf] as const,
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
 * The garage's upcoming holidays (IST dates), greyed out alongside its weekly
 * off days. Shorter stale time than the hours: an owner can mark a holiday at
 * any moment, though the slot list is the real check either way.
 */
export function useVendorClosures(vendorId: string) {
  return useQuery({
    queryKey: slotKeys.closures(vendorId),
    queryFn: () => getVendorClosures(vendorId),
    staleTime: 60_000,
  })
}

/**
 * Bookable times for one vendor/date and a set of services.
 *
 * Keyed on every service, not just the first: adding a service lengthens the
 * block that has to fit, so the answer genuinely changes.
 *
 * Keyed on the date so switching days is a fresh query rather than a mutation
 * of shared state — which is what lets the picker show a skeleton for the new
 * day instead of the previous day's times. Deliberately *not* using
 * `keepPreviousData`: stale times for the wrong date look real and clickable.
 */
export function useAvailableSlots(params: {
  vendorId: string
  serviceIds: string[]
  date: string | null
  /** In the key: doorstep and at-garage get different lists (3h vs 2h notice). */
  bookingType: BookingType
  /** The booking being moved, for a reschedule: it does not count against itself. */
  rescheduleOf?: string
}) {
  const { vendorId, serviceIds, date, bookingType, rescheduleOf } = params

  return useQuery({
    queryKey: slotKeys.available(vendorId, serviceIds, date ?? '', bookingType, rescheduleOf ?? null),
    queryFn: () =>
      getAvailableSlots({ vendorId, serviceIds, date: date!, bookingType, rescheduleOf }),
    enabled: serviceIds.length > 0 && Boolean(date),
    // Slots go stale as other customers book, so re-check on return to the tab.
    staleTime: 15_000,
  })
}
