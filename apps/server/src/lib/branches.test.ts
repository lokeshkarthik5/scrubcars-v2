import { describe, expect, test } from 'bun:test'
import { branchPickupTerms, planBranchCopy, planBranchOwner, type BranchSourceService } from './branches.js'

const FOAM: BranchSourceService = { id: 's-foam', category: 'washing', isAddon: false, isActive: true }
const POLISH: BranchSourceService = { id: 's-polish', category: 'polishing', isAddon: false, isActive: true }
const CERAMIC: BranchSourceService = { id: 's-ceramic', category: 'coating', isAddon: false, isActive: true }
const HIDDEN: BranchSourceService = { id: 's-hidden', category: 'washing', isAddon: false, isActive: false }
const HELMET: BranchSourceService = { id: 'a-helmet', category: 'others', isAddon: true, isActive: true }
const OLD_ADDON: BranchSourceService = { id: 'a-old', category: 'others', isAddon: true, isActive: false }
const SERVICES = [FOAM, POLISH, CERAMIC, HIDDEN, HELMET, OLD_ADDON]
const PACKAGES = [
  { id: 'p-shine', isActive: true, memberIds: ['s-foam', 's-polish'] },
  { id: 'p-full', isActive: true, memberIds: ['s-foam', 's-polish', 's-ceramic'] },
  { id: 'p-off', isActive: false, memberIds: ['s-foam'] },
]

describe('planBranchCopy', () => {
  test('2 of 3 services: those two, the packages made only of them, and the live add-ons', () => {
    expect(planBranchCopy({ ticked: ['s-polish', 's-foam'], services: SERVICES, packages: PACKAGES })).toEqual({
      ok: true,
      serviceIds: ['s-foam', 's-polish'],
      packageIds: ['p-shine'],
      addOnIds: ['a-helmet'],
    })
  })

  test('nothing ticked: nothing copied, not even the add-ons', () => {
    expect(planBranchCopy({ ticked: [], services: SERVICES, packages: PACKAGES })).toEqual({
      ok: true,
      serviceIds: [],
      packageIds: [],
      addOnIds: [],
    })
  })

  test('a ticked id twice is copied once', () => {
    const plan = planBranchCopy({ ticked: ['s-foam', 's-foam'], services: SERVICES, packages: PACKAGES })
    expect(plan.ok && plan.serviceIds).toEqual(['s-foam'])
  })

  test('a hidden service, an add-on, a package or another garage’s id is refused whole', () => {
    for (const id of ['s-hidden', 'a-helmet', 'p-shine', 'someone-elses']) {
      expect(planBranchCopy({ ticked: ['s-foam', id], services: SERVICES, packages: PACKAGES })).toMatchObject({
        ok: false,
        code: 'SERVICE_NOT_FOUND',
      })
    }
  })
})

describe('planBranchOwner (owner, 10 Nov 2026)', () => {
  const SOURCE_OWNER = 'u-revathi'

  test('the source owner’s own number: the same login, nothing to change', () => {
    expect(
      planBranchOwner({
        sourceOwnerId: SOURCE_OWNER,
        phone: '9000006911',
        name: undefined,
        account: { id: SOURCE_OWNER, isVendorOwner: true },
      })
    ).toEqual({ ok: true, sameLogin: true, owner: { kind: 'existing', userId: SOURCE_OWNER, makeVendorOwner: false } })
  })

  test('another account’s number: that login, made a garage owner if it is not one; no name needed', () => {
    expect(
      planBranchOwner({
        sourceOwnerId: SOURCE_OWNER,
        phone: '9840011203',
        name: '',
        account: { id: 'u-customer', isVendorOwner: false },
      })
    ).toEqual({ ok: true, sameLogin: false, owner: { kind: 'existing', userId: 'u-customer', makeVendorOwner: true } })
  })

  test('a number with no account: a new login with the name given, trimmed', () => {
    expect(
      planBranchOwner({ sourceOwnerId: SOURCE_OWNER, phone: '9000006930', name: ' Meena ', account: null })
    ).toEqual({ ok: true, sameLogin: false, owner: { kind: 'new', name: 'Meena', phone: '9000006930' } })
  })

  test('a number with no account and no name is refused', () => {
    for (const name of [undefined, null, '  ']) {
      expect(planBranchOwner({ sourceOwnerId: SOURCE_OWNER, phone: '9000006930', name, account: undefined })).toMatchObject({
        ok: false,
        code: 'OWNER_NAME_REQUIRED',
      })
    }
  })
})

describe('branchPickupTerms: the agreement follows the login', () => {
  const signed = {
    pickup: 'yes' as const,
    pickupTermsAcceptedAt: new Date('2026-11-01T05:30:00Z'),
    pickupTermsAcceptedBy: 'admin: Priya',
  }

  test('the same login keeps the signed responsibility as it is', () => {
    expect(branchPickupTerms(signed, true)).toEqual(signed)
  })

  test('another login: off with no terms, until that garage signs its own', () => {
    expect(branchPickupTerms(signed, false)).toEqual({ pickup: 'no', pickupTermsAcceptedAt: null, pickupTermsAcceptedBy: null })
    expect(branchPickupTerms({ ...signed, pickup: 'nearby' }, false).pickup).toBe('no')
  })

  test('never answered stays never answered', () => {
    const blank = { pickup: null, pickupTermsAcceptedAt: null, pickupTermsAcceptedBy: null }
    expect(branchPickupTerms(blank, false)).toEqual(blank)
    expect(branchPickupTerms(blank, true)).toEqual(blank)
  })
})
