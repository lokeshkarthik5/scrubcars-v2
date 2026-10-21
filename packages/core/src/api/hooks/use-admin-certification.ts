'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  certifyGarage,
  getAdminCertification,
  recordQualityCheck,
  revokeCertification,
  type AdminCertification,
  type QualityCheckInput,
} from '@repo/core/api/certification'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'

/** Hierarchical, like the documents keys: one invalidation refreshes every garage. */
export const adminCertificationKeys = {
  all: ['admin-certification'] as const,
  garage: (vendorId: string) => [...adminCertificationKeys.all, 'garage', vendorId] as const,
}

export function useAdminCertification(vendorId: string, enabled = true) {
  return useQuery({
    queryKey: adminCertificationKeys.garage(vendorId),
    queryFn: () => getAdminCertification(vendorId),
    enabled: Boolean(vendorId) && enabled,
  })
}

/**
 * Every write answers with the garage's certification as it now stands, so
 * the tab shows it at once; the garage list is marked stale too (its
 * Certified and Eligible chips).
 */
function useWrite<Input>(vendorId: string, write: (input: Input) => Promise<AdminCertification>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSuccess: (data) => queryClient.setQueryData(adminCertificationKeys.garage(vendorId), data),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminCertificationKeys.garage(vendorId) })
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
    },
  })
}

export function useRecordQualityCheck(vendorId: string) {
  return useWrite(vendorId, (input: QualityCheckInput) => recordQualityCheck(vendorId, input))
}

export function useCertifyGarage(vendorId: string) {
  return useWrite(vendorId, (actorName: string) => certifyGarage(vendorId, actorName))
}

export function useRevokeCertification(vendorId: string) {
  return useWrite(vendorId, (input: { actorName: string; reason: string }) => revokeCertification(vendorId, input))
}
