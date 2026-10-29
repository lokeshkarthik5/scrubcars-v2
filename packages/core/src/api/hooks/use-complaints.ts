'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getMyComplaints,
  raiseComplaint,
  withdrawComplaint,
  type RaiseComplaintInput,
} from '@repo/core/api/complaints'

export const complaintKeys = {
  mine: ['complaints', 'mine'] as const,
}

/**
 * My complaints, in Profile. Refetched when the app comes back to the
 * foreground: the team's answer should be there when the customer looks.
 */
export function useMyComplaints(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: complaintKeys.mine,
    queryFn: getMyComplaints,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled ?? true,
  })
}

/** Withdraw one nobody has answered yet (0066); My complaints is refreshed. */
export function useWithdrawComplaint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => withdrawComplaint(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: complaintKeys.mine })
    },
  })
}

/** Raise one; My complaints is refreshed so it is listed there at once. */
export function useRaiseComplaint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RaiseComplaintInput) => raiseComplaint(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: complaintKeys.mine })
    },
  })
}
