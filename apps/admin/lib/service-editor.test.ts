import { describe, expect, test } from 'bun:test'
import { SERVICE_TEMPLATES } from '@repo/core/service-templates'
import {
  durationLabel,
  durationToMins,
  emptyServiceRow,
  groupRows,
  minsToDuration,
  serviceGroupOf,
  serviceRowFromTemplate,
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
  test('washes and extras first, detailing work second, numbered down the screen', () => {
    const rows = [
      row({ key: 'a', name: 'Interior', category: 'detailing' }),
      row({ key: 'b', name: 'Foam wash', category: 'car_wash' }),
      row({ key: 'c', name: 'Ceramic', category: 'coating' }),
      row({ key: 'd', name: 'Bike wash', category: 'others' }),
    ]
    const groups = groupRows(rows)
    expect(groups.map((group) => group.label)).toEqual([
      'Wash and standard',
      'Detailing',
    ])
    expect(groups[0].rows.map(({ row: r, number }) => [r.key, number])).toEqual(
      [
        ['b', 1],
        ['d', 2],
      ]
    )
    expect(groups[1].rows.map(({ row: r, number }) => [r.key, number])).toEqual(
      [
        ['a', 3],
        ['c', 4],
      ]
    )
  })

  test('which group a category is under, so a category change that moves a row can follow it', () => {
    expect(serviceGroupOf('car_wash').label).toBe('Wash and standard')
    expect(serviceGroupOf('others').label).toBe('Wash and standard')
    expect(serviceGroupOf('detailing').label).toBe('Detailing')
    expect(serviceGroupOf('coating').label).toBe('Detailing')
    expect(serviceGroupOf('scratch_removal').label).toBe('Detailing')
  })

  test('an empty group is left out', () => {
    expect(
      groupRows([row({ category: 'scratch_removal' })]).map(
        (group) => group.key
      )
    ).toEqual(['detailing'])
    expect(groupRows([])).toEqual([])
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
      price: 450,
    })
  })
})
