import { describe, expect, test } from 'bun:test'
import type { HomeAudience, HomeConfig } from './api/admin'
import {
  audienceOptions,
  audienceProblem,
  homeErrorPlacement,
  homeFieldError,
  homeTitleForSave,
} from './home-offer-form'

const AUDIENCES: HomeAudience[] = [
  'everyone',
  'new_customers',
  'booked_this_garage',
  'near_this_garage',
  'wash_due',
  'car_type',
]

/** As GET /admin/discounts/home-config answers, with targeting on or off. */
function config(targetingEnabled: boolean): Pick<HomeConfig, 'audiences'> {
  return {
    audiences: AUDIENCES.map((value) => ({
      value,
      label: value,
      enabled: value === 'everyone' || targetingEnabled,
    })),
  }
}

describe('audienceOptions', () => {
  test('targeting off: everything but Everyone is disabled (TARGETING_DISABLED)', () => {
    const options = audienceOptions(config(false), 'garage-1')
    expect(options.map((o) => o.value)).toEqual(AUDIENCES)
    expect(options.filter((o) => !o.disabled).map((o) => o.value)).toEqual(['everyone'])
    expect(options.filter((o) => o.disabled).every((o) => o.disabledBy === 'targeting')).toBe(true)
  })

  test('targeting off, no garage: no "Pick a garage above", since a garage would not unlock them', () => {
    const options = audienceOptions(config(false), '')
    expect(options.filter((o) => o.disabled).every((o) => o.disabledBy === 'targeting')).toBe(true)
    expect(options.some((o) => o.hint === 'Pick a garage above')).toBe(false)
  })

  test('targeting on: the garage audiences wait for a garage', () => {
    const noGarage = audienceOptions(config(true), '')
    const garageOnly = noGarage.filter((o) => o.disabled)
    expect(garageOnly.map((o) => o.value)).toEqual(['booked_this_garage', 'near_this_garage'])
    expect(garageOnly.every((o) => o.disabledBy === 'garage' && o.hint === 'Pick a garage above')).toBe(true)

    expect(audienceOptions(config(true), 'garage-1').some((o) => o.disabled)).toBe(false)
  })

  test("the form's wording", () => {
    const labels = audienceOptions(config(true), 'garage-1').map((o) => o.label)
    expect(labels).toEqual([
      'Everyone',
      'New customers (no paid booking yet)',
      'Customers who booked this garage before',
      'Customers near this garage',
      'Customers whose wash is due or overdue',
      'By car type',
    ])
  })
})

describe('audienceProblem', () => {
  const base = {
    audience: 'everyone' as HomeAudience,
    storedAudience: null,
    vendorId: 'garage-1',
    targetingEnabled: true,
    radiusKm: '10',
    maxRadiusKm: 50,
    vehicleTypes: [] as string[],
  }

  test('Everyone always saves', () => {
    expect(audienceProblem({ ...base, targetingEnabled: false, vendorId: '' })).toBeNull()
  })

  test('a targeted audience chosen while targeting is off is refused, a saved one is kept', () => {
    expect(audienceProblem({ ...base, audience: 'wash_due', targetingEnabled: false })).toContain('Everyone')
    expect(
      audienceProblem({ ...base, audience: 'wash_due', storedAudience: 'wash_due', targetingEnabled: false })
    ).toBeNull()
  })

  test('the garage audiences need a garage, near needs a distance, car type a type', () => {
    expect(audienceProblem({ ...base, audience: 'near_this_garage', vendorId: '' })).toBe(
      'Pick a garage above, or choose another audience.'
    )
    expect(audienceProblem({ ...base, audience: 'near_this_garage', radiusKm: '0' })).toBe(
      'Pick a distance from 1 to 50 km.'
    )
    expect(audienceProblem({ ...base, audience: 'near_this_garage', radiusKm: '2.5' })).not.toBeNull()
    expect(audienceProblem({ ...base, audience: 'near_this_garage', radiusKm: '5' })).toBeNull()
    expect(audienceProblem({ ...base, audience: 'car_type' })).toBe('Pick at least one car type.')
    expect(audienceProblem({ ...base, audience: 'car_type', vehicleTypes: ['suv'] })).toBeNull()
  })
})

describe('homeFieldError', () => {
  test('banned words sit under the title', () => {
    expect(homeFieldError({ code: 'COPY_NOT_ALLOWED', message: 'Offer titles can\'t say "cheap".' })).toEqual({
      target: 'title',
      message: 'Offer titles can\'t say "cheap".',
    })
  })

  test('targeting switched off sits under Who sees it', () => {
    const placed = homeFieldError({ code: 'TARGETING_DISABLED', message: 'Targeted offers use booking history.' })
    expect(placed?.target).toBe('audience')
    expect(placed?.message).toBe('Only "Everyone" can be saved right now. Targeted offers use booking history.')
  })

  test('the whole-row rules sit in the section', () => {
    expect(homeFieldError({ code: 'DISCOUNT_HOME_INVALID', message: 'An offer on Home needs an end date.' })?.target).toBe(
      'section'
    )
    expect(homeFieldError({ code: 'DISCOUNT_INVALID', message: "These settings don't fit together." })?.target).toBe(
      'section'
    )
  })

  test('anything else is left to the form', () => {
    expect(homeFieldError({ code: 'DISCOUNT_CODE_TAKEN', message: 'That code already exists.' })).toBeNull()
    expect(homeFieldError({ message: 'Network down' })).toBeNull()
  })
})

describe('homeTitleForSave', () => {
  test('a title of 3 or more characters is kept, trimmed; a shorter one is not', () => {
    expect(homeTitleForSave('  20% off any service ', true)).toBe('20% off any service')
    expect(homeTitleForSave('20% off any service', false)).toBe('20% off any service')
    expect(homeTitleForSave('ab', false)).toBeNull()
  })

  test('with Show on Home off, a title the server would refuse is not sent', () => {
    // The server checks the words of any title, so sending it would fail the
    // save over a field that is folded away.
    expect(homeTitleForSave('Guaranteed shine', false)).toBeNull()
    expect(homeTitleForSave('Lifetime offer', false)).toBeNull()
  })

  test('with it on, the title goes as typed (the form blocks a banned one first)', () => {
    expect(homeTitleForSave('Guaranteed shine', true)).toBe('Guaranteed shine')
  })
})

describe('homeErrorPlacement', () => {
  const title = { target: 'title' as const, message: 'Offer titles can\'t say "lifetime".' }
  const audience = { target: 'audience' as const, message: 'Only "Everyone" can be saved right now.' }
  const section = { target: 'section' as const, message: 'An offer on Home needs an end date.' }

  test('no Home refusal: nothing placed, the form says the rest by Save', () => {
    expect(homeErrorPlacement(null, true)).toEqual({ inPlace: null, bySave: null })
  })

  test('section open: beside the field, with a pointer by Save', () => {
    expect(homeErrorPlacement(title, true)).toEqual({
      inPlace: 'title',
      bySave: 'Not saved: see Show on Home above.',
    })
    expect(homeErrorPlacement(audience, true).inPlace).toBe('audience')
  })

  test('section folded away: the whole message by Save, never silent', () => {
    expect(homeErrorPlacement(title, false)).toEqual({ inPlace: null, bySave: title.message })
    expect(homeErrorPlacement(audience, false)).toEqual({ inPlace: null, bySave: audience.message })
  })

  test('the section-wide slot is always drawn', () => {
    expect(homeErrorPlacement(section, false).inPlace).toBe('section')
  })
})
