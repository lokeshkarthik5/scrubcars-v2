'use client'

import { useQuery } from '@tanstack/react-query'
import { loadNextFree } from '@repo/core/api/next-free'
import type { BookingType } from '@repo/core/types'
import { vendorKeys } from './use-vendors'

/**
 * A garage card's "Next free" row: asked for only once the card is on
 * screen (`enabled`), and then together with the other cards on screen
 * (loadNextFree batches them). Kept a minute, as the API's own cache header
 * says; a failure is no row, never an error on a card.
 */
export function useNextFree(vendorId: string, bookingType: BookingType, enabled: boolean) {
  return useQuery({
    queryKey: [...vendorKeys.all, 'next-free', bookingType, vendorId] as const,
    queryFn: () => loadNextFree(vendorId, bookingType),
    enabled,
    staleTime: 60_000,
    retry: false,
  })
}
