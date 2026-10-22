/**
 * Garage documents for the apps: what each one is, what to upload, how its
 * status reads and when the "Documents verified" badge is earned. The rules
 * are the server's (apps/server/src/lib/vendor-documents.ts); these are the
 * words and numbers the garage portal, admin and the customer app show,
 * kept equal to the server's by its vendor-documents.parity.test.ts.
 *
 * No imports: the server's parity test loads this file by path.
 */

export const DOCUMENT_TYPES = [
  'shop_photo',
  'owner_id',
  'bank_proof',
  'agreement',
  'gst_certificate',
  'trade_licence',
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

/** The four the badge needs. */
export const REQUIRED_DOCUMENT_TYPES = ['shop_photo', 'owner_id', 'bank_proof', 'agreement'] as const

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  shop_photo: 'Shop photo',
  owner_id: 'Owner ID',
  bank_proof: 'Bank proof',
  agreement: 'Signed Detlio agreement',
  gst_certificate: 'GST certificate',
  trade_licence: 'Trade licence',
}

/** Under each document's name: what to upload, in the garage owner's words. */
export const DOCUMENT_HINTS: Record<DocumentType, string> = {
  shop_photo: 'A photo of the shop front with your name board showing.',
  owner_id: 'Your PAN card, or your Aadhaar card with the number masked. Front and back if it has two sides.',
  bank_proof: 'A cancelled cheque, or the passbook or statement page that shows the account we pay you into.',
  agreement: 'Every page of your signed Detlio garage agreement. Detlio can upload it for you.',
  gst_certificate: 'Only if your garage is registered for GST.',
  trade_licence: 'Your trade licence from the corporation or panchayat, if you have one.',
}

/** The one extra line on Owner ID: an Aadhaar number must never be readable. */
export const AADHAAR_MASK_NOTE = 'Cover the first 8 digits of an Aadhaar number'

export type DocumentStatus = 'pending' | 'approved' | 'rejected'

/** A document's chip: missing (never uploaded) and the three stored states. */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus | 'missing', string> = {
  missing: 'Not uploaded',
  pending: 'Waiting for review',
  approved: 'Approved',
  rejected: 'Rejected',
}

/** The badge's words: on cards (as the icon's label) and the garage page. */
export const DOCUMENTS_VERIFIED_LABEL = 'Documents verified'

/** The garage page's one line under the badge. */
export const DOCUMENTS_VERIFIED_NOTE = "Detlio has checked this garage's ID, bank and shop documents."

/** What the browser checks before asking for an upload link; the server checks again. */
export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export const DOCUMENT_ACCEPT = DOCUMENT_CONTENT_TYPES.join(',')
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const MAX_FILES_PER_DOCUMENT = 2

/** Seconds a view link works; the button says so. */
export const DOCUMENT_LINK_TTL_SECONDS = 5 * 60

export function isRequiredDocument(type: DocumentType): boolean {
  return (REQUIRED_DOCUMENT_TYPES as readonly string[]).includes(type)
}

/** Every required type approved. Optional ones never decide it. */
export function documentsVerified(documents: ReadonlyArray<{ type: DocumentType; status: DocumentStatus | 'missing' }>): boolean {
  return REQUIRED_DOCUMENT_TYPES.every((type) =>
    documents.some((doc) => doc.type === type && doc.status === 'approved')
  )
}

/** "3 of 4 required approved". */
export function progressLine(summary: { approvedRequired: number; required: number }): string {
  return `${summary.approvedRequired} of ${summary.required} required approved`
}

/**
 * What is wrong with the files picked for one document, before anything is
 * sent, or null: one or two files, each a photo or PDF up to 10 MB.
 */
export function pickedFilesProblem(files: ReadonlyArray<{ type: string; size: number }>): string | null {
  if (files.length === 0) return 'Pick a file.'
  if (files.length > MAX_FILES_PER_DOCUMENT) return 'Two files at most: the front and the back.'
  for (const file of files) {
    if (!(DOCUMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      return 'Use a photo (JPEG, PNG or WebP) or a PDF.'
    }
    if (file.size <= 0) return 'That file is empty.'
    if (file.size > MAX_DOCUMENT_BYTES) return 'Files can be up to 10 MB.'
  }
  return null
}

/** "PDF · 1.2 MB", "Photo · 640 KB": how a file is named on screen, never by its name. */
export function fileLine(file: { contentType: string; sizeBytes: number }): string {
  const kind = file.contentType === 'application/pdf' ? 'PDF' : 'Photo'
  const size =
    file.sizeBytes >= 1024 * 1024
      ? `${(file.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB`
  return `${kind} · ${size}`
}
