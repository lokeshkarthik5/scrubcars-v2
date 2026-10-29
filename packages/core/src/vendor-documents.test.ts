import { describe, expect, test } from 'bun:test'
import {
  AADHAAR_MASK_NOTE,
  DOCUMENT_HINTS,
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  REQUIRED_DOCUMENT_TYPES,
  UPLOADABLE_DOCUMENT_TYPES,
  documentsVerified,
  isRetiredDocument,
  fileLine,
  pickedFilesProblem,
  progressLine,
} from './vendor-documents'

describe('garage documents in the apps', () => {
  test('every type has a name and says what to upload', () => {
    for (const type of DOCUMENT_TYPES) {
      expect(DOCUMENT_LABELS[type].length).toBeGreaterThan(0)
      expect(DOCUMENT_HINTS[type].length).toBeGreaterThan(0)
    }
    expect(DOCUMENT_HINTS.owner_id).toContain('PAN')
    expect(DOCUMENT_HINTS.owner_id).toContain('Aadhaar')
    expect(AADHAAR_MASK_NOTE).toBe('Cover the first 8 digits of an Aadhaar number')
    expect(DOCUMENT_HINTS.bank_proof).toContain('cancelled cheque')
  })

  test('documents count as checked with the three required types approved, and only those', () => {
    const approved = REQUIRED_DOCUMENT_TYPES.map((type) => ({ type, status: 'approved' as const }))
    expect(documentsVerified(approved)).toBe(true)
    expect(documentsVerified(approved.slice(1))).toBe(false)
    expect(
      documentsVerified([...approved.slice(1), { type: 'shop_photo', status: 'pending' }])
    ).toBe(false)
    expect(
      documentsVerified([...approved, { type: 'trade_licence', status: 'rejected' }])
    ).toBe(true)
    expect(progressLine({ approvedRequired: 2, required: 3 })).toBe('2 of 3 required approved')
    // The paper agreement (0063) is retired: never required, never uploadable.
    expect(documentsVerified([...approved, { type: 'agreement', status: 'rejected' }])).toBe(true)
    expect(UPLOADABLE_DOCUMENT_TYPES).not.toContain('agreement')
    expect(isRetiredDocument('agreement')).toBe(true)
  })

  test('picked files: one or two photos or PDFs, up to 10 MB', () => {
    expect(pickedFilesProblem([{ type: 'application/pdf', size: 1000 }])).toBeNull()
    expect(pickedFilesProblem([])).toBe('Pick a file.')
    expect(pickedFilesProblem([{ type: 'image/heic', size: 1000 }])).toBe('Use a photo (JPEG, PNG or WebP) or a PDF.')
    expect(pickedFilesProblem([{ type: 'image/png', size: MAX_DOCUMENT_BYTES + 1 }])).toBe('Files can be up to 10 MB.')
    expect(
      pickedFilesProblem([
        { type: 'image/png', size: 1 },
        { type: 'image/png', size: 1 },
        { type: 'image/png', size: 1 },
      ])
    ).toBe('Two files at most: the front and the back.')
  })

  test('a file is named by kind and size, never its file name', () => {
    expect(fileLine({ contentType: 'application/pdf', sizeBytes: 1_258_291 })).toBe('PDF · 1.2 MB')
    expect(fileLine({ contentType: 'image/jpeg', sizeBytes: 655_360 })).toBe('Photo · 640 KB')
    expect(fileLine({ contentType: 'image/png', sizeBytes: 10 })).toBe('Photo · 1 KB')
  })
})
