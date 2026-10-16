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

  test('the ten the owner asked for, each once, none a package', () => {
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
    ])
    expect(new Set(SERVICE_TEMPLATES.map((template) => template.key)).size).toBe(10)
    for (const template of SERVICE_TEMPLATES) {
      expect(template.durationMins).toBeGreaterThan(0)
      expect(template.category).not.toBe('package')
    }
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
