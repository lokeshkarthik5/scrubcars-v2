import { describe, expect, test } from 'bun:test'
import { planBranchCopy, type BranchSourceService } from './branches.js'

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
