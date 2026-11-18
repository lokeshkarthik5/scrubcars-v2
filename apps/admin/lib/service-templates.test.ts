import { describe, expect, test } from 'bun:test'
import type { ServiceTemplate } from '@repo/core/service-templates'
import { emptyServiceRow } from './service-editor'
import {
  durationChoices,
  pricedByLabel,
  templateCounts,
  templateFormFromRow,
  templateFormProblem,
  templateGroups,
  templateHistory,
  templatePayload,
  templatesForTab,
} from './service-templates'

const NOW = Date.parse('2026-11-18T06:30:00Z')

function template(overrides: Partial<ServiceTemplate> = {}): ServiceTemplate {
  return {
    id: 't-1',
    key: null,
    name: 'Monsoon underbody wash',
    category: 'car_wash',
    durationMins: 40,
    pricingType: 'flat',
    description: 'Underside and wheel arches rinsed to clear mud and flood-water grime.',
    isOn: true,
    builtIn: false,
    isNew: true,
    createdByName: 'Priya',
    updatedByName: 'Priya',
    sourceVendorId: null,
    sourceVendorName: null,
    createdAt: '2026-11-17T05:00:00.000Z',
    updatedAt: '2026-11-17T05:00:00.000Z',
    ...overrides,
  }
}

describe('the list', () => {
  const list = [
    template({ id: 'a', name: 'Foam wash', builtIn: true, isNew: false }),
    template({ id: 'b', name: 'Clutch repair', category: 'repairs', isOn: false }),
    template({ id: 'c', name: 'Bike wash', category: 'others' }),
    template({ id: 'd', name: 'Monsoon underbody wash' }),
  ]

  test('All, On and Off with their counts', () => {
    expect(templateCounts(list)).toEqual({ all: 4, on: 3, off: 1 })
    expect(templatesForTab(list, 'off').map((t) => t.name)).toEqual(['Clutch repair'])
    expect(templatesForTab(list, 'on').map((t) => t.name)).toEqual(['Foam wash', 'Bike wash', 'Monsoon underbody wash'])
  })

  test('grouped by category in the usual order, the API’s order kept within', () => {
    expect(templateGroups(list).map((g) => [g.label, g.templates.map((t) => t.id)])).toEqual([
      ['Car wash', ['a', 'd']],
      ['Repairs', ['b']],
      ['Others', ['c']],
    ])
  })

  test('priced by, in the editor’s words', () => {
    expect(pricedByLabel('per_vehicle')).toBe('By car type')
    expect(pricedByLabel('flat')).toBe('Same for all cars')
    expect(pricedByLabel('on_inspection')).toBe('After inspection')
  })
})

describe('the sheet', () => {
  test('where it came from, and who changed it since', () => {
    expect(
      templateHistory(template({ sourceVendorId: 'v', sourceVendorName: 'Shine Auto Spa – Anna Nagar' }), NOW)
    ).toBe('Saved from Shine Auto Spa – Anna Nagar’s service by Priya, yesterday.')
    expect(templateHistory(template({ sourceVendorId: null, sourceVendorName: null }), NOW)).toBe('Added by Priya, yesterday.')
    // The garage has gone since: the line still says where, without a name.
    expect(templateHistory(template({ sourceVendorId: null, sourceVendorName: 'Kumar Auto Spa' }), NOW)).toContain('Kumar Auto Spa')
    expect(templateHistory(template({ builtIn: true, createdByName: null, updatedByName: null }), NOW)).toBeNull()
    expect(
      templateHistory(
        template({ builtIn: true, createdByName: null, updatedByName: 'Raga', updatedAt: '2026-11-18T05:00:00.000Z' }),
        NOW
      )
    ).toBe('Last changed by Raga, today.')
  })

  test('Save as template takes the row’s words and shape, never its prices', () => {
    const row = {
      ...emptyServiceRow('others'),
      name: ' Rat repellent treatment ',
      pricingType: 'flat' as const,
      price: '599',
      durationValue: '30',
      description: 'Engine bay dusted off and a rodent-repellent spray applied.',
    }
    const form = templateFormFromRow(row)
    expect(form).toEqual({
      name: 'Rat repellent treatment',
      category: 'others',
      durationMins: 30,
      pricingType: 'flat',
      description: 'Engine bay dusted off and a rodent-repellent spray applied.',
      isOn: true,
    })
    expect(Object.keys(templatePayload(form)).some((key) => key.startsWith('price'))).toBe(false)
    // No duration set on the service: Usual time is left to pick.
    expect(templateFormFromRow({ ...row, durationValue: '' }).durationMins).toBeNull()
    expect(templateFormProblem({ ...form, durationMins: null })).toBe('Pick a usual time.')
    expect(templateFormProblem({ ...form, name: ' ' })).toBe('Give the template a name.')
    expect(templateFormProblem({ ...form, description: '' })).toBe(
      'Write a description: what the service includes, in a sentence or two.'
    )
    expect(templateFormProblem(form)).toBeNull()
  })

  test('Usual time offers the presets and the template’s own', () => {
    expect(durationChoices(45).map((c) => c.label)).toEqual(['30 min', '45 min', '60 min', '90 min', '120 min', '3 h', '4 h', '1 day'])
    expect(durationChoices(40).map((c) => c.value)).toContain(40)
  })
})
