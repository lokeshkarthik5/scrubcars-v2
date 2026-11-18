import { describe, expect, test } from 'bun:test'
import {
  branchLabelOf,
  columnsFor,
  groupNameOf,
  planBranchServices,
  serviceKey,
  type BranchPlan,
  type GroupGarage,
  type GroupService,
  type ServiceValues,
} from './branch-groups.js'

describe('names', () => {
  test('a group is the business name without its area', () => {
    expect(groupNameOf('Shine Auto Spa – Anna Nagar')).toBe('Shine Auto Spa')
    expect(groupNameOf('Shine Auto Spa - Velachery')).toBe('Shine Auto Spa')
    expect(groupNameOf('Shine Auto Spa — OMR')).toBe('Shine Auto Spa')
    expect(groupNameOf('  Revathi Auto Spa  ')).toBe('Revathi Auto Spa')
    // The first separator: the rest is the area.
    expect(groupNameOf('A1 Cars – T. Nagar - West')).toBe('A1 Cars')
    // A dash inside a word is not a separator.
    expect(groupNameOf('Auto-Kraft Detailing')).toBe('Auto-Kraft Detailing')
    // Nothing either side: the whole name.
    expect(groupNameOf('– Velachery')).toBe('– Velachery')
  })

  test('a branch is its area, or its whole name', () => {
    expect(branchLabelOf('Shine Auto Spa – Anna Nagar')).toBe('Anna Nagar')
    expect(branchLabelOf('A1 Cars – T. Nagar - West')).toBe('T. Nagar - West')
    expect(branchLabelOf('Revathi Auto Spa')).toBe('Revathi Auto Spa')
  })

  test('services match by name, trimmed and in any case', () => {
    expect(serviceKey('  Foam Wash ')).toBe(serviceKey('foam wash'))
    expect(serviceKey('Foam wash')).not.toBe(serviceKey('Foam-wash'))
  })
})

const ANNA = 'g-anna'
const VEL = 'g-vel'
const OMR = 'g-omr'
const TNAGAR = 'g-tnagar'
const garages: GroupGarage[] = [
  { id: ANNA, businessName: 'Shine Auto Spa – Anna Nagar' },
  { id: VEL, businessName: 'Shine Auto Spa – Velachery' },
  { id: OMR, businessName: 'Shine Auto Spa – OMR' },
  { id: TNAGAR, businessName: 'Shine Auto Spa – T. Nagar' },
]

const svc = (id: string, vendorId: string, name: string, price: string, over: Partial<GroupService> = {}): GroupService => ({
  id, vendorId, name, description: null, category: 'car_wash', pricingType: 'flat', price,
  priceHatchback: null, priceSedan: null, priceSuv: null, approxPrice: null, durationMins: 45,
  commissionRate: null, isActive: true, packageNames: [], ...over,
})

const services: GroupService[] = [
  svc('s-anna-foam', ANNA, 'Foam wash', '499.00'),
  svc('s-vel-foam', VEL, 'Foam wash', '499.00'),
  svc('s-omr-foam', OMR, '  FOAM WASH ', '529.00'),
  svc('s-tn-foam', TNAGAR, 'Foam wash', '499.00'),
  svc('s-vel-bike', VEL, 'Bike wash', '199.00'),
  svc('s-anna-bike', ANNA, 'bike wash', '199.00', { isActive: false }),
  svc('s-vel-full', VEL, 'Full wash', '699.00'),
]

const foamAt549: ServiceValues = {
  name: 'Foam wash', category: 'car_wash', pricingType: 'flat', price: 549, durationMins: 45, commissionRate: null,
}
const underbody: ServiceValues = {
  name: 'Underbody wash', category: 'car_wash', pricingType: 'flat', price: 249, durationMins: 30, commissionRate: null,
}

function plan(change: Parameters<typeof planBranchServices>[0]['change'], rows = services): BranchPlan {
  const result = planBranchServices({ sourceId: VEL, garages, services: rows, change })
  if (!result.ok) throw new Error(result.message)
  return result
}

describe('change all branches: a price and a new service (mockup 2-branches-4)', () => {
  const result = plan({
    kind: 'save',
    changed: [{ serviceId: 's-vel-foam', fields: ['price'], service: foamAt549 }],
    added: [underbody],
  })

  test('every branch, in the group’s order, by area', () => {
    expect(result.branches).toEqual([
      { id: ANNA, label: 'Anna Nagar' },
      { id: VEL, label: 'Velachery' },
      { id: OMR, label: 'OMR' },
      { id: TNAGAR, label: 'T. Nagar' },
    ])
  })

  test('the price changes at each branch, matched by name, and OMR’s was different', () => {
    const [foam] = result.items
    expect(foam!.kind).toBe('change')
    expect(foam!.lines.map((line) => [line.branch, line.action, line.before?.price, line.after?.price, line.wasDifferent])).toEqual([
      ['Anna Nagar', 'update', 499, 549, false],
      ['Velachery', 'update', 499, 549, false],
      ['OMR', 'update', 529, 549, true],
      ['T. Nagar', 'update', 499, 549, false],
    ])
    // Only the price: the duration it had stays (the write sets no duration).
    const omr = result.writes.updates.find((write) => write.serviceId === 's-omr-foam')!
    expect(omr.columns).toEqual({
      pricingType: 'flat', price: '549.00', priceHatchback: null, priceSedan: null, priceSuv: null, approxPrice: null,
    })
  })

  test('the new service is added at all four', () => {
    const added = result.items[1]!
    expect(added).toMatchObject({ kind: 'new', name: 'Underbody wash' })
    expect(added.lines.every((line) => line.action === 'add')).toBe(true)
    expect(added.lines[0]!.after).toMatchObject({ price: 249, durationMins: 30 })
    expect(result.writes.inserts.map((insert) => insert.vendorId)).toEqual([ANNA, VEL, OMR, TNAGAR])
    expect(result.writes.inserts[0]!.columns).toMatchObject({ name: 'Underbody wash', price: '249.00', durationMins: 30, category: 'car_wash' })
  })

  test('only the group’s services are written, each once', () => {
    const ids = result.writes.updates.map((write) => write.serviceId)
    expect(ids.sort()).toEqual(['s-anna-foam', 's-omr-foam', 's-tn-foam', 's-vel-foam'])
    for (const write of result.writes.updates) {
      expect(services.find((row) => row.id === write.serviceId)!.vendorId).toBe(write.vendorId)
    }
  })

  test('the same rows give the same plan, so preview equals save', () => {
    const again = plan({
      kind: 'save',
      changed: [{ serviceId: 's-vel-foam', fields: ['price'], service: foamAt549 }],
      added: [underbody],
    })
    expect(again.key).toBe(result.key)
    // A branch's price changed since: another plan.
    const moved = plan(
      { kind: 'save', changed: [{ serviceId: 's-vel-foam', fields: ['price'], service: foamAt549 }], added: [underbody] },
      services.map((row) => (row.id === 's-tn-foam' ? { ...row, price: '519.00' } : row))
    )
    expect(moved.key).not.toBe(result.key)
  })
})

describe('change all branches: a branch without the service gets it', () => {
  test('a price change reaches a branch that lacks the service as an add, with all of it', () => {
    const fullAt749: ServiceValues = { ...foamAt549, name: 'Full wash', price: 749, durationMins: 60 }
    const result = plan({
      kind: 'save', changed: [{ serviceId: 's-vel-full', fields: ['price'], service: fullAt749 }], added: [],
    })
    expect(result.items[0]!.lines.map((line) => [line.branch, line.action])).toEqual([
      ['Anna Nagar', 'add'],
      ['Velachery', 'update'],
      ['OMR', 'add'],
      ['T. Nagar', 'add'],
    ])
    expect(result.writes.inserts).toHaveLength(3)
    expect(result.writes.inserts[0]!.columns).toMatchObject({ name: 'Full wash', price: '749.00', durationMins: 60 })
  })

  test('a hidden copy is updated (and stays hidden), never added twice', () => {
    const result = plan({
      kind: 'save',
      changed: [{ serviceId: 's-vel-bike', fields: ['price'], service: { ...foamAt549, name: 'Bike wash', price: 249 } }],
      added: [],
    })
    const anna = result.items[0]!.lines.find((line) => line.vendorId === ANNA)!
    expect(anna).toMatchObject({ action: 'update', hidden: true, serviceIds: ['s-anna-bike'] })
    expect(result.writes.updates.find((write) => write.serviceId === 's-anna-bike')!.columns).not.toHaveProperty('isActive')
  })

  test('a rename finds the others by the old name and renames them', () => {
    const result = plan({
      kind: 'save',
      changed: [{ serviceId: 's-vel-foam', fields: ['name'], service: { ...foamAt549, name: 'Snow foam wash', price: 499 } }],
      added: [],
    })
    expect(result.items[0]).toMatchObject({ name: 'Snow foam wash', previousName: 'Foam wash' })
    expect(result.writes.updates.map((write) => write.columns)).toEqual(Array(4).fill({ name: 'Snow foam wash' }))
    expect(result.writes.inserts).toEqual([])
  })

  test('a new service a branch already has by that name is updated there, not added twice', () => {
    const result = plan({ kind: 'save', changed: [], added: [{ ...foamAt549, name: 'Bike Wash', price: 229 }] })
    const lines = result.items[0]!.lines
    expect(lines.find((line) => line.vendorId === ANNA)).toMatchObject({ action: 'update', serviceIds: ['s-anna-bike'] })
    // This garage adds it as its own save would.
    expect(lines.find((line) => line.vendorId === VEL)).toMatchObject({ action: 'add' })
    expect(result.writes.inserts.map((insert) => insert.vendorId)).toEqual([VEL, OMR, TNAGAR])
  })
})

describe('delete at all branches', () => {
  test('deleted where it is, skipped where it is not', () => {
    const result = plan({ kind: 'delete', serviceId: 's-vel-bike' })
    expect(result.items[0]!.lines.map((line) => [line.branch, line.action])).toEqual([
      ['Anna Nagar', 'delete'],
      ['Velachery', 'delete'],
      ['OMR', 'skip'],
      ['T. Nagar', 'skip'],
    ])
    expect(result.writes.deletes).toEqual([
      { serviceId: 's-anna-bike', vendorId: ANNA },
      { serviceId: 's-vel-bike', vendorId: VEL },
    ])
    expect(result.writes.inserts).toEqual([])
    expect(result.writes.updates).toEqual([])
  })

  test('refused while any branch’s copy is in a package, naming it', () => {
    const rows = services.map((row) => (row.id === 's-anna-bike' ? { ...row, packageNames: ['Weekend combo'] } : row))
    const result = planBranchServices({ sourceId: VEL, garages, services: rows, change: { kind: 'delete', serviceId: 's-vel-bike' } })
    expect(result).toMatchObject({ ok: false, status: 409, code: 'SERVICE_IN_PACKAGE' })
    expect(!result.ok && result.message).toBe('Remove “bike wash” from “Weekend combo” at Anna Nagar before deleting it.')
  })
})

describe('refusals', () => {
  test('a service not this garage’s (another branch’s id, or deleted since)', () => {
    for (const serviceId of ['s-anna-foam', 'gone']) {
      expect(
        planBranchServices({ sourceId: VEL, garages, services, change: { kind: 'delete', serviceId } })
      ).toMatchObject({ ok: false, code: 'SERVICE_DELETED' })
      expect(
        planBranchServices({
          sourceId: VEL, garages, services,
          change: { kind: 'save', changed: [{ serviceId, fields: ['price'], service: foamAt549 }], added: [] },
        })
      ).toMatchObject({ ok: false, code: 'SERVICE_DELETED' })
    }
  })

  test('two lines landing on one service at a branch', () => {
    const result = planBranchServices({
      sourceId: VEL, garages, services,
      change: {
        kind: 'save',
        changed: [{ serviceId: 's-vel-foam', fields: ['price'], service: foamAt549 }],
        added: [{ ...foamAt549, name: 'foam wash' }],
      },
    })
    expect(result).toMatchObject({ ok: false, code: 'BRANCH_SERVICE_CLASH' })
  })
})

describe('columnsFor', () => {
  test('per car type rewrites the whole price block; on inspection keeps a left-out approx price', () => {
    expect(
      columnsFor(['price'], { name: 'x', category: 'car_wash', pricingType: 'per_vehicle', priceHatchback: 400, priceSedan: 500, priceSuv: 600 })
    ).toEqual({ pricingType: 'per_vehicle', price: '400.00', priceHatchback: '400.00', priceSedan: '500.00', priceSuv: '600.00', approxPrice: null })
    expect(columnsFor(['price'], { name: 'x', category: 'repairs', pricingType: 'on_inspection', price: 0 })).not.toHaveProperty('approxPrice')
  })

  test('a duration, description, category and commission, only when they changed', () => {
    const values: ServiceValues = { ...foamAt549, description: '  Hand dried. ', category: 'detailing', commissionRate: 7.5, durationMins: null }
    expect(columnsFor(['duration', 'description', 'category', 'commission'], values)).toEqual({
      durationMins: null, description: 'Hand dried.', category: 'detailing', commissionRate: '7.50',
    })
    expect(columnsFor([], values)).toEqual({})
  })
})
