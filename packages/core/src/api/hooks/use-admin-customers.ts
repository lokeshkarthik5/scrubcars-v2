'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteAdminCustomer,
  getAdminCustomer,
  getAdminCustomerDeletion,
  searchAdminCustomers,
} from '@repo/core/api/admin-customers'

/** The Customers page (10 Nov 2026). */
export const adminCustomerKeys = {
  all: ['admin-customers'] as const,
  search: (q: string) => [...adminCustomerKeys.all, 'search', q] as const,
  customer: (id: string) => [...adminCustomerKeys.all, 'customer', id] as const,
  deletion: (id: string) => [...adminCustomerKeys.all, 'deletion', id] as const,
}

/** Search as the person types: the last answer stays up while the next loads. */
export function useAdminCustomerSearch(q: string) {
  return useQuery({
    queryKey: adminCustomerKeys.search(q.trim()),
    queryFn: () => searchAdminCustomers(q),
    placeholderData: (previous) => previous,
  })
}

export function useAdminCustomer(id: string) {
  return useQuery({
    queryKey: adminCustomerKeys.customer(id),
    queryFn: () => getAdminCustomer(id),
    enabled: Boolean(id),
  })
}

/** What Delete customer account would do: read when its sheet opens, never cached. */
export function useAdminCustomerDeletion(id: string, enabled: boolean) {
  return useQuery({
    queryKey: adminCustomerKeys.deletion(id),
    queryFn: () => getAdminCustomerDeletion(id),
    enabled: enabled && Boolean(id),
    staleTime: 0,
    gcTime: 0,
  })
}

export function useDeleteAdminCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, confirmText }: { id: string; confirmText: string }) => deleteAdminCustomer(id, confirmText),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminCustomerKeys.all }),
  })
}
