import { describe, expect, test } from 'bun:test'
import { DEFAULT_PICKUP_FEE_SETTINGS as S, FREE_PICKUP_FEE, feeAtRoadKm } from './pickup-fee'
import {
  acceptedLine,
  defaultFeeChoice,
  draftIsSaved,
  draftOf,
  draftPlan,
  draftProblems,
  earningsFeeLabel,
  feeBoxText,
  feeChipLabel,
  feeOfDraft,
  isDetliosDraft,
  requestDistanceLine,
  requestFeeChoices,
  requestFeeLabel,
  requestFeeNote,
  requestTag,
  roadKmFootnote,
} from './pickup-fee-garage'

describe('the Pickup fee part', () => {
  test('By distance starts on Detlio’s numbers', () => {
    const draft = draftOf({ ...FREE_PICKUP_FEE, mode: 'distance' }, S.suggested)
    expect(draft).toMatchObject({ freeKm: '3', perKm: '15', minCharge: '99', maxCharge: '399' })
    expect(isDetliosDraft(draft, S.suggested)).toBe(true)
    expect(isDetliosDraft({ ...draft, perKm: '20' }, S.suggested)).toBe(false)
  })

  test('the boxes refuse more than the limits, with the hint’s words', () => {
    const fixed = { ...draftOf(FREE_PICKUP_FEE, S.suggested), mode: 'fixed' as const, fixed: '350' }
    expect(draftProblems(fixed, S)).toEqual({ fixed: 'Up to ₹299 for a fixed fee. That’s Detlio’s limit.' })
    expect(draftProblems({ ...fixed, fixed: '150' }, S)).toEqual({})
    const distance = { ...draftOf({ ...FREE_PICKUP_FEE, mode: 'distance' }, S.suggested), perKm: '31' }
    expect(draftProblems(distance, S)).toEqual({ perKm: '₹5–₹30' })
    expect(draftProblems({ ...distance, perKm: '20', maxCharge: '650' }, S)).toEqual({ maxCharge: 'Up to ₹599' })
  })

  test('the table follows the boxes', () => {
    const draft = { ...draftOf({ ...FREE_PICKUP_FEE, mode: 'distance' }, S.suggested), perKm: '20' }
    expect(feeAtRoadKm(draftPlan(draft, S), 10)).toBe(140)
  })

  test('nothing to save while the boxes say what is saved', () => {
    const saved = { ...FREE_PICKUP_FEE, mode: 'distance' as const }
    const draft = draftOf(saved, S.suggested)
    expect(draftIsSaved(draft, saved, S)).toBe(true)
    expect(draftIsSaved({ ...draft, perKm: '20' }, saved, S)).toBe(false)
    expect(draftIsSaved({ ...draft, mode: 'free' }, saved, S)).toBe(false)
    expect(feeOfDraft({ ...draft, perKm: '' }).perKm).toBeNull()
  })

  test('box text keeps digits, one decimal for km', () => {
    expect(feeBoxText('₹3a50', false)).toBe('350')
    expect(feeBoxText('2.55', true)).toBe('2.5')
    expect(feeBoxText('12345', false)).toBe('1234')
  })

  test('the footnote names the road factor and rounding', () => {
    expect(roadKmFootnote(S.suggested)).toBe(
      "Road km = straight line from your garage’s pin × 1.3. Rounded to the nearest ₹10. Never more than the booking's service price."
    )
  })
})

describe('the Requests card', () => {
  test('Ask for pickup: tag, label, chips, note', () => {
    expect(requestTag('pickup', false)).toBe('New request · Ask for pickup')
    expect(requestTag('doorstep', false)).toBe('New request · outside your area')
    expect(requestFeeLabel('pickup')).toBe('Pickup fee (the customer sees it before paying)')
    expect(requestFeeNote(120, 11, 25)).toBe(
      '₹120 is Detlio’s suggestion for 11 km. You can ask up to 25% more. You keep the whole fee.'
    )
    expect(feeChipLabel(120)).toBe('₹120')
    expect(feeChipLabel(0)).toBe('None')
  })

  test('chips: the server’s, or ₹0/₹100/₹200 from an older API; the suggestion picked first', () => {
    expect(requestFeeChoices({ feeChoices: [120, 130, 140, 150] }, [0, 100, 200])).toEqual([120, 130, 140, 150])
    expect(requestFeeChoices({}, [0, 100, 200])).toEqual([0, 100, 200])
    expect(defaultFeeChoice({ feeChoices: [120, 130], suggestedFee: 120 })).toBe(120)
    expect(defaultFeeChoice({})).toBe(0)
  })

  test('distance line and accepted line', () => {
    expect(
      requestDistanceLine({ beyond: "You don't offer pickup yet", distanceKm: 8.5, roadKm: 11, offersPickup: false })
    ).toBe("You don't offer pickup yet · 11 km by road")
    expect(requestDistanceLine({ beyond: '3.9 km beyond your 5 km', distanceKm: 8.9 })).toBe(
      '3.9 km beyond your 5 km · 8.9 km from you'
    )
    expect(acceptedLine({ mode: 'pickup', start: 'Mon 17 Nov, 4:00 pm', fee: 180, confirmBy: '2:15 pm' })).toBe(
      'Accepted · starts Mon 17 Nov, 4:00 pm · pickup fee ₹180 · customer confirms by 2:15 pm'
    )
  })
})

describe('Earnings', () => {
  test('the pickup fee line names the road km', () => {
    expect(earningsFeeLabel({ bookingType: 'pickup', roadKm: 6.2 })).toBe('Pickup & drop · 6.2 km (yours, no commission)')
    expect(earningsFeeLabel({ bookingType: 'doorstep', roadKm: null })).toBe('Travel fee (yours, no commission)')
  })
})
