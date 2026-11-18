'use client'

import { useQuery } from '@tanstack/react-query'
import { getAdminBackupLast, getAdminBackupManifest } from '@repo/core/api/admin-backup'

/** Back up all garages (18 Nov 2026): owner only, so both reads wait for `enabled`. */
export const adminBackupKeys = {
  all: ['admin-backup'] as const,
  last: () => [...adminBackupKeys.all, 'last'] as const,
  manifest: () => [...adminBackupKeys.all, 'manifest'] as const,
}

/** "Last backup: 14 Nov, 9:12 pm by Mathew" under the button. */
export function useAdminBackupLast(enabled: boolean) {
  return useQuery({
    queryKey: adminBackupKeys.last(),
    queryFn: getAdminBackupLast,
    enabled,
    // An older API has no such route: no line, and no retrying a 404.
    retry: false,
  })
}

/** What the sheet lists: read each time it opens, so the counts are today's. */
export function useAdminBackupManifest(enabled: boolean) {
  return useQuery({
    queryKey: adminBackupKeys.manifest(),
    queryFn: getAdminBackupManifest,
    enabled,
    staleTime: 0,
    gcTime: 0,
  })
}
