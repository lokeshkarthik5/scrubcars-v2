'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCertificateShareTotals,
  getOwnCertificate,
  shareCertificate,
  stopSharingCertificate,
  updateCertificateShare,
  type CertificateShare,
} from '@repo/core/api/certificates'

export const certificateKeys = {
  all: ['service-history-certificate'] as const,
  car: (vehicleId: string) => [...certificateKeys.all, vehicleId] as const,
  adminTotals: ['admin', 'certificate-shares'] as const,
}

/** One car's certificate and its link. Off while signed out. */
export function useOwnCertificate(vehicleId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: certificateKeys.car(vehicleId),
    queryFn: () => getOwnCertificate(vehicleId),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  })
}

type ShareAction =
  | { kind: 'share'; includePhotos: boolean; expiresInDays: 7 | 30 | 90 | null }
  | { kind: 'photos'; includePhotos: boolean }
  | { kind: 'stop' }

/**
 * Share (a new link), switch photos, or stop sharing. The answer is written
 * straight into the page's data, so the link and QR code change at once;
 * the page is read again after, for its view count.
 */
export function useCertificateShare(vehicleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (action: ShareAction): Promise<CertificateShare | null> => {
      if (action.kind === 'share') {
        return shareCertificate(vehicleId, { includePhotos: action.includePhotos, expiresInDays: action.expiresInDays })
      }
      if (action.kind === 'photos') return updateCertificateShare(vehicleId, { includePhotos: action.includePhotos })
      await stopSharingCertificate(vehicleId)
      return null
    },
    onSuccess: (share) => {
      queryClient.setQueryData(certificateKeys.car(vehicleId), (old: Awaited<ReturnType<typeof getOwnCertificate>> | undefined) =>
        old ? { ...old, share } : old
      )
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: certificateKeys.car(vehicleId) }),
  })
}

/** Admin: certificates shared and viewed, all time. */
export function useCertificateShareTotals() {
  return useQuery({
    queryKey: certificateKeys.adminTotals,
    queryFn: getCertificateShareTotals,
    staleTime: 60_000,
  })
}
