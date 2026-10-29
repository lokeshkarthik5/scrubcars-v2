/**
 * Garage documents (0043): what a garage uploads for Detlio to check, and
 * when its documents count as checked, one of Silver's steps (lib/tiers.ts,
 * 0063; before that, the "Documents verified" badge). Pure, so every rule is
 * pinned by vendor-documents.test.ts.
 *
 * Owner decision (17 Oct 2026): "A separate section where they upload their
 * documents and we verify and give them a documents-verified badge." It is
 * separate from `vendors.is_verified`, which only decides whether a garage is
 * listed (LISTED_TO_CUSTOMERS) and is untouched by anything here.
 *
 * The files are ID and bank proof, so they live in a private R2 bucket of
 * their own (lib/document-storage.ts, R2_DOCS_BUCKET) and are only ever read
 * through a link that lasts five minutes, made for the garage's owner seat or
 * a super-admin. The words the screens show are twinned in
 * packages/core/src/vendor-documents.ts (vendor-documents.parity.test.ts).
 */

/** Every kind of document, in the order the screens list them. */
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
 * The three a garage needs approved for its documents to count as checked
 * (Silver). GST and a trade licence are optional: many small garages have
 * neither. The signed paper agreement was the fourth until 0063, when the
 * click-to-agree agreement (lib/agreements.ts) replaced it.
 */
export const REQUIRED_DOCUMENT_TYPES = [
  'shop_photo',
  'owner_id',
  'bank_proof',
] as const satisfies readonly DocumentType[]

/**
 * Types nobody uploads any more: the signed paper agreement (0063, replaced
 * by click to agree). Old ones stay readable in admin, and a tombstone still
 * keeps one (Delete forever), but a new one is refused.
 */
export const RETIRED_DOCUMENT_TYPES = ['agreement'] as const satisfies readonly DocumentType[]

export type UploadableDocumentType = Exclude<DocumentType, (typeof RETIRED_DOCUMENT_TYPES)[number]>

/** What can be uploaded now, in the order the screens list them. */
export const UPLOADABLE_DOCUMENT_TYPES = DOCUMENT_TYPES.filter(
  (type) => !(RETIRED_DOCUMENT_TYPES as readonly string[]).includes(type)
) as [UploadableDocumentType, ...UploadableDocumentType[]]

export function isRetiredDocument(type: DocumentType): boolean {
  return (RETIRED_DOCUMENT_TYPES as readonly string[]).includes(type)
}

/** The names the team and the garage both use. */
export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  shop_photo: 'Shop photo',
  owner_id: 'Owner ID',
  bank_proof: 'Bank proof',
  agreement: 'Signed agreement (old, on paper)',
  gst_certificate: 'GST certificate',
  trade_licence: 'Trade licence',
}

export const DOCUMENT_STATUSES = ['pending', 'approved', 'rejected'] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

/** A file's place on its document: one side, or the front and back of a card. */
export const DOCUMENT_SIDES = ['front', 'back'] as const
export type DocumentSide = (typeof DOCUMENT_SIDES)[number]

/** Photos (re-encoded in the browser first) and PDFs, with each one's extension. */
export const DOCUMENT_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const

export type DocumentContentType = keyof typeof DOCUMENT_CONTENT_TYPES

/** 10 MB a file: a phone's PDF scan of a passbook page fits easily. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

/** Front and back, at most. */
export const MAX_FILES_PER_DOCUMENT = 2

/** How long a link to view a file works. Made per press, never stored. */
export const DOCUMENT_LINK_TTL_SECONDS = 5 * 60

/** How long the browser has to send a file once it has its upload link. */
export const DOCUMENT_UPLOAD_TTL_SECONDS = 5 * 60

/** The longest rejection reason, as the column holds it. */
export const MAX_REJECTION_REASON = 300

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value)
}

export function isRequiredDocument(type: DocumentType): boolean {
  return (REQUIRED_DOCUMENT_TYPES as readonly string[]).includes(type)
}

export function isDocumentContentType(value: string): value is DocumentContentType {
  return Object.hasOwn(DOCUMENT_CONTENT_TYPES, value)
}

/** Only a trade licence carries an expiry date. */
export function takesExpiry(type: DocumentType): boolean {
  return type === 'trade_licence'
}

// ─── Storage keys ────────────────────────────────────────────────────────────

/**
 * Where a garage's files of one type go in the private bucket. The vendor id
 * comes from resolveTenant (or the admin route's own garage), never from a
 * request body, so one garage can never be handed a key in another's folder.
 */
export function documentFolder(vendorId: string, type: DocumentType): string {
  return `vendors/${vendorId}/documents/${type}/`
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const EXTENSIONS = Object.values(DOCUMENT_CONTENT_TYPES).join('|')

/**
 * Whether a key the client sends back is one this API could have minted for
 * this garage and type: its folder, a random uuid and an allowed extension,
 * and nothing else (no `..`, no second folder).
 */
export function isDocumentKey(key: string, vendorId: string, type: DocumentType): boolean {
  const folder = documentFolder(vendorId, type)
  if (!key.startsWith(folder)) return false
  return new RegExp(`^${UUID}\\.(${EXTENSIONS})$`).test(key.slice(folder.length))
}

// ─── Upload rules ────────────────────────────────────────────────────────────

export type UploadRefusal = 'unsupported_type' | 'too_large' | 'empty'

/** Why a file may not be uploaded, before any link is made, or null. */
export function uploadRefusal(contentType: string, sizeBytes: number): UploadRefusal | null {
  if (!isDocumentContentType(contentType)) return 'unsupported_type'
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) return 'empty'
  if (sizeBytes > MAX_DOCUMENT_BYTES) return 'too_large'
  return null
}

export type FilesRefusal = 'no_files' | 'too_many_files' | 'duplicate_side' | 'no_front' | 'duplicate_file'

/**
 * Why a set of files cannot make one document, or null. One file is its
 * front; two are a front and a back, never two of one side or the same file
 * twice.
 */
export function filesRefusal(files: Array<{ side: DocumentSide; key: string }>): FilesRefusal | null {
  if (files.length === 0) return 'no_files'
  if (files.length > MAX_FILES_PER_DOCUMENT) return 'too_many_files'
  if (new Set(files.map((f) => f.key)).size !== files.length) return 'duplicate_file'
  if (new Set(files.map((f) => f.side)).size !== files.length) return 'duplicate_side'
  if (!files.some((f) => f.side === 'front')) return 'no_front'
  return null
}

// ─── Review ──────────────────────────────────────────────────────────────────

export type ReviewAction = 'approve' | 'reject'
export type ReviewRefusal = 'already_approved' | 'already_rejected' | 'changed'

/**
 * Why a review cannot be recorded, or null. The admin names the version they
 * looked at: a garage that uploaded again meanwhile has sent files nobody has
 * opened, and those are never approved by a press made on the old ones. An
 * approved document can still be rejected (something found later), and a
 * rejected one approved (a rejection by mistake); pressing the same answer
 * twice is refused, so a double click records one review.
 */
export function reviewRefusal(
  current: { status: DocumentStatus; version: number },
  action: ReviewAction,
  seenVersion: number
): ReviewRefusal | null {
  if (current.version !== seenVersion) return 'changed'
  if (action === 'approve' && current.status === 'approved') return 'already_approved'
  if (action === 'reject' && current.status === 'rejected') return 'already_rejected'
  return null
}

// ─── Remove (0065) ───────────────────────────────────────────────────────────

export type RemovalRefusal = 'signed_agreement' | 'approved_required' | 'not_garage_upload'

/**
 * Whether a document can be removed (back to "Not uploaded"), and by whom,
 * or why not (0065, owner: "everything deletable"):
 *
 * - The signed paper agreement, once approved, is the contract behind the
 *   bookings (AGENTS.md): nobody removes it.
 * - Admin removes anything else. A required type (ID, bank, shop photo) is
 *   one of Silver's steps, so the panel warns and the request must say it
 *   was warned (`requiredConfirmed`); without it, 'approved_required'.
 * - The garage's owner seat removes an optional type, and a required one it
 *   uploaded itself that Detlio has not approved yet (a wrong file).
 */
export function removalRefusal(
  doc: { type: DocumentType; status: DocumentStatus; uploadedBy: string },
  by: 'admin' | 'garage',
  requiredConfirmed = false
): RemovalRefusal | null {
  if (doc.type === 'agreement' && doc.status === 'approved') return 'signed_agreement'
  if (!isRequiredDocument(doc.type)) return null
  if (by === 'admin') return requiredConfirmed ? null : 'approved_required'
  if (doc.uploadedBy !== 'garage') return 'not_garage_upload'
  return doc.status === 'approved' ? 'approved_required' : null
}

// ─── Documents checked and the progress line ─────────────────────────────────

export interface DocumentState {
  type: DocumentType
  status: DocumentStatus
}

/**
 * **Documents checked**: every required type approved. Optional ones do not
 * count either way, so an expired trade licence never takes Silver away.
 */
export function documentsVerified(documents: readonly DocumentState[]): boolean {
  return REQUIRED_DOCUMENT_TYPES.every((type) =>
    documents.some((doc) => doc.type === type && doc.status === 'approved')
  )
}

export interface DocumentsSummary {
  verified: boolean
  /** Required types approved, of `required`. */
  approvedRequired: number
  required: number
  /** Documents (any type) waiting for Detlio to look at them. */
  toReview: number
  /** Required types never uploaded. */
  missingRequired: number
  /** Documents (any type) sent back to the garage. */
  rejected: number
}

export function summariseDocuments(documents: readonly DocumentState[]): DocumentsSummary {
  const approvedRequired = REQUIRED_DOCUMENT_TYPES.filter((type) =>
    documents.some((doc) => doc.type === type && doc.status === 'approved')
  ).length
  return {
    verified: approvedRequired === REQUIRED_DOCUMENT_TYPES.length,
    approvedRequired,
    required: REQUIRED_DOCUMENT_TYPES.length,
    toReview: documents.filter((doc) => doc.status === 'pending').length,
    missingRequired: REQUIRED_DOCUMENT_TYPES.filter(
      (type) => !documents.some((doc) => doc.type === type)
    ).length,
    rejected: documents.filter((doc) => doc.status === 'rejected').length,
  }
}

/** "3 of 4 required approved". */
export function progressLine(summary: Pick<DocumentsSummary, 'approvedRequired' | 'required'>): string {
  return `${summary.approvedRequired} of ${summary.required} required approved`
}

/**
 * Every document row grouped by garage, as the admin list and the customer
 * lists read them: one pass, no query per garage.
 */
export function summariesByVendor(
  rows: ReadonlyArray<DocumentState & { vendorId: string }>
): Map<string, DocumentsSummary> {
  const byVendor = new Map<string, DocumentState[]>()
  for (const row of rows) {
    const list = byVendor.get(row.vendorId) ?? []
    list.push(row)
    byVendor.set(row.vendorId, list)
  }
  return new Map([...byVendor].map(([vendorId, docs]) => [vendorId, summariseDocuments(docs)]))
}

/**
 * What the Telegram alert says was uploaded: "Owner ID", or "Owner ID
 * (replacing an approved one)" when a garage swaps a document the team had
 * already passed, which counts as unchecked until it is checked again.
 */
export function uploadedLine(type: DocumentType, replaced: DocumentStatus | null): string {
  const label = DOCUMENT_LABELS[type]
  if (replaced === 'approved') return `${label} (replacing an approved one)`
  if (replaced === 'rejected') return `${label} (after a rejection)`
  if (replaced === 'pending') return `${label} (replacing one not yet checked)`
  return label
}
