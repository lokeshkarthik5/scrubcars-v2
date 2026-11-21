import { describe, expect, test } from 'bun:test'
import { bannedPhraseIn } from './copy-rules'
import {
  SERVICE_TEMPLATES,
  serviceNameKey,
  templatesNotIn,
} from './service-templates'

describe('service templates', () => {
  test('every description passes the copy rules', () => {
    for (const template of SERVICE_TEMPLATES) {
      expect({ name: template.name, banned: bannedPhraseIn(template.description) }).toEqual({
        name: template.name,
        banned: null,
      })
      expect(bannedPhraseIn(template.name)).toBeNull()
    }
  })

  test('each is a plain one or two sentences, short enough for the garage page', () => {
    for (const template of SERVICE_TEMPLATES) {
      expect(template.description.length).toBeLessThanOrEqual(200)
      expect(template.description.endsWith('.')).toBe(true)
      expect(template.description.split(/(?<=\.)\s+/).length).toBeLessThanOrEqual(2)
      // Prices are the garage's own; the template never carries one.
      expect(template.description).not.toMatch(/₹|\brs\b|rupee/i)
      // A customer can't reach a garage before booking, so nothing tells
      // them to ask it.
      expect(template.description).not.toMatch(/\bask\b|\bcontact\b|\bcall\b/i)
    }
  })

  test('the ones the owner asked for, each once, none a package', () => {
    expect(SERVICE_TEMPLATES.map((template) => template.name)).toEqual([
      'Foam wash',
      'Body wash',
      'Full wash',
      'Interior cleaning',
      'Ceramic coating',
      'Polishing',
      'Engine bay cleaning',
      'Underbody wash',
      'Headlight restoration',
      'Bike wash',
      'General service',
      'Oil change',
      'Wheel alignment & balancing',
      'Brake pads',
      'AC service',
      'Clutch repair',
      'Dent repair',
      'Panel painting',
    ])
    expect(new Set(SERVICE_TEMPLATES.map((template) => template.key)).size).toBe(18)
    for (const template of SERVICE_TEMPLATES) {
      expect(template.durationMins).toBeGreaterThan(0)
      expect(template.category).not.toBe('package')
    }
  })
})

describe('template categories (owner, 16 Nov 2026)', () => {
  const byName = Object.fromEntries(SERVICE_TEMPLATES.map((template) => [template.name, template]))

  test('each lands under the category the screens show', () => {
    expect(
      Object.fromEntries(SERVICE_TEMPLATES.map((template) => [template.name, template.category]))
    ).toEqual({
      'Foam wash': 'car_wash',
      'Body wash': 'car_wash',
      'Full wash': 'car_wash',
      'Interior cleaning': 'car_wash',
      'Ceramic coating': 'coating',
      Polishing: 'detailing',
      // Moved from Others: degrease and dress is detailing work.
      'Engine bay cleaning': 'detailing',
      'Underbody wash': 'car_wash',
      'Headlight restoration': 'detailing',
      'Bike wash': 'others',
      'General service': 'general_service',
      'Oil change': 'general_service',
      'Wheel alignment & balancing': 'general_service',
      'Brake pads': 'repairs',
      'AC service': 'repairs',
      'Clutch repair': 'repairs',
      'Dent repair': 'dent_paint',
      'Panel painting': 'dent_paint',
    })
  })

  test('the new ones take the duration and pricing of the mockup table', () => {
    const shape = (name: string) => [byName[name]!.durationMins, byName[name]!.pricingType]
    expect(shape('General service')).toEqual([180, 'per_vehicle'])
    expect(shape('Oil change')).toEqual([45, 'per_vehicle'])
    expect(shape('Wheel alignment & balancing')).toEqual([45, 'flat'])
    expect(shape('Brake pads')).toEqual([60, 'per_vehicle'])
    expect(shape('AC service')).toEqual([90, 'per_vehicle'])
    expect(shape('Clutch repair')).toEqual([1440, 'on_inspection'])
    expect(shape('Dent repair')).toEqual([120, 'on_inspection'])
    expect(shape('Panel painting')).toEqual([1440, 'per_vehicle'])
  })
})

describe('templatesNotIn', () => {
  test('leaves out what the garage already has, however it was typed', () => {
    const left = templatesNotIn(['FOAM WASH', ' body-wash ', 'Ceramic Coating'])
    expect(left.map((template) => template.name)).not.toContain('Foam wash')
    expect(left.map((template) => template.name)).not.toContain('Body wash')
    expect(left.map((template) => template.name)).not.toContain('Ceramic coating')
    expect(left).toHaveLength(SERVICE_TEMPLATES.length - 3)
  })

  test('a garage with nothing gets them all, in order; a blank name matches none', () => {
    expect(templatesNotIn([])).toEqual([...SERVICE_TEMPLATES])
    expect(templatesNotIn(['', '  '])).toEqual([...SERVICE_TEMPLATES])
  })

  test('names compare without case, spacing or punctuation', () => {
    expect(serviceNameKey('  Engine-bay   Cleaning! ')).toBe('engine bay cleaning')
  })
})
