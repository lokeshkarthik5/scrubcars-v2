import { msg, t } from './i18n/translate'

/**
 * Garage documents for the apps: what each one is, what to upload, how its
 * status reads and when the documents count as checked (one of Silver's
 * steps, packages/core/src/tiers.ts). The rules
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

/**
 * The three Silver needs approved (the paper agreement was the fourth until
 * 0063). The full list: a doorstep-only garage has no shop, so for it the
 * shop photo is optional (`requiredDocumentTypes`).
 */
export const REQUIRED_DOCUMENT_TYPES = ['shop_photo', 'owner_id', 'bank_proof'] as const

/** How a garage takes bookings: the two facts that decide whether it has a shop. */
export interface DocumentModes {
  doorstepEnabled: boolean
  dropinEnabled: boolean
  /** Offers pickup & drop (the API's `pickupEnabled`): it collects cars, so it has premises. */
  pickupOffered: boolean
}

/**
 * Doorstep on, at-garage off and pickup & drop not offered: no shop to
 * photograph (owner, 1 Nov 2026). A garage that collects cars has premises.
 * The server's twin: lib/vendor-documents.ts isDoorstepOnly.
 */
export function isDoorstepOnly(modes: DocumentModes): boolean {
  return modes.doorstepEnabled && !modes.dropinEnabled && !modes.pickupOffered
}

/** The types this garage needs approved: all three, or ID and bank proof when doorstep-only. */
export function requiredDocumentTypes(modes: DocumentModes): readonly DocumentType[] {
  return isDoorstepOnly(modes)
    ? REQUIRED_DOCUMENT_TYPES.filter((type) => type !== 'shop_photo')
    : REQUIRED_DOCUMENT_TYPES
}

/**
 * Nobody uploads these any more: the signed paper agreement, replaced by
 * click to agree (0063). Old ones stay readable in admin.
 */
export const RETIRED_DOCUMENT_TYPES = ['agreement'] as const

/** What the garage portal lists and lets a garage upload. */
export const UPLOADABLE_DOCUMENT_TYPES = DOCUMENT_TYPES.filter(
  (type) => !(RETIRED_DOCUMENT_TYPES as readonly string[]).includes(type)
) as Exclude<DocumentType, (typeof RETIRED_DOCUMENT_TYPES)[number]>[]

export function isRetiredDocument(type: DocumentType): boolean {
  return (RETIRED_DOCUMENT_TYPES as readonly string[]).includes(type)
}

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  shop_photo: msg('Shop photo'),
  owner_id: msg('Owner ID'),
  bank_proof: msg('Bank proof'),
  agreement: msg('Signed agreement (old, on paper)'),
  gst_certificate: msg('GST certificate'),
  trade_licence: msg('Trade licence'),
}

/** Under each document's name: what to upload, in the garage owner's words. */
export const DOCUMENT_HINTS: Record<DocumentType, string> = {
  shop_photo: msg('A photo of the shop front with your name board showing.'),
  owner_id: msg('Your PAN card, or your Aadhaar card with the number masked. Front and back if it has two sides.'),
  bank_proof: msg('A cancelled cheque, or the passbook or statement page that shows the account we pay you into.'),
  agreement: msg('The paper agreement from before you could agree in the app. Kept for the record.'),
  gst_certificate: msg('Only if your garage is registered for GST.'),
  trade_licence: msg('Your trade licence from the corporation or panchayat, if you have one.'),
}

/**
 * Under a doorstep-only garage's shop photo, in place of the usual hint: it
 * has no shop, so this one is optional.
 */
export const SHOP_PHOTO_OPTIONAL_HINT = msg(
  'Optional. You work at customers’ doorsteps, so there may be no shop front. Add a photo of one if you have it.'
)

/** The hint under a document, which for the shop photo depends on whether it is required. */
export function documentHint(type: DocumentType, required: boolean): string {
  return t(type === 'shop_photo' && !required ? SHOP_PHOTO_OPTIONAL_HINT : DOCUMENT_HINTS[type])
}

/** The one extra line on Owner ID: an Aadhaar number must never be readable. */
export const AADHAAR_MASK_NOTE = msg('Cover the first 8 digits of an Aadhaar number')

export type DocumentStatus = 'pending' | 'approved' | 'rejected'

/** A document's chip: missing (never uploaded) and the three stored states. */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus | 'missing', string> = {
  missing: msg('Not uploaded'),
  pending: msg('Waiting for review'),
  approved: msg('Approved'),
  rejected: msg('Rejected'),
}

/** What the browser checks before asking for an upload link; the server checks again. */
export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export const DOCUMENT_ACCEPT = DOCUMENT_CONTENT_TYPES.join(',')
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const MAX_FILES_PER_DOCUMENT = 2

/** Seconds a view link works; the button says so. */
export const DOCUMENT_LINK_TTL_SECONDS = 5 * 60

export function isRequiredDocument(type: DocumentType, modes: DocumentModes): boolean {
  return requiredDocumentTypes(modes).includes(type)
}

/** Every type this garage requires approved. Optional ones never decide it. */
export function documentsVerified(
  documents: ReadonlyArray<{ type: DocumentType; status: DocumentStatus | 'missing' }>,
  modes: DocumentModes
): boolean {
  return requiredDocumentTypes(modes).every((type) =>
    documents.some((doc) => doc.type === type && doc.status === 'approved')
  )
}

/** "3 of 4 required approved". */
export function progressLine(summary: { approvedRequired: number; required: number }): string {
  return t('{done} of {count} required approved', { done: summary.approvedRequired, count: summary.required })
}

/**
 * What is wrong with the files picked for one document, before anything is
 * sent, or null: one or two files, each a photo or PDF up to 10 MB.
 */
export function pickedFilesProblem(files: ReadonlyArray<{ type: string; size: number }>): string | null {
  if (files.length === 0) return t('Pick a file.')
  if (files.length > MAX_FILES_PER_DOCUMENT) return t('Two files at most: the front and the back.')
  for (const file of files) {
    if (!(DOCUMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      return t('Use a photo (JPEG, PNG or WebP) or a PDF.')
    }
    if (file.size <= 0) return t('That file is empty.')
    if (file.size > MAX_DOCUMENT_BYTES) return t('Files can be up to 10 MB.')
  }
  return null
}

/** "PDF · 1.2 MB", "Photo · 640 KB": how a file is named on screen, never by its name. */
export function fileLine(file: { contentType: string; sizeBytes: number }): string {
  const kind = file.contentType === 'application/pdf' ? 'PDF' : t('Photo')
  const size =
    file.sizeBytes >= 1024 * 1024
      ? `${(file.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB`
  return `${kind} · ${size}`
}

/**
 * Whether the garage's owner seat may remove a document (0065), as the API
 * decides it (apps/server/src/lib/vendor-documents.ts removalRefusal): an
 * optional type, or a required one it uploaded itself that is not approved
 * yet. The approved signed agreement never. `required` is the API's answer
 * for this garage (a doorstep-only garage's shop photo is optional).
 */
export function garageCanRemove(doc: {
  type: DocumentType
  status: DocumentStatus | 'missing'
  uploadedByDetlio: boolean
  required: boolean
}): boolean {
  if (doc.status === 'missing') return false
  if (doc.type === 'agreement' && doc.status === 'approved') return false
  if (!doc.required) return true
  return !doc.uploadedByDetlio && doc.status !== 'approved'
}

/** Admin may remove any uploaded document but the approved signed agreement (0065). */
export function adminCanRemove(doc: { type: DocumentType; status: DocumentStatus | 'missing' }): boolean {
  if (doc.status === 'missing') return false
  return !(doc.type === 'agreement' && doc.status === 'approved')
}
