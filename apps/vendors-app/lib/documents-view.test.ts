/// <reference types="bun" />
import { expect, test } from 'bun:test';

import {
  canRemoveDocument,
  chosenFilesProblem,
  contentTypeOf,
  dayLabel,
  DOCUMENTS_INTRO,
  documentHint,
  documentsRowDescription,
  fileSideLabel,
  inSentence,
  isDoorstepOnly,
  pickedLine,
  removePrompt,
  SHOP_PHOTO_OPTIONAL_HINT,
  sideOrdered,
  uploadHint,
  viewLabel,
} from './documents-view';

test('a label inside a sentence keeps its acronym', () => {
  expect(inSentence('Bank proof')).toBe('bank proof');
  expect(inSentence('GST certificate')).toBe('GST certificate');
  expect(inSentence('Owner ID')).toBe('owner ID');
  expect(removePrompt('Trade licence')).toBe(
    'Remove trade licence? It goes back to Not uploaded and its files are deleted.'
  );
});

test('dates read as calendar days', () => {
  expect(dayLabel('2027-03-31')).toBe('31 Mar 2027');
});

test('file sides: Front and Back only with two files', () => {
  expect(fileSideLabel(1, 'front')).toBe('File');
  expect(fileSideLabel(2, 'front')).toBe('Front');
  expect(fileSideLabel(2, 'back')).toBe('Back');
  expect(viewLabel('Owner ID', 2, 'back')).toBe('View Owner ID, back');
  expect(viewLabel('Bank proof', 1, 'front')).toBe('View Bank proof');
});

test('chosen files are listed with their side', () => {
  expect(pickedLine(0, 1, 'a.pdf')).toBe('a.pdf');
  expect(pickedLine(0, 2, 'a.jpg')).toBe('Front: a.jpg');
  expect(pickedLine(1, 2, 'b.jpg')).toBe('Back: b.jpg');
});

test('the line under Upload', () => {
  expect(uploadHint({ type: 'bank_proof', status: 'missing' })).toBe('A photo or PDF, up to 10 MB.');
  expect(uploadHint({ type: 'owner_id', status: 'approved' })).toBe(
    'A photo or PDF, up to 10 MB. Two files if it has a front and a back. Replacing it sends it back for review.'
  );
});

test('the content type comes from the picker, else the file name', () => {
  expect(contentTypeOf({ uri: 'x', name: 'a.PDF', mimeType: 'application/pdf' })).toBe('application/pdf');
  expect(contentTypeOf({ uri: 'x', name: 'scan.jpeg', mimeType: undefined })).toBe('image/jpeg');
  expect(contentTypeOf({ uri: 'x', name: 'scan.png', mimeType: 'application/octet-stream' })).toBe('image/png');
  expect(contentTypeOf({ uri: 'x', name: 'IMG_1.JPG', mimeType: 'image/jpg' })).toBe('image/jpeg');
  expect(contentTypeOf({ uri: 'x', name: 'IMG_2.HEIC', mimeType: 'image/heic' })).toBe('image/jpeg');
  expect(contentTypeOf({ uri: 'x', name: 'IMG_2.heic', mimeType: null })).toBe('image/jpeg');
  expect(contentTypeOf({ uri: 'x', name: 'notes.docx', mimeType: '' })).toBe('');
});

test('chosen files are checked the way core checks them', () => {
  const pdf = { uri: 'x', name: 'a.pdf', mimeType: 'application/pdf', size: 1000 };
  expect(chosenFilesProblem([])).toBe('Pick a file.');
  expect(chosenFilesProblem([pdf])).toBeNull();
  expect(chosenFilesProblem([pdf, pdf, pdf])).toBe('Two files at most: the front and the back.');
  expect(chosenFilesProblem([{ ...pdf, name: 'a.docx', mimeType: undefined }])).toBe(
    'Use a photo (JPEG, PNG or WebP) or a PDF.'
  );
  expect(chosenFilesProblem([{ ...pdf, size: 11 * 1024 * 1024 }])).toBe('Files can be up to 10 MB.');
  expect(chosenFilesProblem([{ ...pdf, size: 0 }])).toBe('That file is empty.');
  expect(chosenFilesProblem([{ ...pdf, size: undefined }])).toBeNull();
});

test('a phone photo over 10 MB is shrunk before it is sent, so only a PDF is held to 10 MB here', () => {
  const photo = { uri: 'x', name: 'a.jpg', mimeType: 'image/jpeg', size: 12 * 1024 * 1024 };
  expect(chosenFilesProblem([photo])).toBeNull();
  expect(chosenFilesProblem([{ ...photo, size: 0 }])).toBe('That file is empty.');
  expect(chosenFilesProblem([{ ...photo, size: 101 * 1024 * 1024 }])).toBe('Files can be up to 10 MB.');
  expect(chosenFilesProblem([{ ...photo, name: 'a.pdf', mimeType: 'application/pdf' }])).toBe('Files can be up to 10 MB.');
});

test('the front is listed before the back whatever order the API sends', () => {
  const back = { id: 'b', side: 'back' as const };
  const front = { id: 'f', side: 'front' as const };
  expect(sideOrdered([back, front]).map((file) => file.id)).toEqual(['f', 'b']);
  expect(sideOrdered([front, back]).map((file) => file.id)).toEqual(['f', 'b']);
  expect(sideOrdered([front])).toEqual([front]);
});

const SHOP = { doorstepEnabled: false, dropinEnabled: true, pickupOffered: false };

test('doorstep-only: doorstep on, at-garage off, no pickup & drop', () => {
  expect(isDoorstepOnly({ doorstepEnabled: true, dropinEnabled: false, pickupOffered: false })).toBe(true);
  expect(isDoorstepOnly(SHOP)).toBe(false);
  expect(isDoorstepOnly({ doorstepEnabled: true, dropinEnabled: true, pickupOffered: false })).toBe(false);
  // Collecting cars means premises, with or without doorstep.
  expect(isDoorstepOnly({ doorstepEnabled: true, dropinEnabled: false, pickupOffered: true })).toBe(false);
  expect(isDoorstepOnly({ doorstepEnabled: false, dropinEnabled: false, pickupOffered: true })).toBe(false);
  expect(isDoorstepOnly({ doorstepEnabled: false, dropinEnabled: false, pickupOffered: false })).toBe(false);
});

test('the Documents row says what is asked for', () => {
  const doorstep = { doorstepEnabled: true, dropinEnabled: false };
  expect(documentsRowDescription({ ...doorstep, pickupEnabled: false })).toBe(
    'Your ID and bank proof, one of the steps to Silver'
  );
  expect(documentsRowDescription(doorstep)).toBe('Your ID and bank proof, one of the steps to Silver');
  expect(documentsRowDescription({ ...doorstep, pickupEnabled: true })).toBe(
    'Your ID, bank proof and shop photo, one of the steps to Silver'
  );
  expect(documentsRowDescription({ doorstepEnabled: true, dropinEnabled: true, pickupEnabled: false })).toBe(
    'Your ID, bank proof and shop photo, one of the steps to Silver'
  );
  expect(documentsRowDescription(null)).toBe('Your ID, bank proof and shop photo, one of the steps to Silver');
});

test('the shop photo hint follows what the server requires', () => {
  expect(SHOP_PHOTO_OPTIONAL_HINT).toBe(
    'Optional. You work at customers’ doorsteps, so there may be no shop front. Add a photo of one if you have it.'
  );
  expect(documentHint('shop_photo', false)).toBe(SHOP_PHOTO_OPTIONAL_HINT);
  expect(documentHint('shop_photo', true)).not.toBe(SHOP_PHOTO_OPTIONAL_HINT);
  expect(documentHint('shop_photo', true)).toContain('shop');
  // Only the shop photo has an optional wording.
  expect(documentHint('owner_id', false)).toBe(documentHint('owner_id', true));
  expect(documentHint('gst_certificate', false)).toBe(documentHint('gst_certificate', true));
});

test('the section subtitle no longer counts the required ones', () => {
  expect(DOCUMENTS_INTRO).toBe(
    'Detlio checks these. When the required ones are approved, your documents count as checked, one of the steps to Silver. Only you and the Detlio team can open them.'
  );
});

test('a doorstep-only garage may always remove its optional shop photo, even approved', () => {
  const photo = { type: 'shop_photo' as const, uploadedByDetlio: false, required: false };
  for (const status of ['pending', 'approved', 'rejected'] as const) {
    expect(canRemoveDocument({ ...photo, status })).toBe(true);
  }
  // Even one Detlio uploaded.
  expect(canRemoveDocument({ ...photo, status: 'approved', uploadedByDetlio: true })).toBe(true);
  expect(canRemoveDocument({ ...photo, status: 'missing' })).toBe(false);
});

test('a garage with a shop removes a required document only if it uploaded it and it is not approved', () => {
  const photo = { type: 'shop_photo' as const, uploadedByDetlio: false, required: true };
  expect(canRemoveDocument({ ...photo, status: 'pending' })).toBe(true);
  expect(canRemoveDocument({ ...photo, status: 'rejected' })).toBe(true);
  expect(canRemoveDocument({ ...photo, status: 'approved' })).toBe(false);
  expect(canRemoveDocument({ ...photo, status: 'pending', uploadedByDetlio: true })).toBe(false);
  expect(canRemoveDocument({ ...photo, status: 'missing' })).toBe(false);
});

test('optional types go by what the server says, not by a list', () => {
  const gst = { type: 'gst_certificate' as const, uploadedByDetlio: true, required: false };
  expect(canRemoveDocument({ ...gst, status: 'approved' })).toBe(true);
  // The same type, required of this garage, is not removable once approved.
  expect(canRemoveDocument({ ...gst, required: true, status: 'approved' })).toBe(false);
  // The approved signed agreement never.
  expect(canRemoveDocument({ type: 'agreement', status: 'approved', uploadedByDetlio: false, required: false })).toBe(false);
});
