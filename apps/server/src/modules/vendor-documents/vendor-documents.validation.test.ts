import { describe, expect, test } from 'bun:test'
import {
  adminSubmitDocumentSchema,
  documentUploadUrlSchema,
  reviewDocumentSchema,
  submitDocumentSchema,
} from './vendor-documents.validation.js'

const KEY = 'vendors/e2e00000-0000-4000-8000-000000002310/documents/owner_id/0b4f6c1e-2d3a-4c5b-8e9f-0a1b2c3d4e5f.pdf'

describe('documentUploadUrlSchema', () => {
  test('a type, a photo or PDF, and its exact size', () => {
    const input = { type: 'owner_id', contentType: 'application/pdf', sizeBytes: 120_000 }
    expect<unknown>(documentUploadUrlSchema.parse(input)).toEqual(input)
  })

  test('nothing else rides along, nothing over 10 MB, no unknown types', () => {
    const input = { type: 'owner_id', contentType: 'image/jpeg', sizeBytes: 1000 }
    expect(documentUploadUrlSchema.safeParse({ ...input, vendorId: 'someone-else' }).success).toBe(false)
    expect(documentUploadUrlSchema.safeParse({ ...input, sizeBytes: 10 * 1024 * 1024 + 1 }).success).toBe(false)
    expect(documentUploadUrlSchema.safeParse({ ...input, sizeBytes: 0 }).success).toBe(false)
    expect(documentUploadUrlSchema.safeParse({ ...input, contentType: 'text/html' }).success).toBe(false)
    expect(documentUploadUrlSchema.safeParse({ ...input, type: 'passport' }).success).toBe(false)
  })
})

describe('submitDocumentSchema', () => {
  test('one or two files, and an expiry date as a real date', () => {
    expect<unknown>(submitDocumentSchema.parse({ type: 'owner_id', files: [{ side: 'front', key: KEY }] })).toEqual({
      type: 'owner_id',
      files: [{ side: 'front', key: KEY }],
    })
    expect(
      submitDocumentSchema.safeParse({
        type: 'trade_licence',
        files: [{ side: 'front', key: KEY }],
        expiresOn: '2027-03-31',
      }).success
    ).toBe(true)
    expect(
      submitDocumentSchema.safeParse({
        type: 'trade_licence',
        files: [{ side: 'front', key: KEY }],
        expiresOn: '2027-02-30',
      }).success
    ).toBe(false)
  })

  test('no files, three files, a stray field or an approval are refused from the garage', () => {
    expect(submitDocumentSchema.safeParse({ type: 'owner_id', files: [] }).success).toBe(false)
    expect(
      submitDocumentSchema.safeParse({
        type: 'owner_id',
        files: [
          { side: 'front', key: 'a' },
          { side: 'back', key: 'b' },
          { side: 'back', key: 'c' },
        ],
      }).success
    ).toBe(false)
    expect(
      submitDocumentSchema.safeParse({ type: 'owner_id', files: [{ side: 'front', key: KEY }], approve: true })
        .success
    ).toBe(false)
    expect(
      submitDocumentSchema.safeParse({ type: 'owner_id', files: [{ side: 'front', key: KEY, url: 'x' }] }).success
    ).toBe(false)
  })
})

describe('adminSubmitDocumentSchema', () => {
  test('the admin says whether they approve it as they upload it; the session signs it', () => {
    const input = { type: 'agreement', files: [{ side: 'front', key: KEY }], actorName: 'Lokesh', approve: true }
    // A typed name is ignored: adminSignedJson signs it with the session (0058).
    expect<unknown>(adminSubmitDocumentSchema.parse(input)).toEqual({ ...input, actorName: '' })
    expect(adminSubmitDocumentSchema.safeParse({ ...input, actorName: undefined }).success).toBe(true)
    expect(adminSubmitDocumentSchema.safeParse({ ...input, approve: undefined }).success).toBe(false)
  })
})

describe('reviewDocumentSchema', () => {
  test('approve with the version seen; the session signs it', () => {
    expect<unknown>(reviewDocumentSchema.parse({ action: 'approve', version: 2, actorName: 'Lokesh' })).toEqual({
      action: 'approve',
      version: 2,
      actorName: '',
    })
    expect(reviewDocumentSchema.safeParse({ action: 'approve', actorName: 'Lokesh' }).success).toBe(false)
  })

  test('a rejection must say why, in a few words the garage will read', () => {
    const reject = { action: 'reject', version: 1, actorName: 'Lokesh' }
    expect(reviewDocumentSchema.safeParse(reject).success).toBe(false)
    expect(reviewDocumentSchema.safeParse({ ...reject, reason: 'bad' }).success).toBe(false)
    expect(reviewDocumentSchema.safeParse({ ...reject, reason: 'x'.repeat(301) }).success).toBe(false)
    expect(
      reviewDocumentSchema.parse({ ...reject, reason: '  The Aadhaar number is not masked.  ' })
    ).toMatchObject({ reason: 'The Aadhaar number is not masked.' })
  })
})
