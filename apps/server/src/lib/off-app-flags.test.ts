import { describe, expect, it } from 'bun:test'
import {
  OFF_APP_FLAG_RULES,
  aiSaysYes,
  inspectionCancelRuns,
  inspectionEvidenceKey,
  isMobileNumber,
  maskForAi,
  maskPhones,
  noteEvidenceKey,
  noteExcerpt,
  regularsEvidenceKey,
  regularsWentQuiet,
  runDays,
  scanNote,
  type InspectionCancel,
  type QuietChain,
} from './off-app-flags.js'

const NOW = new Date('2026-11-15T07:00:00+05:30')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

describe('scanNote', () => {
  it('a phone number, a UPI ID and plain wording are strong', () => {
    const note = 'Sir next time call 98400 14210 directly, GPay lakshmiwash@okaxis, less price'
    expect(scanNote(note)).toEqual({ found: ['phone', 'upi'], strength: 'strong' })
    expect(scanNote('Please pay directly to the boy, no need for the app').strength).toBe('strong')
    expect(scanNote('Book directly with us next time').found).toEqual(['wording'])
    expect(scanNote('Pay me directly').found).toEqual(['wording'])
    expect(scanNote('+91-98400-14210').found).toEqual(['phone'])
  })

  it('softer hints are weak: AI may look, nothing on their own', () => {
    expect(scanNote('GPay also fine').strength).toBe('weak')
    expect(scanNote('Next time call me').strength).toBe('weak')
  })

  it('prices, booking references, times and e-mails are not contact details', () => {
    expect(scanNote('Polish ₹ 1,200 extra, 2 hours, ready by 5:30').strength).toBeNull()
    expect(scanNote('Booking DT4790 moved to 12 Nov').strength).toBeNull()
    expect(scanNote('Send the photos to help@detlio.com').strength).toBeNull()
    expect(scanNote('Bill no 123456789012345').found).not.toContain('phone')
  })
})

describe('masking', () => {
  it('keeps the first two and last four digits of a number', () => {
    expect(maskPhones('call 98400 14210 now')).toBe('call 98•••• •4210 now')
    expect(maskPhones('call 9840014210, 5 cars')).toBe('call 98•••• •4210, 5 cars')
  })

  it('finds a number next to another figure', () => {
    expect(isMobileNumber('9840014210 5')).toBe(true)
    expect(maskPhones('9840014210 5')).toBe('98•••• •4210 5')
  })

  it('AI never sees a number or a UPI name', () => {
    const masked = maskForAi('GPay lakshmiwash@okaxis or 9840014210, bill 1234567')
    expect(masked).not.toMatch(/\d{5,}/)
    expect(masked).not.toContain('lakshmiwash')
    expect(masked).toContain('@okaxis')
  })

  it('the excerpt is masked and cut', () => {
    expect(noteExcerpt('call  9840014210')).toBe('call 98•••• •4210')
    expect(noteExcerpt('x'.repeat(400)).length).toBe(OFF_APP_FLAG_RULES.excerptMax)
  })

  it('only a plain yes from AI counts', () => {
    expect(aiSaysYes('Yes')).toBe(true)
    expect(aiSaysYes('yes.')).toBe(true)
    expect(aiSaysYes('No')).toBe(false)
    expect(aiSaysYes('Exterior washed by hand')).toBe(false)
  })

  it('one flag per note', () => {
    expect(noteEvidenceKey({ rootBookingId: 'b', where: 'bill_note', noteId: 'c' })).toBe('contact_in_note:b:bill_note:c')
  })
})

describe('regularsWentQuiet', () => {
  /** A customer with two completed bookings at the garage, the last `lastDaysAgo` days ago. */
  function regular(userId: string, vendorId: string, lastDaysAgo: number): QuietChain[] {
    return [
      { userId, vendorId, bookingId: `${userId}-1`, status: 'completed', bookedAt: daysAgo(lastDaysAgo + 31), serviceAt: daysAgo(lastDaysAgo + 30) },
      { userId, vendorId, bookingId: `${userId}-2`, status: 'completed', bookedAt: daysAgo(lastDaysAgo + 1), serviceAt: daysAgo(lastDaysAgo) },
    ]
  }

  it('flags a garage with 5+ stopped regulars who are 30%+ of them', () => {
    const chains = [
      ...['a', 'b', 'c', 'd', 'e'].flatMap((u) => regular(u, 'g', 45)),
      ...['f', 'g2', 'h', 'i', 'j', 'k'].flatMap((u) => regular(u, 'g', 5)),
      // One still books elsewhere.
      { userId: 'a', vendorId: 'other', bookingId: 'a-x', status: 'completed', bookedAt: daysAgo(4), serviceAt: daysAgo(3) },
    ]
    const [garage, ...rest] = regularsWentQuiet(chains, NOW)
    expect(rest).toEqual([])
    expect(garage).toMatchObject({ vendorId: 'g', regulars: 11, stopped: 5, bookingElsewhere: 1 })
    expect(garage!.customers.map((c) => c.userId).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('not with four stopped, nor under 30% of many', () => {
    expect(regularsWentQuiet(['a', 'b', 'c', 'd'].flatMap((u) => regular(u, 'g', 45)), NOW)).toEqual([])
    const big = [
      ...['a', 'b', 'c', 'd', 'e'].flatMap((u) => regular(u, 'g', 45)),
      ...Array.from({ length: 12 }, (_, i) => regular(`n${i}`, 'g', 5)).flat(),
    ]
    expect(regularsWentQuiet(big, NOW)).toEqual([])
  })

  it('a booking still to come counts as not stopped', () => {
    const chains = ['a', 'b', 'c', 'd', 'e'].flatMap((u) => regular(u, 'g', 45))
    chains.push({ userId: 'a', vendorId: 'g', bookingId: 'a-3', status: 'confirmed', bookedAt: daysAgo(40), serviceAt: new Date(NOW.getTime() + 86_400_000) })
    expect(regularsWentQuiet(chains, NOW)).toEqual([])
  })

  it('one per garage per 30 days', () => {
    expect(regularsEvidenceKey('g', NOW)).toBe(regularsEvidenceKey('g', new Date(NOW.getTime() + 60_000)))
    expect(regularsEvidenceKey('g', NOW)).not.toBe(regularsEvidenceKey('g', daysAgo(-31)))
  })
})

describe('inspectionCancelRuns', () => {
  const cancel = (id: string, days: number, userId = 'u', vendorId = 'g'): InspectionCancel => ({
    bookingId: id,
    userId,
    vendorId,
    cancelledAt: daysAgo(days),
    reason: null,
  })

  it('three in 90 days between the same customer and garage', () => {
    const runs = inspectionCancelRuns([cancel('a', 20), cancel('b', 12), cancel('c', 0), cancel('d', 5, 'other')], NOW)
    expect(runs).toHaveLength(1)
    expect(runs[0]!.bookings.map((b) => b.bookingId)).toEqual(['a', 'b', 'c'])
    expect(runDays(runs[0]!)).toBe(20)
    expect(inspectionEvidenceKey(runs[0]!)).toBe('cancelled_after_inspection:g:u:1')
  })

  it('not two, nor three spread over more than 90 days', () => {
    expect(inspectionCancelRuns([cancel('a', 10), cancel('b', 5)], NOW)).toEqual([])
    expect(inspectionCancelRuns([cancel('a', 100), cancel('b', 50), cancel('c', 5)], NOW)).toEqual([])
  })

  it('a new flag at the sixth, not the fourth', () => {
    const four = inspectionCancelRuns([cancel('a', 40), cancel('b', 30), cancel('c', 20), cancel('d', 10)], NOW)[0]!
    expect(inspectionEvidenceKey(four)).toBe('cancelled_after_inspection:g:u:1')
    const six = inspectionCancelRuns(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => cancel(id, 60 - i * 10)),
      NOW
    )[0]!
    expect(inspectionEvidenceKey(six)).toBe('cancelled_after_inspection:g:u:2')
  })
})
