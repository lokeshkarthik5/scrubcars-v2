'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getGarageBoardSettings,
  setColourNames,
  setColourTags,
  setGarageTarget,
  type ColourTagChange,
  type GarageBoardSettings,
} from '@repo/core/api/admin-garage-board'
import type { AdminVendor } from '@repo/core/api/admin'
import { ApiError } from '@repo/core/api/client'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'
import {
  DEFAULT_COLOUR_NAMES,
  DEFAULT_GARAGE_TARGET,
} from '@repo/core/garage-target'

export const garageBoardKeys = {
  settings: ['admin-garage-board', 'settings'] as const,
}

/** What the page shows before the API has the settings (or from an older one). */
export const DEFAULT_BOARD_SETTINGS: GarageBoardSettings = {
  target: { ...DEFAULT_GARAGE_TARGET, updatedBy: null, updatedAt: null },
  colourNames: { ...DEFAULT_COLOUR_NAMES, updatedBy: null, updatedAt: null },
}

/**
 * The target and the colours' names. A 404 (an API older than 0061) reads
 * as the defaults, not an error, so the page still shows its counter.
 */
export function useGarageBoardSettings() {
  return useQuery({
    queryKey: garageBoardKeys.settings,
    queryFn: async () => {
      try {
        return { ...(await getGarageBoardSettings()), available: true }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return { ...DEFAULT_BOARD_SETTINGS, available: false }
        }
        throw error
      }
    },
    staleTime: 60_000,
  })
}

function usePutSettings() {
  const queryClient = useQueryClient()
  return (settings: GarageBoardSettings) =>
    queryClient.setQueryData(garageBoardKeys.settings, { ...settings, available: true })
}

export function useSetGarageTarget() {
  const put = usePutSettings()
  return useMutation({ mutationFn: setGarageTarget, onSuccess: put })
}

export function useSetColourNames() {
  const put = usePutSettings()
  return useMutation({ mutationFn: setColourNames, onSuccess: put })
}

/**
 * One colour on one garage or several checked rows. The cached Garages list
 * takes the new colours at once (the rows' tint changes under the menu),
 * then refetches.
 */
export function useSetColourTags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setColourTags,
    onSuccess: ({ garages }) => {
      const byId = new Map<string, ColourTagChange>(garages.map((garage) => [garage.id, garage]))
      queryClient.setQueriesData<AdminVendor[]>({ queryKey: adminVendorKeys.lists() }, (rows) =>
        rows?.map((row) => {
          const change = byId.get(row.id)
          return change ? { ...row, ...change, id: row.id } : row
        })
      )
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
    },
  })
}
