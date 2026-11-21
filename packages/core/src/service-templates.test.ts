import { describe, expect, test } from 'bun:test'
import { serviceNameKey, templatesNotIn } from './service-templates'

// The templates themselves live in the database since 0082; their words are
// held to the rules by the server (service-templates-seed.test.ts and the
// save's own check). This is the editor's "hide what the garage has".
const TEMPLATES = [
  { name: 'Foam wash' },
  { name: 'Body wash' },
  { name: 'Ceramic coating' },
  { name: 'Engine bay cleaning' },
  { name: 'Monsoon underbody wash' },
]

describe('templatesNotIn', () => {
  test('leaves out what the garage already has, however it was typed', () => {
    const left = templatesNotIn(TEMPLATES, ['FOAM WASH', ' body-wash ', 'Ceramic Coating'])
    expect(left.map((template) => template.name)).toEqual(['Engine bay cleaning', 'Monsoon underbody wash'])
  })

  test('a garage with nothing gets them all, in order; a blank name matches none', () => {
    expect(templatesNotIn(TEMPLATES, [])).toEqual(TEMPLATES)
    expect(templatesNotIn(TEMPLATES, ['', '  '])).toEqual(TEMPLATES)
  })

  test('keeps whatever else a template carries', () => {
    const withIds = TEMPLATES.map((template, i) => ({ ...template, id: `t${i}`, isNew: i === 4 }))
    expect(templatesNotIn(withIds, ['Foam wash'])[3]).toEqual({ name: 'Monsoon underbody wash', id: 't4', isNew: true })
  })

  test('names compare without case, spacing or punctuation', () => {
    expect(serviceNameKey('  Engine-bay   Cleaning! ')).toBe('engine bay cleaning')
  })
})
