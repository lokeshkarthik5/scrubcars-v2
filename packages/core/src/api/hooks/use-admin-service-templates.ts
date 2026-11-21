'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createServiceTemplate,
  deleteServiceTemplate,
  listServiceTemplates,
  setServiceTemplateOn,
  updateServiceTemplate,
  type ServiceTemplateShape,
} from '@repo/core/api/admin-service-templates'
import { ApiError } from '@repo/core/api/client'

export const adminServiceTemplateKeys = {
  all: ['admin-service-templates'] as const,
  /** Settings → Service templates: every one, off ones too. */
  list: () => [...adminServiceTemplateKeys.all, 'all'] as const,
  /** The garage editor's "Add from template": the switched-on ones. */
  on: () => [...adminServiceTemplateKeys.all, 'on'] as const,
}

/** Settings → Service templates. */
export function useAdminServiceTemplates() {
  return useQuery({
    queryKey: adminServiceTemplateKeys.list(),
    queryFn: async () => (await listServiceTemplates(false)).templates,
    staleTime: 30_000,
  })
}

/**
 * The garage editor's "Add from template": the switched-on templates. Not
 * retried on a 4xx (an API older than 0082 answers 404); the editor then
 * says templates couldn't load, and Add service works as ever.
 */
export function useServiceTemplatesForEditor() {
  return useQuery({
    queryKey: adminServiceTemplateKeys.on(),
    queryFn: async () => (await listServiceTemplates(true)).templates,
    staleTime: 60_000,
    retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status < 500),
  })
}

/** Every change reads both lists again: Settings and every open editor. */
function useRefresh() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: adminServiceTemplateKeys.all })
}

export function useCreateServiceTemplate() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: ServiceTemplateShape & { isOn?: boolean; fromVendorId?: string }) =>
      createServiceTemplate(input),
    onSuccess: refresh,
  })
}

export function useUpdateServiceTemplate() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<ServiceTemplateShape> & { id: string; isOn?: boolean }) =>
      updateServiceTemplate(id, input),
    onSuccess: refresh,
  })
}

export function useSetServiceTemplateOn() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setServiceTemplateOn(id, on),
    onSuccess: refresh,
  })
}

export function useDeleteServiceTemplate() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (id: string) => deleteServiceTemplate(id), onSuccess: refresh })
}
