'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminDocumentsConfig,
  getAdminGarageDocuments,
  reviewAdminGarageDocument,
  uploadAdminGarageDocument,
  type DocumentReview,
  type DocumentUpload,
} from '@repo/core/api/documents'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'

/** Hierarchical, like the payouts keys: one invalidation refreshes every garage. */
export const adminDocumentKeys = {
  all: ['admin-documents'] as const,
  config: () => [...adminDocumentKeys.all, 'config'] as const,
  garage: (vendorId: string) => [...adminDocumentKeys.all, 'garage', vendorId] as const,
}

/** Whether garage documents are on (R2_DOCS_BUCKET set on the server). */
export function useAdminDocumentsConfig() {
  return useQuery({
    queryKey: adminDocumentKeys.config(),
    queryFn: getAdminDocumentsConfig,
    staleTime: 5 * 60_000,
  })
}

export function useAdminGarageDocuments(vendorId: string, enabled = true) {
  return useQuery({
    queryKey: adminDocumentKeys.garage(vendorId),
    queryFn: () => getAdminGarageDocuments(vendorId),
    enabled: Boolean(vendorId) && enabled,
  })
}

/**
 * Every write refreshes the garage's documents and marks the garage list
 * stale: its "Documents to review" chip and checklist read the same rows.
 */
function useRefresh(vendorId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminDocumentKeys.garage(vendorId) })
    void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
  }
}

export function useReviewDocument(vendorId: string) {
  const refresh = useRefresh(vendorId)
  return useMutation({
    mutationFn: ({ documentId, review }: { documentId: string; review: DocumentReview }) =>
      reviewAdminGarageDocument(vendorId, documentId, review),
    onSettled: refresh,
  })
}

export function useUploadAdminDocument(vendorId: string) {
  const refresh = useRefresh(vendorId)
  return useMutation({
    mutationFn: (input: DocumentUpload & { approve: boolean }) =>
      uploadAdminGarageDocument(vendorId, input),
    onSettled: refresh,
  })
}
