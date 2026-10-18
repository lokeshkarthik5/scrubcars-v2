'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  autoGarageArt,
  chooseGarageArt,
  generateGarageArt,
  getAdminGarage,
  getAdminGarageStats,
  giveGarageCard,
  resetGarageArt,
  updateAdminGarageCar,
  updateAdminGarageSeries,
  type GarageCarEdit,
} from '@repo/core/api/garage'
import type { SeriesStatus } from '@repo/core/garage'

export const adminGarageKeys = {
  all: ['admin-rewards', 'garage'] as const,
  overview: (seriesId: string | null) => ['admin-rewards', 'garage', 'overview', seriesId] as const,
  stats: (seriesId: string, month: string | null) => ['admin-rewards', 'garage', 'stats', seriesId, month] as const,
}

export function useAdminGarage(seriesId: string | null, enabled = true) {
  return useQuery({ enabled, queryKey: adminGarageKeys.overview(seriesId), queryFn: () => getAdminGarage(seriesId ?? undefined), retry: false })
}

export function useAdminGarageStats(seriesId: string | null, month: string | null) {
  return useQuery({
    enabled: seriesId !== null,
    queryKey: adminGarageKeys.stats(seriesId ?? '', month),
    queryFn: () => getAdminGarageStats(seriesId ?? '', month ?? undefined),
    retry: false,
  })
}

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminGarageKeys.all }) })
}

export function useUpdateGarageSeries() {
  return useInvalidating((input: { id: string; name: string; status: SeriesStatus; startsAt: string | null; endsAt: string | null; actorName: string }) =>
    updateAdminGarageSeries(input.id, { name: input.name, status: input.status, startsAt: input.startsAt, endsAt: input.endsAt, actorName: input.actorName })
  )
}

export function useUpdateGarageCar() {
  return useInvalidating((input: { id: string; car: GarageCarEdit; actorName: string }) => updateAdminGarageCar(input.id, { ...input.car, actorName: input.actorName }))
}

/** Two AI options: nothing changes until one is chosen. */
export function useGenerateGarageArt() {
  return useMutation({ mutationFn: (id: string) => generateGarageArt(id) })
}

export function useChooseGarageArt() {
  return useInvalidating((input: { id: string; key: string; otherKeys: string[]; actorName: string }) =>
    chooseGarageArt(input.id, { key: input.key, otherKeys: input.otherKeys, actorName: input.actorName })
  )
}

/** One car at a time, for the bulk fill's loop: the list refreshes when the loop ends. */
export function useAutoGarageArt() {
  return useMutation({ mutationFn: (input: { id: string; actorName: string }) => autoGarageArt(input.id, input.actorName) })
}

export function useResetGarageArt() {
  return useInvalidating((input: { id: string; actorName: string }) => resetGarageArt(input.id, input.actorName))
}

export function useGiveGarageCard() {
  return useMutation({ mutationFn: (input: { userId: string; actorName: string; reason: string }) => giveGarageCard(input.userId, { actorName: input.actorName, reason: input.reason }) })
}
