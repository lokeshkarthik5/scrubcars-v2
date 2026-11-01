import { describe, expect, test } from 'bun:test'
import {
  AADHAAR_MASK_NOTE,
  DOCUMENT_HINTS,
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  REQUIRED_DOCUMENT_TYPES,
  UPLOADABLE_DOCUMENT_TYPES,
  SHOP_PHOTO_OPTIONAL_HINT,
  adminCanRemove,
  documentHint,
  documentsVerified,
  garageCanRemove,
  isDoorstepOnly,
  isRequiredDocument,
  isRetiredDocument,
  requiredDocumentTypes,
  type DocumentModes,
  fileLine,
  pickedFilesProblem,
  progressLine,
} from './vendor-documents'

const AT_GARAGE: DocumentModes = { doorstepEnabled: false, dropinEnabled: true, pickupOffered: false }
const BOTH: DocumentModes = { doorstepEnabled: true, dropinEnabled: true, pickupOffered: false }
const DOORSTEP_ONLY: DocumentModes = { doorstepEnabled: true, dropinEnabled: false, pickupOffered: false }
const DOORSTEP_AND_PICKUP: DocumentModes = { doorstepEnabled: true, dropinEnabled: false, pickupOffered: true }
const PICKUP_ONLY: DocumentModes = { doorstepEnabled: false, dropinEnabled: false, pickupOffered: true }

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
    expect(documentsVerified(approved, AT_GARAGE)).toBe(true)
    expect(documentsVerified(approved.slice(1), AT_GARAGE)).toBe(false)
    expect(
      documentsVerified([...approved.slice(1), { type: 'shop_photo', status: 'pending' }], AT_GARAGE)
    ).toBe(false)
    expect(
      documentsVerified([...approved, { type: 'trade_licence', status: 'rejected' }], AT_GARAGE)
    ).toBe(true)
    expect(progressLine({ approvedRequired: 2, required: 3 })).toBe('2 of 3 required approved')
    // The paper agreement (0063) is retired: never required, never uploadable.
    expect(documentsVerified([...approved, { type: 'agreement', status: 'rejected' }], AT_GARAGE)).toBe(true)
    expect(UPLOADABLE_DOCUMENT_TYPES).not.toContain('agreement')
    expect(isRetiredDocument('agreement')).toBe(true)
  })

  test('a doorstep-only garage has no shop: its shop photo is optional, everyone else’s is required', () => {
    expect(isDoorstepOnly(DOORSTEP_ONLY)).toBe(true)
    for (const modes of [AT_GARAGE, BOTH, PICKUP_ONLY, DOORSTEP_AND_PICKUP]) {
      expect(isDoorstepOnly(modes)).toBe(false)
      expect(isRequiredDocument('shop_photo', modes)).toBe(true)
    }
    expect(isRequiredDocument('shop_photo', DOORSTEP_ONLY)).toBe(false)
    expect([...requiredDocumentTypes(DOORSTEP_ONLY)]).toEqual(['owner_id', 'bank_proof'])

    const idAndBank = [
      { type: 'owner_id' as const, status: 'approved' as const },
      { type: 'bank_proof' as const, status: 'approved' as const },
    ]
    expect(documentsVerified(idAndBank, DOORSTEP_ONLY)).toBe(true)
    expect(documentsVerified([...idAndBank, { type: 'shop_photo', status: 'rejected' }], DOORSTEP_ONLY)).toBe(true)
    expect(documentsVerified(idAndBank, BOTH)).toBe(false)
    expect(documentsVerified(idAndBank, PICKUP_ONLY)).toBe(false)
    expect(documentsVerified(idAndBank, DOORSTEP_AND_PICKUP)).toBe(false)
    expect(documentsVerified(idAndBank, { ...DOORSTEP_ONLY, dropinEnabled: true })).toBe(false)
  })

  test('the shop photo’s hint says it is optional only when it is', () => {
    expect(documentHint('shop_photo', true)).toBe(DOCUMENT_HINTS.shop_photo)
    expect(documentHint('shop_photo', false)).toBe(SHOP_PHOTO_OPTIONAL_HINT)
    expect(SHOP_PHOTO_OPTIONAL_HINT).toContain('Optional')
    expect(documentHint('owner_id', false)).toBe(DOCUMENT_HINTS.owner_id)
  })

  test('the garage removes an optional shop photo even when Detlio approved it', () => {
    const photo = { type: 'shop_photo' as const, status: 'approved' as const, uploadedByDetlio: false }
    expect(garageCanRemove({ ...photo, required: false })).toBe(true)
    expect(garageCanRemove({ ...photo, required: true })).toBe(false)
    expect(adminCanRemove(photo)).toBe(true)
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
