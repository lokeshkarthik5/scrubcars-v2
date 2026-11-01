import { DOCUMENT_CONTENT_TYPES, pickedFilesProblem } from '@repo/core/vendor-documents';

import type { StatusTone } from '@/components/primitives';

/**
 * The words and little rules of Settings > Documents (apps/vendors/app/settings/documents/page.tsx),
 * kept pure so they can be tested. The rules for what may be sent are core's
 * (vendor-documents.ts: pickedFilesProblem, hints, labels).
 */
export const DOCUMENTS_OFF_TITLE = 'Documents aren’t open yet';
export const DOCUMENTS_OFF_BODY = 'Detlio will tell you when you can upload them here.';
export const DOCUMENTS_INTRO =
  'Detlio checks these. When the three required ones are approved, your documents count as checked, one of the steps to Silver. Only you and the Detlio team can open them.';
export const DOCUMENTS_CHECKED_TITLE = 'Documents checked';
export const DOCUMENTS_CHECKED_BODY = 'That step to Silver is done.';
export const UPLOAD_FAILED = 'Upload failed. Please try again.';
export const REMOVE_FAILED = 'Couldn’t remove it. Please try again.';
export const OPEN_FAILED = 'Couldn’t open the file';

/** One colour per meaning (UX audit, garage finding 7): amber only for the one to fix. */
export const STATUS_TONE: Record<'missing' | 'pending' | 'approved' | 'rejected', StatusTone> = {
  missing: 'closed',
  pending: 'progress',
  approved: 'done',
  rejected: 'attention',
};

/**
 * A label inside a sentence: "Upload bank proof", but "Upload GST certificate" and
 * "Replace owner ID", where lower-casing it all wrote "gst" and "id". Only a first word
 * that isn't an acronym loses its capital.
 */
export function inSentence(label: string): string {
  const [first = '', ...rest] = label.split(' ');
  const acronym = first.length > 1 && first === first.toUpperCase();
  return [acronym ? first : first.toLowerCase(), ...rest].join(' ');
}

/** "31 Mar 2027" from YYYY-MM-DD, read as a calendar day. */
export function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Front" and "Back" when there are two files, "File" when there is one. */
export function fileSideLabel(fileCount: number, side: 'front' | 'back'): string {
  return side === 'front' ? (fileCount > 1 ? 'Front' : 'File') : 'Back';
}

/** What a View button says to a screen reader. */
export function viewLabel(docLabel: string, fileCount: number, side: 'front' | 'back'): string {
  return `View ${docLabel}${fileCount > 1 ? `, ${side}` : ''}`;
}

/** The chosen files, as listed before they are sent: "Front: scan.pdf". */
export function pickedLine(index: number, count: number, name: string): string {
  return `${count > 1 ? (index === 0 ? 'Front: ' : 'Back: ') : ''}${name}`;
}

/** The line under Upload / Replace. */
export function uploadHint(doc: { type: string; status: string }): string {
  return (
    'A photo or PDF, up to 10 MB.' +
    // Only an ID card has two sides; a shop photo doesn't.
    (doc.type === 'owner_id' ? ' Two files if it has a front and a back.' : '') +
    (doc.status === 'approved' ? ' Replacing it sends it back for review.' : '')
  );
}

export function removePrompt(label: string): string {
  return `Remove ${inSentence(label)}? It goes back to Not uploaded and its files are deleted.`;
}

/** A file the person chose, from the Files app, the library or the camera. */
export interface PickedDocument {
  uri: string;
  name: string;
  /** What the picker called it; may be missing or generic. */
  mimeType?: string | null;
  /** Bytes, when the picker knows them. */
  size?: number | null;
}

const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  // A phone's own photo format: photo-prepare.ts sends it as JPEG, as the browser does.
  heic: 'image/jpeg',
  heif: 'image/jpeg',
};

/** The picker's type when it is one we take, else read from the name. Empty string when unknown. */
export function contentTypeOf(file: PickedDocument): string {
  const given = (file.mimeType ?? '').toLowerCase();
  if ((DOCUMENT_CONTENT_TYPES as readonly string[]).includes(given)) return given;
  if (given === 'image/jpg' || given === 'image/heic' || given === 'image/heif') return 'image/jpeg';
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? given;
}

/** core's pickedFilesProblem over the chosen files. An unknown size passes: the bytes are counted later. */
export function chosenFilesProblem(files: PickedDocument[]): string | null {
  return pickedFilesProblem(files.map((file) => ({ type: contentTypeOf(file), size: file.size ?? 1 })));
}
