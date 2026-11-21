import { apiClient } from '@repo/core/api/client'
import type { ServiceTemplate, ServiceTemplateShape } from '@repo/core/service-templates'
import { signedBody } from './admin-signer'

/**
 * Service templates (0082): Settings → Service templates, "Save as template"
 * and the garage editor's "Add from template". Super-admin only. Never a
 * price: a template has none, and the API refuses one sent. A description
 * that breaks the description rules is 400 TEMPLATE_INVALID with the reason;
 * a name in use is 409 TEMPLATE_NAME_TAKEN.
 */

export type { ServiceTemplate, ServiceTemplateShape }

/** GET /admin/service-templates — every template not deleted; `onlyOn` for the editor. */
export async function listServiceTemplates(onlyOn = false) {
  return apiClient<{ templates: ServiceTemplate[] }>(`/admin/service-templates${onlyOn ? '?on=true' : ''}`)
}

/**
 * POST /admin/service-templates — Add template, or Save as template with
 * `fromVendorId` (the garage whose service it came from).
 */
export async function createServiceTemplate(input: ServiceTemplateShape & { isOn?: boolean; fromVendorId?: string }) {
  return apiClient<ServiceTemplate>('/admin/service-templates', { method: 'POST', body: signedBody(input) })
}

/** PATCH /admin/service-templates/:id — only what is sent changes. */
export async function updateServiceTemplate(id: string, input: Partial<ServiceTemplateShape> & { isOn?: boolean }) {
  return apiClient<ServiceTemplate>(`/admin/service-templates/${id}`, { method: 'PATCH', body: signedBody(input) })
}

/** PATCH /admin/service-templates/:id/on — the list's On/Off switch. */
export async function setServiceTemplateOn(id: string, on: boolean) {
  return apiClient<ServiceTemplate>(`/admin/service-templates/${id}/on`, {
    method: 'PATCH',
    body: signedBody({ on }),
  })
}

/** DELETE /admin/service-templates/:id — services added from it are untouched. */
export async function deleteServiceTemplate(id: string) {
  return apiClient<{ id: string; deleted: true }>(`/admin/service-templates/${id}`, { method: 'DELETE' })
}
