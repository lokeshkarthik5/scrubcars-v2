import { describe, expect, test } from 'bun:test'
import {
  serviceNameKey,
  templateDescriptionProblem,
  templateIsNew,
  sameTemplateName,
  templateNameProblem,
} from './service-templates.js'

describe('a template description keeps the description rules', () => {
  test('a plain sentence or two of what is included passes', () => {
    expect(
      templateDescriptionProblem(
        'Underside and wheel arches rinsed to clear mud and flood-water grime, then an anti-rust spray on the chassis.'
      )
    ).toBeNull()
    expect(templateDescriptionProblem('Full clean.\n- Foam wash\n- Vacuum\n- Tyre polish')).toBeNull()
  })

  test('no prices, no times, no promises, never "ask the garage", each refused with the reason', () => {
    expect(templateDescriptionProblem('A foam wash for only ₹299.')).toBe(
      'The description can’t be saved: it mentioned a price or money.'
    )
    expect(templateDescriptionProblem('A foam wash, done in 45 minutes.')).toBe(
      'The description can’t be saved: it mentioned how long the service takes.'
    )
    expect(templateDescriptionProblem('A guaranteed flawless finish.')).toBe(
      'The description can’t be saved: it said "guaranteed", which Detlio does not claim.'
    )
    expect(templateDescriptionProblem('The best wash in town.')).toBe(
      'The description can’t be saved: it said "best", which Detlio does not claim.'
    )
    expect(templateDescriptionProblem('Ask the garage which wax it uses.')).toBe(
      'The description can’t be saved: it tells customers to ask, call or contact the garage, and they can’t reach a garage before booking.'
    )
    expect(templateDescriptionProblem('Call ahead to check the bay is free.')).toContain('ask, call or contact')
    // The callipers are not a call.
    expect(templateDescriptionProblem('New pads fitted and the callipers checked.')).toBeNull()
  })

  test('the shape: required, two sentences at most, a full stop', () => {
    expect(templateDescriptionProblem('   ')).toBe('Write a description: what the service includes, in a sentence or two.')
    expect(templateDescriptionProblem('One. Two. Three.')).toBe('The description can’t be saved: it was more than two sentences.')
    expect(templateDescriptionProblem('No full stop')).toBe('The description can’t be saved: it did not end with a full stop.')
    expect(templateDescriptionProblem(`${'x'.repeat(200)}.`)).toContain('the limit is 200')
  })
})

describe('a template name', () => {
  test('required, short, and no claims', () => {
    expect(templateNameProblem('Monsoon underbody wash')).toBeNull()
    expect(templateNameProblem('  ')).toBe('Give the template a name.')
    expect(templateNameProblem('x'.repeat(81))).toBe('The name is 81 characters; the limit is 80.')
    expect(templateNameProblem('Certified ceramic coating')).toBe(
      'The name can’t be saved: it says “certified”, which Detlio does not claim.'
    )
    expect(templateNameProblem('---')).toBe('Give the template a name.')
    expect(templateNameProblem('கார் வாஷ்')).toBeNull()
  })

  test('a name never carries a price: every garage sets its own', () => {
    for (const name of ['Foam wash ₹499', 'Foam wash Rs 499', 'Foam wash 499/-', 'Low price wash']) {
      expect(templateNameProblem(name)).toBe(
        'The name can’t be saved: it mentions a price or money. Every garage sets its own.'
      )
    }
    expect(templateNameProblem('Wheel alignment & balancing')).toBeNull()
  })

  test('names compare without case, spacing or punctuation', () => {
    expect(serviceNameKey('  Engine-bay   Cleaning! ')).toBe('engine bay cleaning')
    expect(serviceNameKey('FOAM WASH')).toBe(serviceNameKey('foam-wash'))
    expect(sameTemplateName('Foam-wash', 'FOAM WASH')).toBe(true)
  })

  test('two different names in Tamil are two names; the same one in any case is one', () => {
    expect(sameTemplateName('கார் வாஷ்', 'பைக் வாஷ்')).toBe(false)
    expect(sameTemplateName(' கார் வாஷ் ', 'கார் வாஷ்')).toBe(true)
    expect(sameTemplateName('கார் வாஷ்', 'Car wash')).toBe(false)
  })
})

describe('New', () => {
  const now = new Date('2026-11-18T06:00:00Z')
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000)

  test('a template the team added in the last 14 days', () => {
    expect(templateIsNew({ builtIn: false, createdAt: daysAgo(0) }, now)).toBe(true)
    expect(templateIsNew({ builtIn: false, createdAt: daysAgo(13.9) }, now)).toBe(true)
    expect(templateIsNew({ builtIn: false, createdAt: daysAgo(14) }, now)).toBe(false)
  })

  test('never a built-in, though 0082 created them all today', () => {
    expect(templateIsNew({ builtIn: true, createdAt: daysAgo(0) }, now)).toBe(false)
  })
})
