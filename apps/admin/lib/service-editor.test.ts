import { describe, expect, test } from 'bun:test'
import { SERVICE_TEMPLATES, templatesNotIn } from '@repo/core/service-templates'
import {
  durationLabel,
  durationToMins,
  emptyServiceRow,
  groupRows,
  minsToDuration,
  restoreRow,
  rowBefore,
  rowHasUnsavedChanges,
  CATEGORY_PICKER,
  othersHintNote,
  rowCategoryHint,
  serviceRowFromTemplate,
  templatesByCategory,
  toServicePayload,
  toServiceRow,
  type ServiceRow,
} from './service-editor'
import { serviceRowProblem } from './service-rows'

const stored = (patch: Partial<Parameters<typeof toServiceRow>[0]> = {}) => ({
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  name: 'Foam wash',
  description: null,
  category: 'car_wash' as const,
  pricingType: 'per_vehicle' as const,
  price: '399.00',
  priceHatchback: '399.00',
  priceSedan: '449.00',
  priceSuv: '549.00',
  durationMins: 45,
  images: [],
  media: [],
  ...patch,
})

const row = (patch: Partial<ServiceRow> = {}): ServiceRow => ({
  ...toServiceRow(stored()),
  ...patch,
})

describe('durations', () => {
  test('the chip says minutes up to two hours, then hours, then days', () => {
    expect(durationLabel(45)).toBe('45 min')
    expect(durationLabel(120)).toBe('120 min')
    expect(durationLabel(180)).toBe('3 h')
    expect(durationLabel(150)).toBe('2 h 30 min')
    expect(durationLabel(1440)).toBe('1 day')
    expect(durationLabel(2880)).toBe('2 days')
  })

  test('value and unit round-trip through minutes', () => {
    expect(minsToDuration(180)).toEqual({
      durationValue: '3',
      durationUnit: 'hour',
    })
    expect(minsToDuration(1440)).toEqual({
      durationValue: '1',
      durationUnit: 'day',
    })
    expect(minsToDuration(45)).toEqual({
      durationValue: '45',
      durationUnit: 'min',
    })
    expect(durationToMins('1.5', 'hour')).toBe(90)
    expect(durationToMins('', 'min')).toBeUndefined()
    expect(durationToMins('0', 'hour')).toBeUndefined()
  })
})

describe('groupRows', () => {
  test('one heading per category, in the order used everywhere, numbered down the screen', () => {
    const rows = [
      row({ key: 'a', name: 'Interior', category: 'detailing' }),
      row({ key: 'b', name: 'Foam wash', category: 'car_wash' }),
      row({ key: 'c', name: 'Brake pads', category: 'repairs' }),
      row({ key: 'd', name: 'Bike wash', category: 'others' }),
      row({ key: 'e', name: 'Oil change', category: 'general_service' }),
      row({ key: 'f', name: 'AC service', category: 'repairs' }),
    ]
    const groups = groupRows(rows)
    expect(groups.map((group) => [group.label, group.commissionPercent])).toEqual([
      ['Car wash', 8],
      ['Detailing', 5],
      ['General service', 5],
      ['Repairs', 5],
      ['Others', 8],
    ])
    expect(
      groups.flatMap((group) => group.rows.map(({ row: r, number }) => [r.key, number]))
    ).toEqual([
      ['b', 1],
      ['a', 2],
      ['e', 3],
      ['c', 4],
      ['f', 5],
      ['d', 6],
    ])
  })

  test('a new row lands at the end of its own heading', () => {
    const rows = [row({ key: 'c', category: 'repairs' }), row({ key: 'w', category: 'car_wash' })]
    const added = emptyServiceRow('repairs')
    const repairs = groupRows([...rows, added]).find((group) => group.category === 'repairs')!
    expect(repairs.rows.map(({ row: r }) => r.key)).toEqual(['c', added.key])
    expect(added.category).toBe('repairs')
    expect(emptyServiceRow().category).toBe('car_wash')
  })

  test('an empty category is left out', () => {
    expect(groupRows([row({ category: 'scratch_removal' })]).map((group) => group.key)).toEqual([
      'scratch_removal',
    ])
    expect(groupRows([])).toEqual([])
  })
})

describe('Add service and the templates (0080)', () => {
  test('the picker offers the eight categories with their rates, the new ones marked', () => {
    expect(CATEGORY_PICKER.map((c) => [c.label, c.commissionPercent, c.isNew])).toEqual([
      ['Car wash', 8, false],
      ['Detailing', 5, false],
      ['Coating', 5, false],
      ['Scratch removal', 5, false],
      ['General service', 5, true],
      ['Repairs', 5, true],
      ['Dent & paint', 5, true],
      ['Others', 8, false],
    ])
  })

  test('template chips, one line per category, leaving out what the garage has', () => {
    const lines = templatesByCategory(templatesNotIn(['Foam wash', 'Polishing', 'General service', 'Oil change']))
    expect(lines.map((line) => [line.label, line.templates.map((t) => t.name)])).toEqual([
      ['Car wash', ['Body wash', 'Full wash', 'Interior cleaning', 'Underbody wash']],
      ['Detailing', ['Engine bay cleaning', 'Headlight restoration']],
      ['Coating', ['Ceramic coating']],
      ['General service', ['Wheel alignment & balancing']],
      ['Repairs', ['Brake pads', 'AC service', 'Clutch repair']],
      ['Dent & paint', ['Dent repair', 'Panel painting']],
      ['Others', ['Bike wash']],
    ])
  })
})

describe('the "Looks like" hint (0080)', () => {
  test('only on rows in Others, and never once turned down', () => {
    expect(rowCategoryHint(row({ name: 'Clutch overhaul', category: 'others' }))).toEqual({
      category: 'repairs',
      keyword: 'clutch',
    })
    expect(rowCategoryHint(row({ name: 'Clutch overhaul', category: 'repairs' }))).toBeNull()
    expect(
      rowCategoryHint(row({ name: 'Clutch overhaul', category: 'others', categoryHintDismissed: true }))
    ).toBeNull()
  })

  test("the Others heading's note counts the rows with a hint", () => {
    const others = [
      row({ name: 'Clutch overhaul', category: 'others' }),
      row({ name: 'Bumper painting', category: 'others' }),
      row({ name: 'Wheel alignment', category: 'others' }),
      row({ name: 'Bike wash', category: 'others' }),
    ]
    expect(othersHintNote(others)).toBe(
      '3 of these look like they belong in a new category. Nothing moves until you tap Move; then Save changes as usual.'
    )
    expect(othersHintNote(others.slice(0, 1))).toBe(
      '1 of these looks like it belongs in a new category. Nothing moves until you tap Move; then Save changes as usual.'
    )
    expect(othersHintNote(others.slice(3))).toBeNull()
  })

  test('"Not this" is read from the server and sent back with Save changes', () => {
    expect(toServiceRow(stored()).categoryHintDismissed).toBe(false)
    const dismissed = toServiceRow(stored({ category: 'others', categoryHintDismissedAt: '2026-11-16T10:00:00.000Z' }))
    expect(dismissed.categoryHintDismissed).toBe(true)
    expect(toServicePayload(dismissed).categoryHintDismissed).toBe(true)
    expect(toServicePayload(row()).categoryHintDismissed).toBe(false)
  })
})

describe('rows', () => {
  test('a new row has its own key and asks for the three car-type prices once named', () => {
    const a = emptyServiceRow()
    const b = emptyServiceRow()
    expect(a.key).not.toBe(b.key)
    expect(a.pricingType).toBe('per_vehicle')
    expect(serviceRowProblem({ ...a, name: 'Wax' })).toBe(
      'Add the hatchback, sedan and SUV prices'
    )
  })

  test('a template fills everything but the prices', () => {
    const template = SERVICE_TEMPLATES.find(
      (t) => t.name === 'Ceramic coating'
    )!
    const fromTemplate = serviceRowFromTemplate(template)
    expect(fromTemplate).toMatchObject({
      name: 'Ceramic coating',
      category: 'coating',
      pricingType: 'per_vehicle',
      description: template.description,
      durationValue: '1',
      durationUnit: 'day',
      priceHatchback: '',
    })
    expect(fromTemplate.id).toBeUndefined()
    expect(serviceRowProblem(fromTemplate)).toBe(
      'Add the hatchback, sedan and SUV prices'
    )
  })

  test('a stored service keeps its id as its key and drops the trailing .00', () => {
    expect(row()).toMatchObject({
      key: stored().id,
      id: stored().id,
      price: '',
      priceSedan: '449',
      durationValue: '45',
    })
  })
})

describe('toServicePayload', () => {
  test('sends the prices its pricing type uses, and the id once it has one', () => {
    expect(toServicePayload(row())).toEqual({
      id: stored().id,
      name: 'Foam wash',
      category: 'car_wash',
      pricingType: 'per_vehicle',
      durationMins: 45,
      commissionRate: null,
      categoryHintDismissed: false,
      priceHatchback: 399,
      priceSedan: 449,
      priceSuv: 549,
    })
    expect(
      toServicePayload(
        row({
          id: undefined,
          pricingType: 'flat',
          price: '450',
          description: ' Rinse. ',
          durationValue: '',
        })
      )
    ).toEqual({
      name: 'Foam wash',
      description: 'Rinse.',
      category: 'car_wash',
      pricingType: 'flat',
      commissionRate: null,
      categoryHintDismissed: false,
      price: 450,
    })
  })

  test('an empty duration is left out; a commission percent is sent, empty as null (0064)', () => {
    const blank = toServicePayload(
      row({ durationValue: '', commissionRate: '6.5' })
    )
    expect('durationMins' in blank).toBe(false)
    expect(blank.commissionRate).toBe(6.5)
    expect(
      toServicePayload(row({ commissionRate: ' ' })).commissionRate
    ).toBeNull()
  })

  test('a stored service with no duration or rate opens empty; one with a rate shows it', () => {
    expect(toServiceRow(stored({ durationMins: null })).durationValue).toBe('')
    expect(toServiceRow(stored()).commissionRate).toBe('')
    expect(
      toServiceRow(stored({ commissionRate: '6.50' })).commissionRate
    ).toBe('6.5')
  })
})

describe('on inspection: optional fee and approx price (0073)', () => {
  test('a free inspection opens with an empty fee box and its approx price', () => {
    const free = toServiceRow(
      stored({ pricingType: 'on_inspection', price: '0.00', priceHatchback: null, priceSedan: null, priceSuv: null, approxPrice: '1500.00' })
    )
    expect(free).toMatchObject({ price: '', approxPrice: '1500' })
    expect(toServiceRow(stored({ pricingType: 'on_inspection', price: '299.00', approxPrice: null }))).toMatchObject({
      price: '299',
      approxPrice: '',
    })
    // Only an inspection service carries an approx price into the row.
    expect(toServiceRow(stored({ approxPrice: '1500.00' })).approxPrice).toBe('')
    expect(serviceRowProblem(free)).toBeNull()
  })

  test('sends the fee only when there is one, and the approx price (null when empty)', () => {
    const inspection = row({ pricingType: 'on_inspection', price: '', approxPrice: '1500' })
    expect(toServicePayload(inspection)).toMatchObject({ pricingType: 'on_inspection', price: undefined, approxPrice: 1500 })
    expect(toServicePayload({ ...inspection, price: '299', approxPrice: '' })).toMatchObject({ price: 299, approxPrice: null })
    // Switched away from inspection, no approx price is sent.
    expect('approxPrice' in toServicePayload({ ...inspection, pricingType: 'flat', price: '450' })).toBe(false)
  })
})

describe('hide, and Undo', () => {
  const a = row({ id: 'a', key: 'a' })
  const b = row({ id: 'b', key: 'b' })
  const c = row({ id: 'c', key: 'c' })

  test('a hidden row comes back where it stood, and never twice', () => {
    expect(rowBefore([a, b, c], 'b')).toBe('a')
    expect(rowBefore([a, b, c], 'a')).toBeNull()
    expect(restoreRow([a, c], b, 'a').map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(restoreRow([b, c], a, null).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ])
    // Show again, with no place to go back to: at the end.
    expect(restoreRow([a, c], b).map((r) => r.id)).toEqual(['a', 'c', 'b'])
    // The row it followed has gone too: first, rather than lost.
    expect(restoreRow([c], b, 'a').map((r) => r.id)).toEqual(['b', 'c'])
    // Already back (a second Undo, or Show again as well): unchanged.
    const list = [a, b, c]
    expect(restoreRow(list, b, 'a')).toBe(list)
  })

  test('a row with unsaved edits says so', () => {
    expect(rowHasUnsavedChanges([a, b], [a, b], 'b')).toBe(false)
    expect(
      rowHasUnsavedChanges([a, b], [a, { ...b, name: 'Changed' }], 'b')
    ).toBe(true)
    expect(rowHasUnsavedChanges([a], [a], 'missing')).toBe(false)
  })
})
