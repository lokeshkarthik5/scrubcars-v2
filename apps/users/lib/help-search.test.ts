import { describe, expect, test } from 'bun:test'
import { countQuestions, searchHelp } from './help-search'
import { HELP_GROUPS, HELP_STILL_NEED } from '../components/help/content'

const ids = (groups: typeof HELP_GROUPS) => groups.flatMap((group) => group.questions.map((q) => q.id))

describe('searchHelp', () => {
  test('nothing typed shows every question', () => {
    expect(searchHelp(HELP_GROUPS, '')).toBe(HELP_GROUPS)
    expect(searchHelp(HELP_GROUPS, '  ?! ')).toBe(HELP_GROUPS)
  })

  test('every word must match the start of a word, in any order and any case', () => {
    expect(ids(searchHelp(HELP_GROUPS, 'Delivery CODE'))).toEqual(['pickup-codes'])
    expect(ids(searchHelp(HELP_GROUPS, 'code delivery'))).toEqual(['pickup-codes'])
    expect(ids(searchHelp(HELP_GROUPS, 'refun'))).toContain('refund-when')
    // Inside a word is not a match: "fun" is not "refund".
    expect(ids(searchHelp(HELP_GROUPS, 'fun'))).not.toContain('refund-when')
    expect(searchHelp(HELP_GROUPS, 'zebra crossing')).toEqual([])
  })

  test("a group's title counts, and groups with nothing left are dropped", () => {
    const doorstep = searchHelp(HELP_GROUPS, 'doorstep outside')
    expect(doorstep.map((group) => group.id)).toEqual(['doorstep'])
    expect(countQuestions(doorstep)).toBe(1)
    // "&" reads as "and".
    expect(searchHelp(HELP_GROUPS, 'payments and refunds').map((group) => group.id)).toContain('payments')
  })
})

describe('the Help centre copy', () => {
  test('the six groups the owner asked for, in order', () => {
    expect(HELP_GROUPS.map((group) => group.title)).toEqual([
      'Booking',
      'Payments & refunds',
      'Pickup & drop',
      'Doorstep',
      'Account & privacy',
      'Complaints',
    ])
  })

  test('every question has a unique id for its anchor and a short answer', () => {
    const all = ids(HELP_GROUPS)
    expect(new Set(all).size).toBe(all.length)
    for (const group of HELP_GROUPS) {
      for (const question of group.questions) {
        expect(question.id).toMatch(/^[a-z0-9-]+$/)
        expect(question.a.length).toBeGreaterThan(0)
        expect(question.a.join(' ').length).toBeLessThan(600)
      }
    }
  })

  test('the rules are said as the code has them', () => {
    const text = JSON.stringify(HELP_GROUPS)
    // Notice periods, the change cutoff, reschedules, the complaint clock.
    expect(text).toContain('at least 1 hour from now at the garage, and at least 3 hours for Doorstep and Pickup & drop')
    expect(text).toContain('up to 2 hours before your slot')
    expect(text).toContain('reschedule up to twice')
    expect(text).toContain('within 24 hours and aim to resolve it within 7 days')
    expect(text).toContain("The garage is responsible for your car from pickup until it's returned.")
    expect(text).toContain('within 5–7 working days')
    // No promises the product does not keep.
    expect(text).not.toMatch(/guarantee|instant refund|we will notify|we'll notify|SMS you/i)
  })

  test('no garage phone before booking: the answer sends customers to their booking', () => {
    const answer = HELP_GROUPS.flatMap((group) => group.questions).find((q) => q.id === 'garage-contact')!
    expect(answer.a.join(' ')).toContain('once you have booked it')
  })

  test('the page ends with Contact and Raise a complaint', () => {
    expect(HELP_STILL_NEED.contact.href).toBe('/contact')
    expect(HELP_STILL_NEED.complaint.href).toBe('/contact#raise-complaint')
  })
})
