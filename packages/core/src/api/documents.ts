import { apiClient } from '@repo/core/api/client'
import { stripImageMetadata } from '@repo/core/image-upload'
import type { DocumentStatus, DocumentType } from '@repo/core/vendor-documents'
import { signedBody } from './admin-signer'

/**
 * Garage documents, from the garage's portal (its owner seat) and from admin.
 *
 * Uploading one document: each file is re-encoded first when it is a photo
 * (stripImageMetadata drops EXIF/GPS; a PDF goes as it is) → the API signs
 * an upload link for that exact type and size → PUT straight to the private
 * bucket → the API checks what landed and records it for review. Viewing a
 * file asks the API for a link that works for five minutes; it is opened
 * once and never kept.
 */

export interface DocumentsConfig {
  /** False until R2_DOCS_BUCKET is set on the server: the section is hidden. */
  enabled: boolean
  maxBytes: number
  maxFiles: number
  contentTypes: string[]
  linkSeconds: number
}

export interface DocumentFile {
  id: string
  side: 'front' | 'back'
  contentType: string
  sizeBytes: number
}

export interface GarageDocument {
  type: DocumentType
  label: string
  required: boolean
  /** The paper agreement (0063): readable, never uploaded again. Absent from older servers. */
  retired?: boolean
  takesExpiry: boolean
  /** Null while never uploaded. */
  id: string | null
  status: DocumentStatus | 'missing'
  /** What a review must name; null while never uploaded. */
  version: number | null
  /** Set only while rejected: what the garage should fix. */
  rejectionReason: string | null
  /** Trade licence only, YYYY-MM-DD. */
  expiresOn: string | null
  submittedAt: string | null
  reviewedAt: string | null
  /** Uploaded by Detlio on the garage's behalf. */
  uploadedByDetlio: boolean
  files: DocumentFile[]
}

/** Admin also sees who uploaded and who reviewed. */
export interface AdminGarageDocument extends GarageDocument {
  /** "The garage", or the admin's typed name. */
  uploadedBy: string | null
  reviewedBy: string | null
}

export interface DocumentsSummary {
  verified: boolean
  approvedRequired: number
  required: number
  toReview: number
  missingRequired: number
  rejected: number
  /** "3 of 4 required approved". */
  line: string
}

export interface GarageDocuments {
  summary: DocumentsSummary
  documents: GarageDocument[]
}

export interface AdminGarageDocuments {
  garage: { id: string; businessName: string; inBin: boolean }
  summary: DocumentsSummary
  documents: AdminGarageDocument[]
}

export interface DocumentLink {
  url: string
  expiresInSeconds: number
}

/** The files picked for one document: the first is the front, a second the back. */
export interface DocumentUpload {
  type: DocumentType
  files: File[]
  expiresOn?: string | null
}

async function cleaned(file: File): Promise<Blob> {
  return file.type === 'application/pdf' ? file : stripImageMetadata(file)
}

/** Each file up to the bucket on its own signed link; the keys, in order. */
async function uploadFiles(
  base: string,
  type: DocumentType,
  files: File[]
): Promise<Array<{ side: 'front' | 'back'; key: string }>> {
  const sent: Array<{ side: 'front' | 'back'; key: string }> = []
  for (const [index, file] of files.entries()) {
    const blob = await cleaned(file)
    const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string }>(`${base}/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ type, contentType: blob.type, sizeBytes: blob.size }),
    })
    const put = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } })
    if (!put.ok) throw new Error('Upload failed. Please try again.')
    sent.push({ side: index === 0 ? 'front' : 'back', key })
  }
  return sent
}

// ─── The garage's own ────────────────────────────────────────────────────────

const GARAGE_BASE = '/vendors/me/documents'

export function getGarageDocumentsConfig(): Promise<DocumentsConfig> {
  return apiClient<DocumentsConfig>(`${GARAGE_BASE}/config`)
}

export function getGarageDocuments(): Promise<GarageDocuments> {
  return apiClient<GarageDocuments>(GARAGE_BASE)
}

/** Uploads the files and sends the document for review. */
export async function uploadGarageDocument(input: DocumentUpload): Promise<GarageDocument> {
  const files = await uploadFiles(GARAGE_BASE, input.type, input.files)
  return apiClient<GarageDocument>(GARAGE_BASE, {
    method: 'POST',
    body: JSON.stringify({ type: input.type, files, expiresOn: input.expiresOn || null }),
  })
}

export function getGarageDocumentLink(documentId: string, fileId: string): Promise<DocumentLink> {
  return apiClient<DocumentLink>(`${GARAGE_BASE}/${documentId}/files/${fileId}/link`)
}

// ─── Admin ───────────────────────────────────────────────────────────────────

const adminBase = (vendorId: string) => `/admin/documents/vendors/${vendorId}`

export function getAdminDocumentsConfig(): Promise<DocumentsConfig> {
  return apiClient<DocumentsConfig>('/admin/documents/config')
}

export function getAdminGarageDocuments(vendorId: string): Promise<AdminGarageDocuments> {
  return apiClient<AdminGarageDocuments>(adminBase(vendorId))
}

/** Uploads on the garage's behalf, signed with the admin's name, approved at once if they say so. */
export async function uploadAdminGarageDocument(
  vendorId: string,
  input: DocumentUpload & { approve: boolean }
): Promise<AdminGarageDocument> {
  const files = await uploadFiles(adminBase(vendorId), input.type, input.files)
  return apiClient<AdminGarageDocument>(adminBase(vendorId), {
    method: 'POST',
    body: signedBody({
      type: input.type,
      files,
      expiresOn: input.expiresOn || null,
      approve: input.approve,
    }),
  })
}

export type DocumentReview =
  | { action: 'approve'; version: number }
  | { action: 'reject'; version: number; reason: string }

export function reviewAdminGarageDocument(
  vendorId: string,
  documentId: string,
  review: DocumentReview
): Promise<AdminGarageDocument> {
  return apiClient<AdminGarageDocument>(`${adminBase(vendorId)}/${documentId}/review`, {
    method: 'POST',
    body: signedBody(review),
  })
}

export function getAdminDocumentLink(vendorId: string, documentId: string, fileId: string): Promise<DocumentLink> {
  return apiClient<DocumentLink>(`${adminBase(vendorId)}/${documentId}/files/${fileId}/link`)
}

/**
 * Opens a file's five-minute link in a new tab. The tab is opened at the
 * press (so no popup blocker stops it) and pointed at the link once it
 * arrives; it never learns this page (opener cleared). Closed again if the
 * link could not be made.
 */
export async function openDocumentLink(getLink: () => Promise<DocumentLink>): Promise<void> {
  const tab = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null
  if (tab) tab.opener = null
  try {
    const { url } = await getLink()
    if (tab) tab.location.href = url
    else window.location.assign(url)
  } catch (error) {
    tab?.close()
    throw error
  }
}
