import { runInBackground } from '../../lib/background.js'
import {
  createDocumentUpload,
  createDocumentViewUrl,
  deleteDocumentObjects,
  headDocument,
  isDocumentStorageConfigured,
} from '../../lib/document-storage.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import {
  DOCUMENT_CONTENT_TYPES,
  DOCUMENT_LABELS,
  DOCUMENT_LINK_TTL_SECONDS,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_FILES_PER_DOCUMENT,
  filesRefusal,
  isDocumentContentType,
  isDocumentKey,
  isRequiredDocument,
  progressLine,
  reviewRefusal,
  summariseDocuments,
  takesExpiry,
  uploadRefusal,
  uploadedLine,
  type DocumentContentType,
  type DocumentStatus,
  type DocumentType,
  type FilesRefusal,
  type ReviewRefusal,
  type UploadRefusal,
} from '../../lib/vendor-documents.js'
import { vendorInBin } from '../../lib/vendor-bin.js'
import {
  vendorDocumentsRepository,
  type DocumentFileRecord,
  type DocumentRecord,
  type DocumentsWork,
} from './vendor-documents.repository.js'
import type {
  AdminSubmitDocumentInput,
  DocumentUploadUrlInput,
  ReviewDocumentInput,
  SubmitDocumentInput,
} from './vendor-documents.validation.js'

const log = logger.child({ module: 'vendor-documents' })

/** The name a garage's own upload is recorded under (service media says the same). */
const GARAGE = 'garage'

// ─── Errors ──────────────────────────────────────────────────────────────────

function garageNotFound() {
  return new AppError(404, 'Garage not found', 'VENDOR_NOT_FOUND')
}

function documentNotFound() {
  return new AppError(404, 'Document not found', 'DOCUMENT_NOT_FOUND')
}

function fileNotFound() {
  return new AppError(404, 'File not found', 'DOCUMENT_FILE_NOT_FOUND')
}

const UPLOAD_REFUSALS: Record<UploadRefusal, AppError> = {
  unsupported_type: new AppError(400, 'Use a photo (JPEG, PNG or WebP) or a PDF.', 'UNSUPPORTED_DOCUMENT_TYPE'),
  too_large: new AppError(413, 'Files can be up to 10 MB.', 'DOCUMENT_TOO_LARGE'),
  empty: new AppError(400, 'That file is empty.', 'DOCUMENT_EMPTY'),
}

const FILES_REFUSALS: Record<FilesRefusal, string> = {
  no_files: 'Add a file.',
  too_many_files: 'Two files at most: the front and the back.',
  duplicate_side: 'One file for the front and one for the back.',
  no_front: 'Add the front first.',
  duplicate_file: 'The same file was added twice.',
}

function reviewRefused(refusal: ReviewRefusal) {
  switch (refusal) {
    case 'changed':
      return new AppError(
        409,
        'The garage has uploaded this document again since you opened it. Look at the new files first.',
        'DOCUMENT_CHANGED'
      )
    case 'already_approved':
      return new AppError(409, 'This document is already approved.', 'DOCUMENT_ALREADY_APPROVED')
    case 'already_rejected':
      return new AppError(409, 'This document is already rejected.', 'DOCUMENT_ALREADY_REJECTED')
  }
}

// ─── Views ───────────────────────────────────────────────────────────────────

/**
 * One document as the garage reads it: every type is listed, with `missing`
 * for one never uploaded. Files are named by id, side, type and size only:
 * no key and no URL. A link to look at one is its own request.
 */
function documentView(type: DocumentType, doc: DocumentRecord | undefined, files: DocumentFileRecord[]) {
  return {
    type,
    label: DOCUMENT_LABELS[type],
    required: isRequiredDocument(type),
    takesExpiry: takesExpiry(type),
    id: doc?.id ?? null,
    status: (doc?.status ?? 'missing') as DocumentStatus | 'missing',
    version: doc?.version ?? null,
    rejectionReason: doc?.status === 'rejected' ? doc.rejectionReason : null,
    expiresOn: doc?.expiresOn ?? null,
    submittedAt: doc?.submittedAt.toISOString() ?? null,
    reviewedAt: doc?.reviewedAt?.toISOString() ?? null,
    uploadedByDetlio: doc ? doc.uploadedBy !== GARAGE : false,
    files: files.map((file) => ({
      id: file.id,
      side: file.side,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
    })),
  }
}

/** Admin also reads who uploaded it and who reviewed it. */
function adminDocumentView(type: DocumentType, doc: DocumentRecord | undefined, files: DocumentFileRecord[]) {
  return {
    ...documentView(type, doc, files),
    uploadedBy: doc ? (doc.uploadedBy === GARAGE ? 'The garage' : doc.uploadedBy) : null,
    reviewedBy: doc?.reviewedBy ?? null,
  }
}

async function loadDocuments(reads: Pick<DocumentsWork, 'listDocuments' | 'listFiles'>, vendorId: string) {
  const docs = await reads.listDocuments(vendorId)
  const files = await reads.listFiles(docs.map((doc) => doc.id))
  const byType = new Map(docs.map((doc) => [doc.type, doc]))
  const filesOf = (doc: DocumentRecord | undefined) =>
    doc ? files.filter((file) => file.documentId === doc.id) : []
  const summary = summariseDocuments(docs)
  return { byType, filesOf, summary: { ...summary, line: progressLine(summary) } }
}

// ─── Submitting ──────────────────────────────────────────────────────────────

type Uploader =
  | { kind: 'garage'; sub: string }
  | { kind: 'admin'; sub: string; name: string; approve: boolean }

/**
 * Each file the client says it uploaded, checked against the bucket: it is
 * in this garage's folder for this type, it is there, it fits, and its type
 * is one we take and matches its extension. A file that fails after landing
 * is removed again, so nothing unchecked stays in the bucket.
 */
async function checkUploads(
  vendorId: string,
  type: DocumentType,
  files: SubmitDocumentInput['files'],
  keep: ReadonlySet<string>
) {
  const refusal = filesRefusal(files)
  if (refusal) throw new AppError(400, FILES_REFUSALS[refusal], 'DOCUMENT_FILES_INVALID')

  const checked: Array<{ side: SubmitDocumentInput['files'][number]['side']; key: string; contentType: DocumentContentType; sizeBytes: number }> = []
  for (const file of files) {
    if (!isDocumentKey(file.key, vendorId, type)) {
      throw new AppError(400, 'That upload is not for this document', 'INVALID_DOCUMENT_KEY')
    }
    const head = await headDocument(file.key)
    if (!head) {
      throw new AppError(400, 'The file did not finish uploading. Please try again.', 'DOCUMENT_UPLOAD_MISSING')
    }
    const contentType = head.contentType?.split(';')[0]?.trim().toLowerCase() ?? ''
    const extension = file.key.slice(file.key.lastIndexOf('.') + 1)
    const wrongType =
      !isDocumentContentType(contentType) || DOCUMENT_CONTENT_TYPES[contentType] !== extension
    const refused = wrongType ? 'unsupported_type' : uploadRefusal(contentType, head.sizeBytes)
    if (refused) {
      // Never one the document already holds (a retry naming its own files).
      if (!keep.has(file.key)) await deleteDocumentObjects([file.key], 'refused_upload')
      throw UPLOAD_REFUSALS[refused]
    }
    checked.push({ side: file.side, key: file.key, contentType: contentType as DocumentContentType, sizeBytes: head.sizeBytes })
  }
  return checked
}

/**
 * Writes one document's files, as the garage's own upload or the admin's
 * on its behalf, in one transaction under the garage's documents lock:
 * the row (new, or the same row a version on, back to pending unless the
 * admin approved it as they uploaded it) and its files. The replaced files'
 * objects are deleted after the commit. A request naming exactly the files
 * the document already has is a retry, and changes nothing.
 */
async function submitDocument(vendorId: string, uploader: Uploader, input: SubmitDocumentInput) {
  if (input.expiresOn && !takesExpiry(input.type)) {
    throw new AppError(400, 'Only a trade licence has an expiry date.', 'DOCUMENT_EXPIRY_NOT_ALLOWED')
  }

  const existing = await vendorDocumentsRepository.findDocumentByType(vendorId, input.type)
  const existingFiles = existing ? await vendorDocumentsRepository.listFiles([existing.id]) : []
  const keep = new Set(existingFiles.map((file) => file.storageKey))
  const sameFiles =
    existing &&
    existingFiles.length === input.files.length &&
    input.files.every((file) => keep.has(file.key))
  if (sameFiles) {
    return { document: existing, files: existingFiles, removed: [] as string[], replaced: null, retry: true }
  }

  const checked = await checkUploads(vendorId, input.type, input.files, keep)

  const approved = uploader.kind === 'admin' && uploader.approve
  const values = {
    status: (approved ? 'approved' : 'pending') as DocumentStatus,
    expiresOn: takesExpiry(input.type) ? (input.expiresOn ?? null) : null,
    uploadedBy: uploader.kind === 'admin' ? uploader.name : GARAGE,
    uploadedBySub: uploader.sub,
    reviewedBy: approved && uploader.kind === 'admin' ? uploader.name : null,
    reviewedBySub: approved ? uploader.sub : null,
    reviewedAt: approved ? new Date() : null,
  }

  const result = await vendorDocumentsRepository.transaction(async (repo) => {
    await repo.lockGarageDocuments(vendorId)
    const current = await repo.findDocumentByType(vendorId, input.type)
    const document = current
      ? await repo.resubmitDocument(current.id, values)
      : await repo.insertDocument({ vendorId, type: input.type, ...values })
    const oldKeys = current ? await repo.deleteFiles(current.id) : []
    const files = await repo.insertFiles(
      checked.map((file) => ({
        documentId: document.id,
        side: file.side,
        storageKey: file.key,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
      }))
    )
    const newKeys = new Set(checked.map((file) => file.key))
    return {
      document,
      files,
      removed: oldKeys.filter((key) => !newKeys.has(key)),
      replaced: current?.status ?? null,
      retry: false,
    }
  })

  if (result.removed.length > 0) {
    const removed = result.removed
    runInBackground('vendor_documents_replaced', () => deleteDocumentObjects(removed, 'replaced'))
  }
  log.info(
    {
      vendorId,
      documentId: result.document.id,
      type: input.type,
      version: result.document.version,
      by: uploader.kind,
      files: result.files.length,
      approved,
    },
    'document:submitted'
  )
  return result
}

// ─── The service ─────────────────────────────────────────────────────────────

export const vendorDocumentsService = {
  /** Whether the section shows, and the limits its upload form checks first. */
  config() {
    return {
      enabled: isDocumentStorageConfigured(),
      maxBytes: MAX_DOCUMENT_BYTES,
      maxFiles: MAX_FILES_PER_DOCUMENT,
      contentTypes: Object.keys(DOCUMENT_CONTENT_TYPES),
      linkSeconds: DOCUMENT_LINK_TTL_SECONDS,
    }
  },

  // ─── The garage's own (the tenant's owner seat) ────────────────────────────

  async listForGarage(vendorId: string) {
    const { byType, filesOf, summary } = await loadDocuments(vendorDocumentsRepository, vendorId)
    return {
      summary,
      documents: DOCUMENT_TYPES.map((type) => documentView(type, byType.get(type), filesOf(byType.get(type)))),
    }
  },

  async createUploadUrl(vendorId: string, input: DocumentUploadUrlInput) {
    const refused = uploadRefusal(input.contentType, input.sizeBytes)
    if (refused) throw UPLOAD_REFUSALS[refused]
    return createDocumentUpload(vendorId, input.type, input.contentType, input.sizeBytes)
  },

  async submitForGarage(vendorId: string, sub: string, input: SubmitDocumentInput) {
    const result = await submitDocument(vendorId, { kind: 'garage', sub }, input)
    // A retry of the same files has already been announced.
    if (!result.retry) alertDocumentsUploaded(vendorId, input.type, result.replaced)
    return documentView(input.type, result.document, result.files)
  },

  /** A link to one of the garage's own files, for five minutes. */
  async fileLinkForGarage(vendorId: string, documentId: string, fileId: string) {
    return fileLink(vendorId, documentId, fileId, 'garage')
  },

  // ─── Admin (super-admin) ───────────────────────────────────────────────────

  async listForAdmin(vendorId: string) {
    const garage = await vendorDocumentsRepository.findGarage(vendorId)
    if (!garage || garage.purgedAt) throw garageNotFound()
    const { byType, filesOf, summary } = await loadDocuments(vendorDocumentsRepository, vendorId)
    return {
      garage: { id: garage.id, businessName: garage.businessName, inBin: garage.deletedAt !== null },
      summary,
      documents: DOCUMENT_TYPES.map((type) =>
        adminDocumentView(type, byType.get(type), filesOf(byType.get(type)))
      ),
    }
  },

  async createUploadUrlForAdmin(vendorId: string, input: DocumentUploadUrlInput) {
    await assertWritableGarage(vendorId)
    return vendorDocumentsService.createUploadUrl(vendorId, input)
  },

  async submitForAdmin(vendorId: string, sub: string, input: AdminSubmitDocumentInput) {
    await assertWritableGarage(vendorId)
    const { actorName, approve, ...document } = input
    const result = await submitDocument(vendorId, { kind: 'admin', sub, name: actorName, approve }, document)
    return adminDocumentView(input.type, result.document, result.files)
  },

  /**
   * Approve or reject, only on the version the admin opened. A rejection's
   * reason is what the garage reads beside the document.
   */
  async review(vendorId: string, documentId: string, sub: string, input: ReviewDocumentInput) {
    await assertWritableGarage(vendorId)
    const reviewed = await vendorDocumentsRepository.transaction(async (repo) => {
      await repo.lockGarageDocuments(vendorId)
      const current = await repo.findDocument(vendorId, documentId)
      if (!current) throw documentNotFound()
      const refusal = reviewRefusal(current, input.action, input.version)
      if (refusal) throw reviewRefused(refusal)
      const row = await repo.review(vendorId, documentId, input.version, {
        status: input.action === 'approve' ? 'approved' : 'rejected',
        rejectionReason: input.action === 'reject' ? input.reason : null,
        reviewedBy: input.actorName,
        reviewedBySub: sub,
      })
      // Under the lock nothing moved since the read; this is the belt.
      if (!row) throw reviewRefused('changed')
      const files = await repo.listFiles([row.id])
      return { row, files }
    })
    log.info(
      { vendorId, documentId, type: reviewed.row.type, version: reviewed.row.version, action: input.action, by: input.actorName },
      'document:reviewed'
    )
    return adminDocumentView(reviewed.row.type, reviewed.row, reviewed.files)
  },

  async fileLinkForAdmin(vendorId: string, documentId: string, fileId: string) {
    const garage = await vendorDocumentsRepository.findGarage(vendorId)
    if (!garage || garage.purgedAt) throw garageNotFound()
    return fileLink(vendorId, documentId, fileId, 'admin')
  },
}

async function assertWritableGarage(vendorId: string) {
  const garage = await vendorDocumentsRepository.findGarage(vendorId)
  if (!garage || garage.purgedAt) throw garageNotFound()
  if (garage.deletedAt) throw vendorInBin()
  return garage
}

/**
 * The link itself: made per press for whoever the route let through (the
 * garage's owner seat, or a super-admin), returned once and never stored or
 * logged. The log line names the file by id and who asked.
 */
async function fileLink(vendorId: string, documentId: string, fileId: string, viewer: 'garage' | 'admin') {
  const file = await vendorDocumentsRepository.findFile(vendorId, documentId, fileId)
  if (!file) throw fileNotFound()
  const link = await createDocumentViewUrl(file.storageKey, file.contentType)
  log.info({ vendorId, documentId, fileId, viewer }, 'document:link_made')
  return link
}

/**
 * Tells the team a garage sent a document to check, with how many of its
 * documents now wait. After the response, and only where alerts are on.
 */
function alertDocumentsUploaded(vendorId: string, type: DocumentType, replaced: DocumentStatus | null) {
  alertOps(async () => {
    const garage = await vendorDocumentsRepository.findGarage(vendorId)
    if (!garage) return null
    return {
      kind: 'documents_uploaded' as const,
      vendorId,
      garage: garage.businessName,
      what: uploadedLine(type, replaced),
      waiting: await vendorDocumentsRepository.countPending(vendorId),
    }
  })
}
