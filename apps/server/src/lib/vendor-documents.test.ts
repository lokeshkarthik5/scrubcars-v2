import { describe, expect, test } from 'bun:test'
import {
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  REQUIRED_DOCUMENT_TYPES,
  RETIRED_DOCUMENT_TYPES,
  UPLOADABLE_DOCUMENT_TYPES,
  documentFolder,
  documentModesOf,
  documentsVerified,
  filesRefusal,
  isDoorstepOnly,
  isRequiredDocument,
  requiredDocumentTypes,
  isRetiredDocument,
  isDocumentKey,
  progressLine,
  reviewRefusal,
  summariesByVendor,
  summariseDocuments,
  takesExpiry,
  uploadRefusal,
  uploadedLine,
  removalRefusal,
  type DocumentModes,
  type DocumentState,
  type DocumentStatus,
  type DocumentType,
} from './vendor-documents.js'

const GARAGE = 'e2e00000-0000-4000-8000-000000002310'
const OTHER = 'e2e00000-0000-4000-8000-000000000301'
const UUID = '0b4f6c1e-2d3a-4c5b-8e9f-0a1b2c3d4e5f'

// How a garage takes bookings decides whether it has a shop (0043, owner
// decision 1 Nov 2026): doorstep-only has none, so its shop photo is optional.
const AT_GARAGE: DocumentModes = { doorstepEnabled: false, dropinEnabled: true, pickupOffered: false }
const BOTH: DocumentModes = { doorstepEnabled: true, dropinEnabled: true, pickupOffered: false }
const DOORSTEP_ONLY: DocumentModes = { doorstepEnabled: true, dropinEnabled: false, pickupOffered: false }
// Doorstep and pickup & drop, at-garage off: it collects cars, so it has premises.
const DOORSTEP_AND_PICKUP: DocumentModes = { doorstepEnabled: true, dropinEnabled: false, pickupOffered: true }
// Pickup & drop alone (neither of the two on): it has premises.
const PICKUP_ONLY: DocumentModes = { doorstepEnabled: false, dropinEnabled: false, pickupOffered: true }

const approved = (type: DocumentState['type']): DocumentState => ({ type, status: 'approved' })

describe('documents checked', () => {
  test('three required types, two optional, and the paper agreement retired (0063)', () => {
    expect([...REQUIRED_DOCUMENT_TYPES]).toEqual(['shop_photo', 'owner_id', 'bank_proof'])
    expect(DOCUMENT_TYPES.filter((t) => !(REQUIRED_DOCUMENT_TYPES as readonly string[]).includes(t))).toEqual([
      'agreement',
      'gst_certificate',
      'trade_licence',
    ])
    expect([...RETIRED_DOCUMENT_TYPES]).toEqual(['agreement'])
    expect(UPLOADABLE_DOCUMENT_TYPES).toEqual(['shop_photo', 'owner_id', 'bank_proof', 'gst_certificate', 'trade_licence'])
    expect(isRetiredDocument('agreement')).toBe(true)
    expect(isRetiredDocument('owner_id')).toBe(false)
    expect(Object.keys(DOCUMENT_LABELS)).toEqual([...DOCUMENT_TYPES])
  })

  test('an approved paper agreement no longer counts, and a missing one no longer blocks', () => {
    const three = REQUIRED_DOCUMENT_TYPES.map(approved)
    expect(documentsVerified(three, AT_GARAGE)).toBe(true)
    expect(documentsVerified([...three, { type: 'agreement', status: 'pending' }], AT_GARAGE)).toBe(true)
    expect(documentsVerified([approved('agreement'), approved('owner_id'), approved('bank_proof')], AT_GARAGE)).toBe(false)
  })

  test('verified only when every required type is approved', () => {
    const all = REQUIRED_DOCUMENT_TYPES.map(approved)
    expect(documentsVerified(all, AT_GARAGE)).toBe(true)
    for (const missing of REQUIRED_DOCUMENT_TYPES) {
      expect(documentsVerified(all.filter((doc) => doc.type !== missing), AT_GARAGE)).toBe(false)
      for (const status of ['pending', 'rejected'] as const) {
        expect(
          documentsVerified(
            all.map((doc) => (doc.type === missing ? { ...doc, status } : doc)),
            AT_GARAGE
          )
        ).toBe(false)
      }
    }
    expect(documentsVerified([], AT_GARAGE)).toBe(false)
  })

  test('optional documents never decide it, whatever their state', () => {
    const all = REQUIRED_DOCUMENT_TYPES.map(approved)
    // An expired or rejected trade licence, a pending GST certificate.
    expect(
      documentsVerified(
        [...all, { type: 'trade_licence', status: 'rejected' }, { type: 'gst_certificate', status: 'pending' }],
        AT_GARAGE
      )
    ).toBe(true)
    expect(documentsVerified([approved('gst_certificate'), approved('trade_licence')], AT_GARAGE)).toBe(false)
  })

  test('the progress line counts required approvals only', () => {
    const summary = summariseDocuments(
      [
        approved('shop_photo'),
        approved('owner_id'),
        { type: 'bank_proof', status: 'pending' },
        approved('gst_certificate'),
        { type: 'trade_licence', status: 'rejected' },
      ],
      AT_GARAGE
    )
    expect(summary).toEqual({
      verified: false,
      approvedRequired: 2,
      required: 3,
      toReview: 1,
      missingRequired: 0,
      rejected: 1,
    })
    expect(progressLine(summary)).toBe('2 of 3 required approved')
    expect(progressLine(summariseDocuments(REQUIRED_DOCUMENT_TYPES.map(approved), AT_GARAGE))).toBe('3 of 3 required approved')
  })

  test('grouped by garage in one pass', () => {
    const map = summariesByVendor(
      [
        ...REQUIRED_DOCUMENT_TYPES.map((type) => ({ vendorId: 'a', type, status: 'approved' as const })),
        { vendorId: 'b', type: 'owner_id', status: 'pending' },
        { vendorId: 'd', type: 'owner_id', status: 'approved' },
        { vendorId: 'd', type: 'bank_proof', status: 'approved' },
        { vendorId: 'ignored', type: 'owner_id', status: 'approved' },
      ],
      new Map([
        ['a', AT_GARAGE],
        ['b', AT_GARAGE],
        ['c', AT_GARAGE],
        ['d', DOORSTEP_ONLY],
      ])
    )
    expect(map.get('a')?.verified).toBe(true)
    expect(map.get('b')).toMatchObject({ verified: false, toReview: 1 })
    // A garage with no rows still has a summary: nothing uploaded.
    expect(map.get('c')).toMatchObject({ verified: false, approvedRequired: 0, required: 3, missingRequired: 3 })
    // Each garage is read for its own modes: ID and bank proof are enough here.
    expect(map.get('d')).toMatchObject({ verified: true, approvedRequired: 2, required: 2 })
    expect(map.has('ignored')).toBe(false)
  })
})

describe('a doorstep-only garage has no shop (owner decision, 1 Nov 2026)', () => {
  const idAndBank = [approved('owner_id'), approved('bank_proof')]

  test('doorstep on, at-garage off and no pickup is doorstep-only; nothing else is', () => {
    expect(isDoorstepOnly(DOORSTEP_ONLY)).toBe(true)
    expect(isDoorstepOnly(BOTH)).toBe(false)
    expect(isDoorstepOnly(AT_GARAGE)).toBe(false)
    // Pickup & drop alone has premises, so the photo stays required.
    expect(isDoorstepOnly(PICKUP_ONLY)).toBe(false)
    // So does doorstep with pickup & drop, at-garage off.
    expect(isDoorstepOnly(DOORSTEP_AND_PICKUP)).toBe(false)
    // A garage with nothing on is not doorstep-only either.
    expect(isDoorstepOnly({ doorstepEnabled: false, dropinEnabled: false, pickupOffered: false })).toBe(false)
  })

  test('the modes come from the garage row: pickup counts only with its terms on file', () => {
    const row = { doorstepEnabled: true, dropinEnabled: false }
    const terms = new Date('2026-10-01T00:00:00Z')
    expect(documentModesOf({ ...row, pickup: 'yes', pickupTermsAcceptedAt: terms }).pickupOffered).toBe(true)
    expect(documentModesOf({ ...row, pickup: 'nearby', pickupTermsAcceptedAt: terms }).pickupOffered).toBe(true)
    // "yes" from before 0037 has no terms, so pickup is not on and the photo is optional.
    expect(documentModesOf({ ...row, pickup: 'yes', pickupTermsAcceptedAt: null }).pickupOffered).toBe(false)
    expect(documentModesOf({ ...row, pickup: 'no', pickupTermsAcceptedAt: terms }).pickupOffered).toBe(false)
    expect(documentModesOf({ ...row, pickup: null, pickupTermsAcceptedAt: null })).toEqual(DOORSTEP_ONLY)
  })

  test('the required types: three for everyone else, ID and bank proof for doorstep-only', () => {
    for (const modes of [AT_GARAGE, BOTH, PICKUP_ONLY, DOORSTEP_AND_PICKUP]) {
      expect([...requiredDocumentTypes(modes)]).toEqual(['shop_photo', 'owner_id', 'bank_proof'])
      expect(isRequiredDocument('shop_photo', modes)).toBe(true)
    }
    expect([...requiredDocumentTypes(DOORSTEP_ONLY)]).toEqual(['owner_id', 'bank_proof'])
    expect(isRequiredDocument('shop_photo', DOORSTEP_ONLY)).toBe(false)
    expect(isRequiredDocument('owner_id', DOORSTEP_ONLY)).toBe(true)
    expect(isRequiredDocument('bank_proof', DOORSTEP_ONLY)).toBe(true)
  })

  test('doorstep-only with ID and bank proof approved is verified, with no shop photo at all', () => {
    expect(documentsVerified(idAndBank, DOORSTEP_ONLY)).toBe(true)
    expect(summariseDocuments(idAndBank, DOORSTEP_ONLY)).toEqual({
      verified: true,
      approvedRequired: 2,
      required: 2,
      toReview: 0,
      missingRequired: 0,
      rejected: 0,
    })
    expect(progressLine(summariseDocuments(idAndBank, DOORSTEP_ONLY))).toBe('2 of 2 required approved')
  })

  test('a rejected, pending or approved shop photo changes nothing for a doorstep-only garage', () => {
    for (const status of ['pending', 'rejected', 'approved'] as const) {
      expect(documentsVerified([...idAndBank, { type: 'shop_photo', status }], DOORSTEP_ONLY)).toBe(true)
    }
    const rejected = summariseDocuments([...idAndBank, { type: 'shop_photo', status: 'rejected' }], DOORSTEP_ONLY)
    expect(rejected).toMatchObject({ verified: true, missingRequired: 0 })
    // It was still sent back to the garage, so it still shows as rejected.
    expect(rejected.rejected).toBe(1)
  })

  test('doorstep-only still needs ID and bank proof', () => {
    expect(documentsVerified([approved('owner_id')], DOORSTEP_ONLY)).toBe(false)
    expect(documentsVerified([approved('bank_proof')], DOORSTEP_ONLY)).toBe(false)
    expect(documentsVerified([], DOORSTEP_ONLY)).toBe(false)
    expect(documentsVerified([approved('shop_photo'), approved('owner_id')], DOORSTEP_ONLY)).toBe(false)
    expect(summariseDocuments([], DOORSTEP_ONLY)).toMatchObject({ missingRequired: 2, required: 2 })
  })

  test('at-garage plus doorstep needs the shop photo', () => {
    expect(documentsVerified(idAndBank, BOTH)).toBe(false)
    expect(documentsVerified([...idAndBank, { type: 'shop_photo', status: 'rejected' }], BOTH)).toBe(false)
    expect(documentsVerified([...idAndBank, approved('shop_photo')], BOTH)).toBe(true)
    expect(summariseDocuments(idAndBank, BOTH)).toMatchObject({ missingRequired: 1, required: 3, approvedRequired: 2 })
  })

  test('at-garage only, pickup & drop only, and doorstep with pickup & drop need it too', () => {
    for (const modes of [AT_GARAGE, PICKUP_ONLY, DOORSTEP_AND_PICKUP]) {
      expect(documentsVerified(idAndBank, modes)).toBe(false)
      expect(documentsVerified([...idAndBank, approved('shop_photo')], modes)).toBe(true)
    }
  })

  test('turning at-garage on makes the same approved documents fall short again', () => {
    const docs = idAndBank
    expect(documentsVerified(docs, DOORSTEP_ONLY)).toBe(true)
    expect(documentsVerified(docs, { ...DOORSTEP_ONLY, dropinEnabled: true })).toBe(false)
    // Or turns pickup & drop on.
    expect(documentsVerified(docs, { ...DOORSTEP_ONLY, pickupOffered: true })).toBe(false)
    // And off again: verified without anything new uploaded.
    expect(documentsVerified(docs, { ...DOORSTEP_ONLY, dropinEnabled: false })).toBe(true)
  })

  test('the optional shop photo is removed like any optional type, by both', () => {
    const photo = (status: DocumentStatus, uploadedBy = 'garage') => ({ type: 'shop_photo' as const, status, uploadedBy })
    for (const status of ['pending', 'rejected', 'approved'] as const) {
      expect(removalRefusal(photo(status), 'garage', false, DOORSTEP_ONLY)).toBeNull()
      expect(removalRefusal(photo(status), 'admin', false, DOORSTEP_ONLY)).toBeNull()
    }
    // One Detlio uploaded for the garage, too: nothing about it is required.
    expect(removalRefusal(photo('approved', 'Mathew'), 'garage', false, DOORSTEP_ONLY)).toBeNull()
    // The same photo on a garage with a shop keeps the old protection.
    expect(removalRefusal(photo('approved'), 'garage', false, BOTH)).toBe('approved_required')
    expect(removalRefusal(photo('approved'), 'admin', false, BOTH)).toBe('approved_required')
    // ID and bank proof stay protected on a doorstep-only garage.
    expect(removalRefusal({ type: 'owner_id', status: 'approved', uploadedBy: 'garage' }, 'admin', false, DOORSTEP_ONLY)).toBe(
      'approved_required'
    )
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
    expect(uploadedLine('agreement', 'rejected')).toBe('Signed agreement (old, on paper) (after a rejection)')
    expect(uploadedLine('shop_photo', 'pending')).toBe('Shop photo (replacing one not yet checked)')
  })
})

describe('removing a document (0065)', () => {
  const doc = (type: DocumentType, status: DocumentStatus, uploadedBy = 'garage') => ({ type, status, uploadedBy })

  test('the approved signed agreement is never removed', () => {
    expect(removalRefusal(doc('agreement', 'approved', 'Mathew'), 'admin', true, AT_GARAGE)).toBe('signed_agreement')
    expect(removalRefusal(doc('agreement', 'pending', 'Mathew'), 'admin', false, AT_GARAGE)).toBeNull()
  })

  test('admin: optional types straight away, required ones once warned (Silver)', () => {
    expect(removalRefusal(doc('gst_certificate', 'approved'), 'admin', false, AT_GARAGE)).toBeNull()
    expect(removalRefusal(doc('trade_licence', 'rejected'), 'admin', false, AT_GARAGE)).toBeNull()
    expect(removalRefusal(doc('owner_id', 'approved'), 'admin', false, AT_GARAGE)).toBe('approved_required')
    expect(removalRefusal(doc('owner_id', 'approved'), 'admin', true, AT_GARAGE)).toBeNull()
    expect(removalRefusal(doc('bank_proof', 'pending'), 'admin', true, AT_GARAGE)).toBeNull()
  })

  test('the garage: optional types, and its own required uploads not approved yet', () => {
    expect(removalRefusal(doc('gst_certificate', 'approved'), 'garage', false, AT_GARAGE)).toBeNull()
    expect(removalRefusal(doc('shop_photo', 'pending'), 'garage', false, AT_GARAGE)).toBeNull()
    expect(removalRefusal(doc('shop_photo', 'rejected'), 'garage', false, AT_GARAGE)).toBeNull()
    expect(removalRefusal(doc('shop_photo', 'approved'), 'garage', false, AT_GARAGE)).toBe('approved_required')
    expect(removalRefusal(doc('owner_id', 'pending', 'Mathew'), 'garage', false, AT_GARAGE)).toBe('not_garage_upload')
  })
})
