'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  answerRepairQuote,
  bookRepairVisit,
  cancelMyRepairRequest,
  createRepairRequest,
  getAdminGarageRepairSetting,
  getGarageRepairQuoteCount,
  getMyRepairRequest,
  getRepairQuotesConfig,
  getRepairVisitTimes,
  listAdminRepairRequests,
  listGarageRepairQuotes,
  listMyRepairRequests,
  setAdminGarageRepairSetting,
  type AdminRepairFilter,
  type CreateRepairRequestInput,
  type RepairAnswer,
} from '@repo/core/api/repair-quotes'

/**
 * Repair & bodywork quotes (0076): the queries and writes every web app
 * uses. A failed config read counts as off, so nothing shows; it only
 * changes with a deploy, so it is kept a few minutes and never retried.
 */
export const repairQuoteKeys = {
  config: ['repair-quotes', 'config'] as const,
  mine: ['repair-quotes', 'mine'] as const,
  one: (id: string) => ['repair-quotes', 'one', id] as const,
  times: (id: string, quoteId: string) => ['repair-quotes', 'times', id, quoteId] as const,
  garage: (scope: 'open' | 'closed') => ['repair-quotes', 'garage', scope] as const,
  garageCount: ['repair-quotes', 'garage', 'count'] as const,
  admin: (filter: AdminRepairFilter) => ['repair-quotes', 'admin', filter] as const,
  adminGarage: (vendorId: string) => ['repair-quotes', 'admin-garage', vendorId] as const,
}

export function useRepairQuotesConfig(enabled = true) {
  return useQuery({
    enabled,
    queryKey: repairQuoteKeys.config,
    queryFn: getRepairQuotesConfig,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

/** Whether the feature is on, as the apps decide to show it: off until the config says on. */
export function repairQuotesOn(config: { enabled: boolean } | undefined): boolean {
  return config?.enabled === true
}

// ─── The customer ────────────────────────────────────────────────────────────

export function useMyRepairRequests(enabled = true) {
  return useQuery({ enabled, queryKey: repairQuoteKeys.mine, queryFn: async () => (await listMyRepairRequests()).items })
}

/** One request, re-read every 30 s while it is open: answers arrive. */
export function useMyRepairRequest(id: string | null) {
  return useQuery({
    enabled: id !== null,
    queryKey: repairQuoteKeys.one(id ?? 'none'),
    queryFn: () => getMyRepairRequest(id!),
    refetchInterval: (query) => (query.state.data?.state === 'open' ? 30_000 : false),
  })
}

export function useCreateRepairRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRepairRequestInput) => createRepairRequest(input),
    onSuccess: (request) => {
      queryClient.setQueryData(repairQuoteKeys.one(request.id), request)
      void queryClient.invalidateQueries({ queryKey: repairQuoteKeys.mine })
    },
  })
}

export function useCancelRepairRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cancelMyRepairRequest(id),
    onSuccess: (request) => {
      queryClient.setQueryData(repairQuoteKeys.one(request.id), request)
      void queryClient.invalidateQueries({ queryKey: repairQuoteKeys.mine })
    },
  })
}

/** The garage's next free times for the visit, asked when the sheet opens. */
export function useRepairVisitTimes(id: string, quoteId: string | null) {
  return useQuery({
    enabled: quoteId !== null,
    queryKey: repairQuoteKeys.times(id, quoteId ?? 'none'),
    queryFn: () => getRepairVisitTimes(id, quoteId!),
    staleTime: 30_000,
  })
}

export function useBookRepairVisit(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { quoteId: string; scheduledAt: string }) => bookRepairVisit(id, input.quoteId, input.scheduledAt),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['repair-quotes'] })
      void queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

// ─── The garage ──────────────────────────────────────────────────────────────

/** The garage's repair quotes, re-read every 15 s while open (they have a clock). */
export function useGarageRepairQuotes(scope: 'open' | 'closed', enabled = true) {
  return useQuery({
    enabled,
    queryKey: repairQuoteKeys.garage(scope),
    queryFn: () => listGarageRepairQuotes(scope),
    refetchInterval: scope === 'open' ? 15_000 : false,
  })
}

/** How many wait for the garage's answer: Home's badge. Off on an API without the route. */
export function useGarageRepairQuoteCount(enabled = true) {
  return useQuery({
    enabled,
    queryKey: repairQuoteKeys.garageCount,
    queryFn: getGarageRepairQuoteCount,
    refetchInterval: 30_000,
    retry: false,
  })
}

export function useAnswerRepairQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { quoteId: string; answer: RepairAnswer }) => answerRepairQuote(input.quoteId, input.answer),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['repair-quotes', 'garage'] }),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function useAdminRepairRequests(filter: AdminRepairFilter, enabled = true) {
  return useQuery({ enabled, queryKey: repairQuoteKeys.admin(filter), queryFn: () => listAdminRepairRequests(filter) })
}

export function useAdminGarageRepairSetting(vendorId: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: repairQuoteKeys.adminGarage(vendorId),
    queryFn: () => getAdminGarageRepairSetting(vendorId),
    retry: false,
  })
}

export function useSetAdminGarageRepairSetting(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => setAdminGarageRepairSetting(vendorId, enabled),
    onSuccess: (setting) => queryClient.setQueryData(repairQuoteKeys.adminGarage(vendorId), setting),
  })
}
