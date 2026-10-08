import { describe, expect, test } from 'bun:test'
import { containsPattern, matchedServiceName } from './search.js'

describe('containsPattern', () => {
  test("makes the searcher's own wildcards literal", () => {
    expect(containsPattern('50%_off\\')).toBe('%50\\%\\_off\\\\%')
    expect(containsPattern('Priya')).toBe('%Priya%')
  })

  test('"a_b" and "100%" are text, not patterns', () => {
    expect(containsPattern('a_b')).toBe('%a\\_b%')
    expect(containsPattern('100%')).toBe('%100\\%%')
  })

  test('a lone wildcard no longer matches everything', () => {
    expect(containsPattern('%')).toBe('%\\%%')
    expect(containsPattern('_')).toBe('%\\_%')
    expect(containsPattern('\\')).toBe('%\\\\%')
  })
})

describe('matchedServiceName', () => {
  const garage = {
    businessName: 'Marina Auto Care',
    city: 'Chennai',
    services: [{ name: 'Foam Wash' }, { name: 'Ceramic Coating' }, { name: 'Interior Deep Clean' }],
  }

  test('names the service a garage was found by', () => {
    expect(matchedServiceName('ceramic', garage)).toBe('Ceramic Coating')
    expect(matchedServiceName('  INTERIOR ', garage)).toBe('Interior Deep Clean')
  })

  test('says nothing when the garage was found by its name or city', () => {
    expect(matchedServiceName('marina', garage)).toBeNull()
    expect(matchedServiceName('chennai', garage)).toBeNull()
    // "Care" is in the name, so a service with it would explain nothing.
    expect(
      matchedServiceName('care', { ...garage, services: [{ name: 'Paint Care' }] })
    ).toBeNull()
  })

  test('the first service alphabetically when several match', () => {
    const many = { ...garage, services: [{ name: 'Wash Plus' }, { name: 'Foam Wash' }] }
    expect(matchedServiceName('wash', many)).toBe('Foam Wash')
  })

  test('nothing when nothing matches, or nothing was typed', () => {
    expect(matchedServiceName('polish', garage)).toBeNull()
    expect(matchedServiceName('   ', garage)).toBeNull()
  })

  test('wildcards are plain characters here too', () => {
    expect(matchedServiceName('%', garage)).toBeNull()
    expect(
      matchedServiceName('100%', { ...garage, services: [{ name: '100% Hand Wash' }] })
    ).toBe('100% Hand Wash')
  })

  test('a garage with no city still works', () => {
    expect(matchedServiceName('foam', { ...garage, city: null })).toBe('Foam Wash')
  })
})
