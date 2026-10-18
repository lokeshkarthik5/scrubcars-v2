'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getGarageAlbum, getGaragePulls, markGaragePullsSeen } from '@repo/core/api/garage'
import type { RewardsConfig } from '@repo/core/api/rewards'

export const garageKeys = {
  all: ['rewards', 'garage'] as const,
  album: ['rewards', 'garage', 'album'] as const,
  pulls: ['rewards', 'garage', 'pulls'] as const,
}

/** On only when the API said the Garage is live; loading, failed or an older API read as off. */
export function garageLive(config: RewardsConfig | undefined): boolean {
  return config?.enabled === true && config.garage?.live === true
}

/** The album (0057). */
export function useGarageAlbum(enabled: boolean) {
  return useQuery({ queryKey: garageKeys.album, queryFn: getGarageAlbum, enabled, staleTime: 30_000 })
}

/** The latest cards, unseen first: Home's reveal and the booking page's. */
export function useGaragePulls(enabled: boolean) {
  return useQuery({ queryKey: garageKeys.pulls, queryFn: getGaragePulls, enabled, staleTime: 30_000, retry: false })
}

/** After the reveal: the cards are seen, on every device. */
export function useMarkGaragePullsSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markGaragePullsSeen,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: garageKeys.all })
    },
  })
}
