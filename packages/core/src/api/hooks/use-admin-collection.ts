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
import { collectionItemDone, collectionProgress } from '@repo/core/onboarding-marks'

/**
 * Collection lists (0059, "Send to team"). Every write refreshes the lists.
 * The Garages list (its `openCollection` and the progress cards) is read
 * again on create and close, and on the tick that finishes a garage's part
 * of a list or the list itself, not on every tick. The Today summary is
 * refreshed by AdminScope after any mutation that worked.
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
    // No timer: every create, tick and close refreshes the lists already,
    // and a poll per open tab added load the API's one connection per
    // instance couldn't spare (27 Oct).
    refetchInterval: false,
    refetchOnWindowFocus: false,
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
 * Whether ticking this item finishes its garage's part of its list, or the
 * list: the Garages list's `openCollection` then moves on or goes. Read from
 * the cached lists; unknown (not cached) counts as yes.
 */
function finishesSomething(lists: CollectionList[] | undefined, id: string): boolean {
  const list = lists?.find((l) => l.items.some((item) => item.id === id))
  if (!list) return true
  const ticked = list.items.find((item) => item.id === id)!
  // Already done (a note edited on a ticked item): nothing moves.
  if (collectionItemDone(ticked)) return false
  const after = list.items.map((item) => (item.id === id ? { ...item, status: 'collected' as const } : item))
  return (
    after.filter((item) => item.vendorId === ticked.vendorId).every(collectionItemDone) ||
    after.every(collectionItemDone)
  )
}

/**
 * Tick or untick an item. The tick shows at once in every cached list (its
 * progress too); a refusal puts it back by reading the lists again. The
 * Garages list is read again only when the tick finishes a garage's part of
 * the list or the list (which the server then closes).
 */
export function useUpdateCollectionItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCollectionItemInput }) => updateCollectionItem(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: adminCollectionKeys.lists() })
      // Before the optimistic change: the item as it was.
      const cached = queryClient
        .getQueriesData<ListsData>({ queryKey: adminCollectionKeys.lists() })
        .flatMap(([, data]) => data?.lists ?? [])
      const vendorsChange = input.status === 'collected' && finishesSomething(cached, id)
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
      return { vendorsChange }
    },
    onSettled: (_data, _error, _variables, context) => {
      void queryClient.invalidateQueries({ queryKey: adminCollectionKeys.lists() })
      // Unknown (onMutate never ran): read it again to be safe.
      if (context?.vendorsChange ?? true) {
        void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
      }
    },
  })
}

export function useCloseCollectionList() {
  const changed = useCollectionChanged()
  return useMutation({
    mutationFn: (id: string) => closeCollectionList(id),
    onSuccess: changed,
  })
}
