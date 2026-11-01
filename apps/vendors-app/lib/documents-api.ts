import { apiClient } from '@repo/core/api/client';
import type { DocumentStatus, DocumentType } from '@repo/core/vendor-documents';

/**
 * The garage's own side of packages/core/src/api/documents.ts, whose module imports
 * image-upload and the admin signer and so can't come to the phone. The same
 * requests; a document is sent as bytes already prepared (a photo through
 * lib/photo-prepare.ts as JPEG with its location gone, a PDF untouched) in place of
 * a browser File. Viewing asks the API for a link that works for five minutes; it is
 * opened once and never kept.
 */
export interface DocumentsConfig {
  /** False until the server has its private documents bucket: the section is hidden. */
  enabled: boolean;
  maxBytes: number;
  maxFiles: number;
  contentTypes: string[];
  linkSeconds: number;
}

export interface DocumentFile {
  id: string;
  side: 'front' | 'back';
  contentType: string;
  sizeBytes: number;
}

export interface GarageDocument {
  type: DocumentType;
  label: string;
  /** The server's answer for THIS garage: a doorstep-only garage's shop photo is optional (PR #106). */
  required: boolean;
  retired?: boolean;
  takesExpiry: boolean;
  id: string | null;
  status: DocumentStatus | 'missing';
  version: number | null;
  /** Set only while rejected: what the garage should fix. */
  rejectionReason: string | null;
  /** Trade licence only, YYYY-MM-DD. */
  expiresOn: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  uploadedByDetlio: boolean;
  files: DocumentFile[];
}

/** Worked out by the server for this garage: the screen reads these and never counts documents itself. */
export interface DocumentsSummary {
  verified: boolean;
  approvedRequired: number;
  required: number;
  toReview: number;
  missingRequired: number;
  rejected: number;
  line: string;
}

export interface GarageDocuments {
  summary: DocumentsSummary;
  documents: GarageDocument[];
}

export interface DocumentLink {
  url: string;
  expiresInSeconds: number;
}

/** One file ready to send: the first is the front, a second the back. */
export interface PreparedDocumentFile {
  bytes: Uint8Array;
  contentType: string;
}

const BASE = '/vendors/me/documents';

export const getGarageDocumentsConfig = () => apiClient<DocumentsConfig>(`${BASE}/config`);

export const getGarageDocuments = () => apiClient<GarageDocuments>(BASE);

/** Each file up to the bucket on its own signed link; then the document is sent for review. */
export async function uploadGarageDocument(input: {
  type: DocumentType;
  files: PreparedDocumentFile[];
  expiresOn?: string | null;
}): Promise<GarageDocument> {
  const sent: Array<{ side: 'front' | 'back'; key: string }> = [];
  for (const [index, file] of input.files.entries()) {
    const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string }>(`${BASE}/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ type: input.type, contentType: file.contentType, sizeBytes: file.bytes.length }),
    });
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file.bytes as unknown as BodyInit,
      headers: { 'Content-Type': file.contentType },
    });
    if (!put.ok) throw new Error('Upload failed. Please try again.');
    sent.push({ side: index === 0 ? 'front' : 'back', key });
  }
  return apiClient<GarageDocument>(BASE, {
    method: 'POST',
    body: JSON.stringify({ type: input.type, files: sent, expiresOn: input.expiresOn || null }),
  });
}

export const getGarageDocumentLink = (documentId: string, fileId: string) =>
  apiClient<DocumentLink>(`${BASE}/${documentId}/files/${fileId}/link`);

/** The owner seat removes an optional type, or its own required upload not approved yet. */
export const removeGarageDocument = (documentId: string) =>
  apiClient<GarageDocuments>(`${BASE}/${documentId}/remove`, { method: 'POST' });
