'use client'

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createAdminNotice,
  endAdminNotice,
  getAdminNotice,
  getNoticeAudienceCount,
  listAdminNotices,
  updateAdminNotice,
  type NoticeAudienceParams,
  type NoticeInput,
} from '@repo/core/api/admin'

/** Hierarchical, as discountKeys: one invalidation refreshes list and detail. */
export const noticeKeys = {
  all: ['notices'] as const,
  list: () => [...noticeKeys.all, 'list'] as const,
  detail: (id: string) => [...noticeKeys.all, 'detail', id] as const,
  audienceCount: (params: NoticeAudienceParams) =>
    [...noticeKeys.all, 'audience-count', params] as const,
}

/**
 * Every notice, newest first. One fetch, split into Live / Scheduled / Ended
 * on the page: the server works out each notice's state when it is read, so
 * the list refetches every minute to move a notice along as its time comes.
 */
export function useAdminNotices() {
  return useQuery({
    queryKey: noticeKeys.list(),
    queryFn: () => listAdminNotices(),
    refetchInterval: 60_000,
  })
}

export function useAdminNotice(id: string) {
  return useQuery({
    queryKey: noticeKeys.detail(id),
    queryFn: () => getAdminNotice(id),
    enabled: Boolean(id),
  })
}

/** "Reaches 14 customers". `params: null` while the window is half typed. */
export function useNoticeAudienceCount(params: NoticeAudienceParams | null) {
  return useQuery({
    queryKey: noticeKeys.audienceCount(params ?? { audience: 'all' }),
    queryFn: () => getNoticeAudienceCount(params!),
    enabled: params !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  })
}

export function useCreateNotice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: NoticeInput) => createAdminNotice(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: noticeKeys.list() })
    },
  })
}

export function useUpdateNotice(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Partial<NoticeInput>) => updateAdminNotice(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(noticeKeys.detail(id), updated)
      void queryClient.invalidateQueries({ queryKey: noticeKeys.list() })
    },
  })
}

/** "End now", from the list. The id is the variable so one hook serves every row. */
export function useEndNotice(options?: { onError?: (error: Error) => void }) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => endAdminNotice(id),
    onSuccess: (ended) => {
      queryClient.setQueryData(noticeKeys.detail(ended.id), ended)
      void queryClient.invalidateQueries({ queryKey: noticeKeys.list() })
    },
    onError: (error) => options?.onError?.(error),
  })
}
