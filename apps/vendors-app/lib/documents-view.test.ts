/// <reference types="bun" />
import { expect, test } from 'bun:test';

import {
  chosenFilesProblem,
  contentTypeOf,
  dayLabel,
  fileSideLabel,
  inSentence,
  pickedLine,
  removePrompt,
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
