'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@repo/core/api/client'
import {
  createAdminDiscount,
  deleteAdminDiscount,
  getAdminDiscount,
  listAdminDiscounts,
  listDiscountVendorOptions,
  updateAdminDiscount,
  type AdminDiscount,
  type DiscountInput,
} from '@repo/core/api/admin'
import { validateDiscount, type AppliedDiscount } from '@repo/core/api/discounts'

/**
 * Hierarchical keys so a single `invalidateQueries({ queryKey: keys.all })`
 * after a write refreshes every list and detail at once. Filters live inside
 * the list key, which is what lets a filtered list refetch on its own.
 */
export const discountKeys = {
  all: ['discounts'] as const,
  lists: () => [...discountKeys.all, 'list'] as const,
  list: (filters: { q?: string; active?: boolean }) =>
    [...discountKeys.lists(), filters] as const,
  details: () => [...discountKeys.all, 'detail'] as const,
  detail: (id: string) => [...discountKeys.details(), id] as const,
  vendorOptions: () => [...discountKeys.all, 'vendor-options'] as const,
}

/** The message to show a user, from whatever the API threw. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/** Whether an error is the admin session being gone, not a real failure. */
export function isAuthError(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 401 || error.status === 403)
  )
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function useAdminDiscounts(filters: { q?: string; active?: boolean } = {}) {
  return useQuery({
    queryKey: discountKeys.list(filters),
    queryFn: () => listAdminDiscounts(filters),
  })
}

export function useAdminDiscount(id: string) {
  return useQuery({
    queryKey: discountKeys.detail(id),
    queryFn: () => getAdminDiscount(id),
    enabled: Boolean(id),
  })
}

/** Garage options for the vendor-scope picker. Rarely changes. */
export function useDiscountVendorOptions() {
  return useQuery({
    queryKey: discountKeys.vendorOptions(),
    queryFn: listDiscountVendorOptions,
    staleTime: 5 * 60_000,
  })
}

export function useCreateDiscount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DiscountInput) => createAdminDiscount(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: discountKeys.lists() })
    },
  })
}

export function useUpdateDiscount(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Partial<DiscountInput>) =>
      updateAdminDiscount(id, input),
    onSuccess: (updated) => {
      // Seed the detail cache from the response so reopening the editor is
      // instant, then let the lists refetch — their usage counts are derived
      // server-side and can't be patched reliably from here.
      queryClient.setQueryData(discountKeys.detail(id), updated)
      void queryClient.invalidateQueries({ queryKey: discountKeys.lists() })
    },
  })
}

/**
 * Toggling active from the list. Optimistic, because the switch should feel
 * instant and the only failure worth showing is a rollback.
 */
export function useToggleDiscountActive(options?: {
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAdminDiscount(id, { isActive }),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: discountKeys.lists() })

      const previous = queryClient.getQueriesData<AdminDiscount[]>({
        queryKey: discountKeys.lists(),
      })

      for (const [key, list] of previous) {
        if (!list) continue
        queryClient.setQueryData(
          key,
          list.map((d) => (d.id === id ? { ...d, isActive } : d))
        )
      }

      return { previous }
    },
    onError: (error, _variables, context) => {
      for (const [key, list] of context?.previous ?? []) {
        queryClient.setQueryData(key, list)
      }
      options?.onError?.(error)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: discountKeys.lists() })
    },
  })
}

export function useDeleteDiscount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteAdminDiscount(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: discountKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: discountKeys.lists() })
    },
  })
}

// ─── Customer ────────────────────────────────────────────────────────────────

/**
 * Applying a promo code at checkout.
 *
 * A mutation rather than a query: it is a POST the customer triggers by
 * pressing Apply, and the answer must never be served from cache — a code's
 * eligibility depends on usage counts that move under us. `isPending` drives
 * the button, `error` carries the server's customer-facing reason.
 */
export function useValidateDiscount() {
  return useMutation<
    AppliedDiscount,
    Error,
    { code: string; vendorId: string; serviceId: string; vehicleId: string }
  >({
    mutationFn: validateDiscount,
  })
}
