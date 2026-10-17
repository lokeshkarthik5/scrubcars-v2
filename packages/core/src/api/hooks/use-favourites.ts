'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSavedGarages, saveGarage, unsaveGarage, type SavedGarages } from '@repo/core/api/favourites'
import type { Vendor } from '@repo/core/types'

export const favouriteKeys = {
  saved: ['favourites', 'saved'] as const,
}

/**
 * The customer's saved garages. Read once and shared: the hearts on the list
 * and the garage page are coloured from it, and Saved garages lists it.
 * Off while signed out (there is nothing to read).
 */
export function useSavedGarages(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: favouriteKeys.saved,
    queryFn: getSavedGarages,
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  })
}

/**
 * The heart: saves or unsaves at once on screen, and puts it back if the
 * server says no (the cap, a garage gone, no connection). `vendor` is the
 * card being hearted, so Saved garages shows it straight away.
 */
export function useToggleSavedGarage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ vendor, save }: { vendor: Vendor; save: boolean }) =>
      save ? saveGarage(vendor.id) : unsaveGarage(vendor.id),
    onMutate: async ({ vendor, save }) => {
      await queryClient.cancelQueries({ queryKey: favouriteKeys.saved })
      const before = queryClient.getQueryData<SavedGarages>(favouriteKeys.saved)
      if (before) {
        const others = before.vendors.filter((v) => v.id !== vendor.id)
        queryClient.setQueryData<SavedGarages>(favouriteKeys.saved, {
          ...before,
          vendors: save ? [vendor, ...others] : others,
        })
      }
      return { before }
    },
    onError: (_err, _variables, context) => {
      if (context?.before) queryClient.setQueryData(favouriteKeys.saved, context.before)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: favouriteKeys.saved })
    },
  })
}
