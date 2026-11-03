import {
  DOCUMENT_CONTENT_TYPES,
  DOCUMENT_HINTS,
  type DocumentStatus,
  type DocumentType,
  pickedFilesProblem,
} from '@repo/core/vendor-documents';

import type { StatusTone } from '@repo/native-ui/primitives';

import { MAX_SOURCE_BYTES } from './photo-limits';

/**
 * The words and little rules of Settings > Documents (apps/vendors/app/settings/documents/page.tsx),
 * kept pure so they can be tested. The rules for what may be sent are core's
 * (vendor-documents.ts: pickedFilesProblem, hints, labels). What is REQUIRED is the
 * server's answer for this garage (`required` on each document, `summary`): a
 * doorstep-only garage's shop photo is optional (PR #106), so nothing here keeps a list.
 */
export const DOCUMENTS_OFF_TITLE = 'Documents aren’t open yet';
export const DOCUMENTS_OFF_BODY = 'Detlio will tell you when you can upload them here.';
export const DOCUMENTS_INTRO =
  'Detlio checks these. When the required ones are approved, your documents count as checked, one of the steps to Silver. Only you and the Detlio team can open them.';
/** Under a doorstep-only garage's shop photo, in place of the usual hint (PR #106). */
export const SHOP_PHOTO_OPTIONAL_HINT =
  'Optional. You work at customers’ doorsteps, so there may be no shop front. Add a photo of one if you have it.';
export const DOCUMENTS_ROW_WITH_SHOP = 'Your ID, bank proof and shop photo, one of the steps to Silver';
export const DOCUMENTS_ROW_DOORSTEP_ONLY = 'Your ID and bank proof, one of the steps to Silver';
export const DOCUMENTS_CHECKED_TITLE = 'Documents checked';
export const DOCUMENTS_CHECKED_BODY = 'That step to Silver is done.';
export const UPLOAD_FAILED = 'Upload failed. Please try again.';
export const REMOVE_FAILED = 'Couldn’t remove it. Please try again.';
export const OPEN_FAILED = 'Couldn’t open the file';

/** How a garage takes bookings: the facts that decide whether it has a shop. */
export interface DocumentModes {
  doorstepEnabled: boolean;
  dropinEnabled: boolean;
  /** Offers pickup & drop (the API's `pickupEnabled`): it collects cars, so it has premises. */
  pickupOffered: boolean;
}

/**
 * Doorstep on, at-garage off and pickup & drop not offered: no shop to photograph. A local
 * copy of PR #106's isDoorstepOnly (packages/core/src/vendor-documents.ts), which this branch
 * of core doesn't have yet; the server's twin is lib/vendor-documents.ts.
 */
export function isDoorstepOnly(modes: DocumentModes): boolean {
  return modes.doorstepEnabled && !modes.dropinEnabled && !modes.pickupOffered;
}

/** The Documents row of Settings > Profile; a missing profile reads as a garage with a shop. */
export function documentsRowDescription(
  vendor: { doorstepEnabled: boolean; dropinEnabled: boolean; pickupEnabled?: boolean } | null
): string {
  return vendor &&
    isDoorstepOnly({
      doorstepEnabled: vendor.doorstepEnabled,
      dropinEnabled: vendor.dropinEnabled,
      pickupOffered: vendor.pickupEnabled === true,
    })
    ? DOCUMENTS_ROW_DOORSTEP_ONLY
    : DOCUMENTS_ROW_WITH_SHOP;
}

/** The hint under a document; the shop photo's depends on whether it is required of this garage. */
export function documentHint(type: DocumentType, required: boolean): string {
  return type === 'shop_photo' && !required ? SHOP_PHOTO_OPTIONAL_HINT : DOCUMENT_HINTS[type];
}

/**
 * Whether the owner seat may remove a document (PR #106's garageCanRemove, which takes
 * `required` from the API): an optional type may always be removed; a required one only when
 * the garage uploaded it and Detlio hasn't approved it. Never one that isn't there, nor the
 * approved signed agreement.
 */
export function canRemoveDocument(doc: {
  type: DocumentType;
  status: DocumentStatus | 'missing';
  uploadedByDetlio: boolean;
  required: boolean;
}): boolean {
  if (doc.status === 'missing') return false;
  if (doc.type === 'agreement' && doc.status === 'approved') return false;
  if (!doc.required) return true;
  return !doc.uploadedByDetlio && doc.status !== 'approved';
}

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

/** The front first, then the back: the API doesn't promise an order. */
export function sideOrdered<T extends { side: 'front' | 'back' }>(files: T[]): T[] {
  return [...files].sort((a, b) => (a.side === b.side ? 0 : a.side === 'front' ? -1 : 1));
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
  return pickedFilesProblem(
    files.map((file) => {
      const type = contentTypeOf(file);
      // A photo is shrunk before it is sent and held to its limit then; only an absurd one stops here.
      const real = file.size ?? 1;
      const size = type.startsWith('image/') && real > 0 && real <= MAX_SOURCE_BYTES ? 1 : real;
      return { type, size };
    })
  );
}
