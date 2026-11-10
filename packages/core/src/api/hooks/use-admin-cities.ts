'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBranch,
  createCity,
  deleteCity,
  getCities,
  setOtherTowns,
  updateCity,
  type BranchInput,
  type CitiesOverview,
  type CityInput,
} from '@repo/core/api/admin-cities'
import { ApiError } from '@repo/core/api/client'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'

export const adminCityKeys = {
  all: ['admin-cities'] as const,
}

/**
 * Admin → Cities. `available: false` when the API is older than cities (a
 * 404), so the page and the garage forms can say so instead of failing.
 */
export function useAdminCities() {
  return useQuery({
    queryKey: adminCityKeys.all,
    queryFn: async (): Promise<CitiesOverview & { available: boolean }> => {
      try {
        return { ...(await getCities()), available: true }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return {
            cities: [],
            otherTowns: { label: 'Other towns', visible: true, garagesLive: 0, garagesTotal: 0, garagesHiddenWhenOff: 0 },
            available: false,
          }
        }
        throw error
      }
    },
    staleTime: 30_000,
  })
}

/**
 * Every change answers with the whole overview, so the page redraws from the
 * reply; the Garages list's Live and city columns follow it, so they are read
 * again too.
 */
function useApplyOverview() {
  const queryClient = useQueryClient()
  return (overview: CitiesOverview) => {
    queryClient.setQueryData(adminCityKeys.all, { ...overview, available: true })
    void queryClient.invalidateQueries({ queryKey: adminVendorKeys.all })
  }
}

export function useCreateCity() {
  const apply = useApplyOverview()
  return useMutation({
    mutationFn: (input: CityInput & { customersSee?: boolean }) => createCity(input),
    onSuccess: apply,
  })
}

export function useUpdateCity() {
  const apply = useApplyOverview()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CityInput> & { id: string; customersSee?: boolean; growing?: boolean }) =>
      updateCity(id, input),
    onSuccess: apply,
  })
}

export function useDeleteCity() {
  const apply = useApplyOverview()
  return useMutation({ mutationFn: (id: string) => deleteCity(id), onSuccess: apply })
}

export function useSetOtherTowns() {
  const apply = useApplyOverview()
  return useMutation({ mutationFn: (visible: boolean) => setOtherTowns(visible), onSuccess: apply })
}

/** "Add a branch…": the new garage's id, for the editor to open next. */
export function useCreateBranch(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BranchInput) => createBranch(vendorId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: adminCityKeys.all })
    },
  })
}
