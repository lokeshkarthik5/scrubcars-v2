'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acknowledgeAdminComplaint,
  closeAdminComplaint,
  getAdminComplaint,
  listAdminComplaints,
  resolveAdminComplaint,
  setAdminComplaintNote,
  type AdminComplaint,
  type AdminComplaintFilter,
} from '@repo/core/api/admin'

/** Hierarchical, as noticeKeys: one invalidation refreshes lists and detail. */
export const adminComplaintKeys = {
  all: ['admin-complaints'] as const,
  lists: () => [...adminComplaintKeys.all, 'list'] as const,
  list: (show: AdminComplaintFilter) => [...adminComplaintKeys.lists(), show] as const,
  detail: (id: string) => [...adminComplaintKeys.all, 'detail', id] as const,
}

/**
 * One filter of the Complaints tab, with every filter's count. Refetched
 * every minute: the server decides what is overdue as of when it reads, so
 * the list moves a complaint into Overdue as its time passes.
 */
export function useAdminComplaints(show: AdminComplaintFilter) {
  return useQuery({
    queryKey: adminComplaintKeys.list(show),
    queryFn: () => listAdminComplaints(show),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useAdminComplaint(id: string) {
  return useQuery({
    queryKey: adminComplaintKeys.detail(id),
    queryFn: () => getAdminComplaint(id),
    enabled: Boolean(id),
    refetchInterval: 60_000,
  })
}

/** The detail answers every action with the complaint as it is now. */
function useComplaintAction<V>(id: string, action: (variables: V) => Promise<AdminComplaint>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: action,
    onSuccess: (updated) => {
      queryClient.setQueryData(adminComplaintKeys.detail(id), updated)
      void queryClient.invalidateQueries({ queryKey: adminComplaintKeys.lists() })
    },
    onError: () => {
      // Refused because it moved on (409): show what it is now.
      void queryClient.invalidateQueries({ queryKey: adminComplaintKeys.detail(id) })
    },
  })
}

export function useAcknowledgeComplaint(id: string) {
  return useComplaintAction<void>(id, () => acknowledgeAdminComplaint(id))
}

export function useResolveComplaint(id: string) {
  return useComplaintAction<string>(id, (note) => resolveAdminComplaint(id, note))
}

export function useCloseComplaint(id: string) {
  return useComplaintAction<string | undefined>(id, (note) => closeAdminComplaint(id, note))
}

export function useSetComplaintNote(id: string) {
  return useComplaintAction<string>(id, (note) => setAdminComplaintNote(id, note))
}
