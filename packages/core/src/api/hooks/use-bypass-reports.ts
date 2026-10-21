'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmBypassReport,
  dismissBypassReport,
  getBypassStatus,
  getDropOff,
  getGarageStrikes,
  listAdminBypassReports,
  reportBypass,
  type AdminBypassFilter,
  type ReportBypassInput,
} from '@repo/core/api/bypass-reports'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'

// ─── The customer's own ──────────────────────────────────────────────────────

export const bypassKeys = {
  all: ['bypass-reports'] as const,
  booking: (bookingId: string) => [...bypassKeys.all, 'booking', bookingId] as const,
}

/**
 * Whether this booking can be reported, and the report if it was. Shared by
 * the booking page's line and the Help sheet (one request, one cache).
 */
export function useBypassStatus(bookingId: string, enabled: boolean) {
  return useQuery({
    queryKey: bypassKeys.booking(bookingId),
    queryFn: () => getBypassStatus(bookingId),
    enabled: Boolean(bookingId) && enabled,
    staleTime: 60_000,
  })
}

/** Send a report; the booking's status is read again so the page shows it as made. */
export function useReportBypass() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ReportBypassInput) => reportBypass(input),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: bypassKeys.booking(input.bookingId) })
    },
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/** Hierarchical: one invalidation refreshes every list. */
export const adminBypassKeys = {
  all: ['admin-bypass-reports'] as const,
  lists: () => [...adminBypassKeys.all, 'list'] as const,
  list: (show: AdminBypassFilter) => [...adminBypassKeys.lists(), show] as const,
  garage: (vendorId: string) => [...adminBypassKeys.all, 'garage', vendorId] as const,
  dropOff: () => [...adminBypassKeys.all, 'drop-off'] as const,
}

export function useAdminBypassReports(show: AdminBypassFilter) {
  return useQuery({
    queryKey: adminBypassKeys.list(show),
    queryFn: () => listAdminBypassReports(show),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })
}

/**
 * Confirm or dismiss: every list (a report moves chips, a garage's strikes
 * change), the garage's own strikes and the garage list (its card's strike
 * line) are read again.
 */
function useAnswer<Input>(answer: (input: Input) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: answer,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminBypassKeys.all })
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
    },
  })
}

export function useConfirmBypassReport() {
  return useAnswer((input: { id: string; actorName: string }) =>
    confirmBypassReport(input.id, { actorName: input.actorName })
  )
}

export function useDismissBypassReport() {
  return useAnswer((input: { id: string; actorName: string; reason: string }) =>
    dismissBypassReport(input.id, { actorName: input.actorName, reason: input.reason })
  )
}

export function useGarageStrikes(vendorId: string) {
  return useQuery({
    queryKey: adminBypassKeys.garage(vendorId),
    queryFn: () => getGarageStrikes(vendorId),
    enabled: Boolean(vendorId),
  })
}

/** Computed on request on the server, so read once and kept a few minutes. */
export function useDropOff() {
  return useQuery({
    queryKey: adminBypassKeys.dropOff(),
    queryFn: getDropOff,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
