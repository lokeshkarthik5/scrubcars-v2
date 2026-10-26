'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  closeCollectionList,
  createCollectionLists,
  listCollectionLists,
  updateCollectionItem,
  type CollectionList,
  type CollectionScope,
  type CreateCollectionListsInput,
  type UpdateCollectionItemInput,
} from '@repo/core/api/admin-collection'
import { ApiError } from '@repo/core/api/client'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'
import { collectionProgress } from '@repo/core/onboarding-marks'

/**
 * Collection lists (0059, "Send to team"). Every write refreshes the lists
 * and the Garages list (its `openCollection` and the progress cards). The
 * Today summary is refreshed by AdminScope after any mutation that worked.
 */
export const adminCollectionKeys = {
  all: ['admin-collection'] as const,
  lists: () => [...adminCollectionKeys.all, 'list'] as const,
  list: (scope: CollectionScope, open: boolean) => [...adminCollectionKeys.lists(), scope, open] as const,
}

/** A 4xx is an answer (404: an API older than the lists); only a 5xx is tried again. */
function retryServerErrors(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false
  return failureCount < 2
}

/**
 * Lists by scope: 'mine' (the signed-in login's; none for the shared login)
 * or 'all'. Open ones by default. Refetched every minute while in view, as
 * garages fill things in and teammates tick items.
 */
export function useCollectionLists(scope: CollectionScope, open = true, enabled = true) {
  return useQuery({
    queryKey: adminCollectionKeys.list(scope, open),
    queryFn: () => listCollectionLists(scope, open),
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: retryServerErrors,
  })
}

function useCollectionChanged() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminCollectionKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
  }
}

/** One list per collector. A failed Telegram post shows as `telegramSentAt` null. */
export function useCreateCollectionLists() {
  const changed = useCollectionChanged()
  return useMutation({
    mutationFn: (input: CreateCollectionListsInput) => createCollectionLists(input),
    onSuccess: changed,
  })
}

type ListsData = { lists: CollectionList[] }

/**
 * Tick or untick an item. The tick shows at once in every cached list (its
 * progress too); a refusal puts it back by reading the lists again.
 */
export function useUpdateCollectionItem() {
  const queryClient = useQueryClient()
  const changed = useCollectionChanged()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCollectionItemInput }) => updateCollectionItem(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: adminCollectionKeys.lists() })
      queryClient.setQueriesData<ListsData>({ queryKey: adminCollectionKeys.lists() }, (data) => {
        if (!data) return data
        return {
          ...data,
          lists: data.lists.map((list) => {
            if (!list.items.some((item) => item.id === id)) return list
            const items = list.items.map((item) =>
              item.id === id
                ? { ...item, status: input.status, ...(input.note !== undefined ? { note: input.note } : {}) }
                : item
            )
            return { ...list, items, progress: collectionProgress(items) }
          }),
        }
      })
    },
    onSettled: changed,
  })
}

export function useCloseCollectionList() {
  const changed = useCollectionChanged()
  return useMutation({
    mutationFn: (id: string) => closeCollectionList(id),
    onSuccess: changed,
  })
}
