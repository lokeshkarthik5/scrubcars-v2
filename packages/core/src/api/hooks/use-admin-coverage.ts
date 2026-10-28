'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPlacesAsLeads,
  createLead,
  createZone,
  getCoverage,
  getLead,
  removeLead,
  removeZone,
  savePastedLeads,
  searchPlaces,
  updateLead,
  updateZone,
  type CoverageOverview,
  type Lead,
  type UpdateLeadInput,
  type ZoneInput,
} from '@repo/core/api/admin-coverage'
import { ApiError } from '@repo/core/api/client'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'

export const coverageKeys = {
  all: ['admin-coverage'] as const,
  overview: ['admin-coverage', 'overview'] as const,
  lead: (id: string) => ['admin-coverage', 'lead', id] as const,
}

/**
 * Coverage in one read: zones, garages with their zone, leads, and which
 * finder sources are connected. A 404 (an API from before 0064) reads as
 * `available: false`, so the page can say so instead of failing.
 */
export function useCoverage() {
  return useQuery({
    queryKey: coverageKeys.overview,
    queryFn: async (): Promise<CoverageOverview & { available: boolean }> => {
      try {
        return { ...(await getCoverage()), available: true }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return {
            zones: [],
            garages: [],
            leads: [],
            finder: { google: false, ola: false },
            available: false,
          }
        }
        throw error
      }
    },
    staleTime: 30_000,
  })
}

/** One lead, for Onboard's prefill on Add garage. */
export function useLead(id: string | null) {
  return useQuery({
    queryKey: coverageKeys.lead(id ?? ''),
    queryFn: () => getLead(id!),
    enabled: Boolean(id),
    retry: false,
  })
}

function useRefreshCoverage() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: coverageKeys.all })
}

/** A changed lead put into the cached overview at once, then the overview read again. */
function usePutLead() {
  const queryClient = useQueryClient()
  return (lead: Lead) => {
    queryClient.setQueryData<CoverageOverview & { available: boolean }>(
      coverageKeys.overview,
      (data) =>
        data
          ? {
              ...data,
              leads: data.leads.map((row) => (row.id === lead.id ? lead : row)),
            }
          : data
    )
    void queryClient.invalidateQueries({ queryKey: coverageKeys.all })
  }
}

export function useCreateZone() {
  const refresh = useRefreshCoverage()
  return useMutation({
    mutationFn: (input: ZoneInput) => createZone(input),
    onSuccess: refresh,
  })
}

export function useUpdateZone() {
  const refresh = useRefreshCoverage()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<ZoneInput> & { id: string }) =>
      updateZone(id, input),
    onSuccess: refresh,
  })
}

export function useRemoveZone() {
  const refresh = useRefreshCoverage()
  return useMutation({
    mutationFn: (id: string) => removeZone(id),
    onSuccess: refresh,
  })
}

export function useCreateLead() {
  const refresh = useRefreshCoverage()
  return useMutation({ mutationFn: createLead, onSuccess: refresh })
}

export function useUpdateLead() {
  const put = usePutLead()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateLeadInput & { id: string }) =>
      updateLead(id, input),
    onSuccess: (lead) => {
      put(lead)
      // Linking a garage shows on Garages too.
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
    },
  })
}

export function useRemoveLead() {
  const refresh = useRefreshCoverage()
  return useMutation({
    mutationFn: (id: string) => removeLead(id),
    onSuccess: refresh,
  })
}

export function useSavePastedLeads() {
  const refresh = useRefreshCoverage()
  return useMutation({ mutationFn: savePastedLeads, onSuccess: refresh })
}

export function useSearchPlaces() {
  return useMutation({ mutationFn: searchPlaces })
}

export function useAddPlacesAsLeads() {
  const refresh = useRefreshCoverage()
  return useMutation({ mutationFn: addPlacesAsLeads, onSuccess: refresh })
}
