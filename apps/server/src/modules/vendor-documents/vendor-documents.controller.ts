import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { vendorDocumentsService } from './vendor-documents.service.js'
import type {
  AdminSubmitDocumentInput,
  DocumentUploadUrlInput,
  ReviewDocumentInput,
  SubmitDocumentInput,
} from './vendor-documents.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>
type VendorContext = Context<{ Variables: TenantVariables }>

/**
 * A view link and an upload link are passwords to one file for a few
 * minutes: never kept by a browser or a proxy cache.
 */
function noStore(c: Context) {
  c.header('Cache-Control', 'no-store')
}

// ─── The garage's own ────────────────────────────────────────────────────────
// The garage is always the tenant resolveTenant produced, never a parameter.

export function getGarageConfig(c: VendorContext) {
  return c.json({ success: true, data: vendorDocumentsService.config() })
}

export async function listGarageDocuments(c: VendorContext) {
  const data = await vendorDocumentsService.listForGarage(getTenant(c).vendorId)
  return c.json({ success: true, data })
}

export async function createGarageUploadUrl(c: VendorContext, input: DocumentUploadUrlInput) {
  const data = await vendorDocumentsService.createUploadUrl(getTenant(c).vendorId, input)
  noStore(c)
  return c.json({ success: true, data })
}

export async function submitGarageDocument(c: VendorContext, input: SubmitDocumentInput) {
  const data = await vendorDocumentsService.submitForGarage(getTenant(c).vendorId, c.get('auth').sub, input)
  return c.json({ success: true, data })
}

export async function getGarageFileLink(c: VendorContext, documentId: string, fileId: string) {
  const data = await vendorDocumentsService.fileLinkForGarage(getTenant(c).vendorId, documentId, fileId)
  noStore(c)
  return c.json({ success: true, data })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function getAdminConfig(c: AdminContext) {
  return c.json({ success: true, data: vendorDocumentsService.config() })
}

export async function listAdminDocuments(c: AdminContext, vendorId: string) {
  const data = await vendorDocumentsService.listForAdmin(vendorId)
  return c.json({ success: true, data })
}

export async function createAdminUploadUrl(c: AdminContext, vendorId: string, input: DocumentUploadUrlInput) {
  const data = await vendorDocumentsService.createUploadUrlForAdmin(vendorId, input)
  noStore(c)
  return c.json({ success: true, data })
}

/** The session's subject goes on the row beside the typed name. */
export async function submitAdminDocument(c: AdminContext, vendorId: string, input: AdminSubmitDocumentInput) {
  const data = await vendorDocumentsService.submitForAdmin(vendorId, c.get('auth').sub, input)
  return c.json({ success: true, data })
}

export async function reviewAdminDocument(
  c: AdminContext,
  vendorId: string,
  documentId: string,
  input: ReviewDocumentInput
) {
  const data = await vendorDocumentsService.review(vendorId, documentId, c.get('auth').sub, input)
  return c.json({ success: true, data })
}

export async function getAdminFileLink(c: AdminContext, vendorId: string, documentId: string, fileId: string) {
  const data = await vendorDocumentsService.fileLinkForAdmin(vendorId, documentId, fileId)
  noStore(c)
  return c.json({ success: true, data })
}
