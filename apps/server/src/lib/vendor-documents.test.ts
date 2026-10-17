import { describe, expect, test } from 'bun:test'
import {
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  REQUIRED_DOCUMENT_TYPES,
  documentFolder,
  documentsVerified,
  filesRefusal,
  isDocumentKey,
  progressLine,
  reviewRefusal,
  summariesByVendor,
  summariseDocuments,
  takesExpiry,
  uploadRefusal,
  uploadedLine,
  type DocumentState,
} from './vendor-documents.js'

const GARAGE = 'e2e00000-0000-4000-8000-000000002310'
const OTHER = 'e2e00000-0000-4000-8000-000000000301'
const UUID = '0b4f6c1e-2d3a-4c5b-8e9f-0a1b2c3d4e5f'

const approved = (type: DocumentState['type']): DocumentState => ({ type, status: 'approved' })

describe('the badge', () => {
  test('four required types, two optional', () => {
    expect([...REQUIRED_DOCUMENT_TYPES]).toEqual(['shop_photo', 'owner_id', 'bank_proof', 'agreement'])
    expect(DOCUMENT_TYPES.filter((t) => !(REQUIRED_DOCUMENT_TYPES as readonly string[]).includes(t))).toEqual([
      'gst_certificate',
      'trade_licence',
    ])
    expect(Object.keys(DOCUMENT_LABELS)).toEqual([...DOCUMENT_TYPES])
  })

  test('verified only when every required type is approved', () => {
    const all = REQUIRED_DOCUMENT_TYPES.map(approved)
    expect(documentsVerified(all)).toBe(true)
    for (const missing of REQUIRED_DOCUMENT_TYPES) {
      expect(documentsVerified(all.filter((doc) => doc.type !== missing))).toBe(false)
      for (const status of ['pending', 'rejected'] as const) {
        expect(
          documentsVerified(all.map((doc) => (doc.type === missing ? { ...doc, status } : doc)))
        ).toBe(false)
      }
    }
    expect(documentsVerified([])).toBe(false)
  })

  test('optional documents never decide it, whatever their state', () => {
    const all = REQUIRED_DOCUMENT_TYPES.map(approved)
    // An expired or rejected trade licence, a pending GST certificate.
    expect(
      documentsVerified([
        ...all,
        { type: 'trade_licence', status: 'rejected' },
        { type: 'gst_certificate', status: 'pending' },
      ])
    ).toBe(true)
    expect(documentsVerified([approved('gst_certificate'), approved('trade_licence')])).toBe(false)
  })

  test('the progress line counts required approvals only', () => {
    const summary = summariseDocuments([
      approved('shop_photo'),
      approved('owner_id'),
      { type: 'bank_proof', status: 'pending' },
      approved('gst_certificate'),
      { type: 'trade_licence', status: 'rejected' },
    ])
    expect(summary).toEqual({
      verified: false,
      approvedRequired: 2,
      required: 4,
      toReview: 1,
      missingRequired: 1,
      rejected: 1,
    })
    expect(progressLine(summary)).toBe('2 of 4 required approved')
    expect(progressLine(summariseDocuments(REQUIRED_DOCUMENT_TYPES.map(approved)))).toBe('4 of 4 required approved')
  })

  test('grouped by garage in one pass', () => {
    const map = summariesByVendor([
      ...REQUIRED_DOCUMENT_TYPES.map((type) => ({ vendorId: 'a', type, status: 'approved' as const })),
      { vendorId: 'b', type: 'owner_id', status: 'pending' },
    ])
    expect(map.get('a')?.verified).toBe(true)
    expect(map.get('b')).toMatchObject({ verified: false, toReview: 1 })
    expect(map.has('c')).toBe(false)
  })
})

describe('storage keys', () => {
  test('a key is the garage’s own folder for that type, a uuid and an allowed extension', () => {
    const folder = documentFolder(GARAGE, 'owner_id')
    expect(folder).toBe(`vendors/${GARAGE}/documents/owner_id/`)
    for (const ext of ['jpg', 'png', 'webp', 'pdf']) {
      expect(isDocumentKey(`${folder}${UUID}.${ext}`, GARAGE, 'owner_id')).toBe(true)
    }
  })

  test('anything else is refused', () => {
    const key = `${documentFolder(GARAGE, 'owner_id')}${UUID}.pdf`
    // Another garage's folder, another type's folder.
    expect(isDocumentKey(key, OTHER, 'owner_id')).toBe(false)
    expect(isDocumentKey(key, GARAGE, 'bank_proof')).toBe(false)
    // Paths that climb or nest, other extensions, not a uuid.
    expect(isDocumentKey(`${documentFolder(GARAGE, 'owner_id')}../bank_proof/${UUID}.pdf`, GARAGE, 'owner_id')).toBe(false)
    expect(isDocumentKey(`${documentFolder(GARAGE, 'owner_id')}x/${UUID}.pdf`, GARAGE, 'owner_id')).toBe(false)
    expect(isDocumentKey(`${documentFolder(GARAGE, 'owner_id')}${UUID}.html`, GARAGE, 'owner_id')).toBe(false)
    expect(isDocumentKey(`${documentFolder(GARAGE, 'owner_id')}${UUID}.pdf.html`, GARAGE, 'owner_id')).toBe(false)
    expect(isDocumentKey(`${documentFolder(GARAGE, 'owner_id')}passbook.pdf`, GARAGE, 'owner_id')).toBe(false)
    expect(isDocumentKey(`/${key}`, GARAGE, 'owner_id')).toBe(false)
  })
})

describe('upload rules', () => {
  test('photos and PDFs up to 10 MB', () => {
    expect(uploadRefusal('image/jpeg', 1)).toBeNull()
    expect(uploadRefusal('application/pdf', MAX_DOCUMENT_BYTES)).toBeNull()
    expect(uploadRefusal('application/pdf', MAX_DOCUMENT_BYTES + 1)).toBe('too_large')
    expect(uploadRefusal('image/heic', 100)).toBe('unsupported_type')
    expect(uploadRefusal('text/html', 100)).toBe('unsupported_type')
    expect(uploadRefusal('image/png', 0)).toBe('empty')
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024)
  })

  test('one file is the front; two are a front and a back', () => {
    expect(filesRefusal([{ side: 'front', key: 'a' }])).toBeNull()
    expect(filesRefusal([{ side: 'front', key: 'a' }, { side: 'back', key: 'b' }])).toBeNull()
    expect(filesRefusal([])).toBe('no_files')
    expect(filesRefusal([{ side: 'back', key: 'a' }])).toBe('no_front')
    expect(filesRefusal([{ side: 'front', key: 'a' }, { side: 'front', key: 'b' }])).toBe('duplicate_side')
    expect(filesRefusal([{ side: 'front', key: 'a' }, { side: 'back', key: 'a' }])).toBe('duplicate_file')
    expect(
      filesRefusal([
        { side: 'front', key: 'a' },
        { side: 'back', key: 'b' },
        { side: 'back', key: 'c' },
      ])
    ).toBe('too_many_files')
  })

  test('only a trade licence takes an expiry date', () => {
    expect(DOCUMENT_TYPES.filter(takesExpiry)).toEqual(['trade_licence'])
  })
})

describe('review', () => {
  test('only the version the admin opened', () => {
    expect(reviewRefusal({ status: 'pending', version: 2 }, 'approve', 1)).toBe('changed')
    expect(reviewRefusal({ status: 'pending', version: 2 }, 'reject', 2)).toBeNull()
    expect(reviewRefusal({ status: 'pending', version: 2 }, 'approve', 2)).toBeNull()
  })

  test('a decision can be turned round, never pressed twice', () => {
    expect(reviewRefusal({ status: 'approved', version: 1 }, 'approve', 1)).toBe('already_approved')
    expect(reviewRefusal({ status: 'rejected', version: 1 }, 'reject', 1)).toBe('already_rejected')
    expect(reviewRefusal({ status: 'approved', version: 1 }, 'reject', 1)).toBeNull()
    expect(reviewRefusal({ status: 'rejected', version: 1 }, 'approve', 1)).toBeNull()
  })
})

describe('the alert line', () => {
  test('says what was uploaded and what it replaced', () => {
    expect(uploadedLine('owner_id', null)).toBe('Owner ID')
    expect(uploadedLine('bank_proof', 'approved')).toBe('Bank proof (replacing an approved one)')
    expect(uploadedLine('agreement', 'rejected')).toBe('Signed Detlio agreement (after a rejection)')
    expect(uploadedLine('shop_photo', 'pending')).toBe('Shop photo (replacing one not yet checked)')
  })
})
