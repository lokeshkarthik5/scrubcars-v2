import { describe, expect, test } from 'bun:test'
import { CLIENT_EVENTS } from './analytics.js'
import {
  BEHAVIOUR_EVENTS,
  BEHAVIOUR_STEPS,
  behaviourFunnel,
  LAST_STEP_LABELS,
  lastStepsBeforeLeaving,
  sourceOf,
  summariseBehaviour,
  type BehaviourSessionGroup,
} from './behaviour.js'

/** Visits that did these events, last one last. */
function visits(sessions: number, names: string[], extra: Partial<BehaviourSessionGroup> = {}): BehaviourSessionGroup {
  return {
    names: [...new Set(names)].sort(),
    lastName: names[names.length - 1] ?? null,
    signedIn: false,
    team: false,
    test: false,
    sessions,
    ...extra,
  }
}

const counts = (groups: BehaviourSessionGroup[]) =>
  Object.fromEntries(behaviourFunnel(groups).steps.map((step) => [step.key, step.count]))

describe('the steps', () => {
  test('landed to paid, in order, from events the app sends', () => {
    expect(BEHAVIOUR_STEPS.map((step) => step.label)).toEqual([
      'Landed',
      'Saw a garage',
      'Picked an area',
      'Opened a garage',
      'Opened a service',
      'Started booking',
      'Gave a number',
      'Paid',
    ])
    for (const event of BEHAVIOUR_EVENTS) expect(CLIENT_EVENTS).toContain(event as never)
  })

  test('every event the app sends has words for "last step before leaving"', () => {
    for (const event of CLIENT_EVENTS) {
      if (['review_submit', 'complaint_submit', 'pay_success'].includes(event)) continue
      expect(`${event}: ${typeof LAST_STEP_LABELS[event]}`).toBe(`${event}: string`)
    }
  })
})

describe('the funnel', () => {
  const groups = [
    // 10 landed and left.
    visits(10, ['app_open', 'landing_view']),
    // 6 saw a garage, picked an area and left.
    visits(6, ['app_open', 'landing_view', 'garage_card_seen', 'area_pick']),
    // 3 went on to a garage and a service.
    visits(3, ['app_open', 'landing_view', 'garage_card_seen', 'area_pick', 'garage_view', 'service_sheet_open']),
    // 1 went all the way: Book Now, a code, paid.
    visits(1, [
      'app_open',
      'landing_view',
      'garage_card_seen',
      'area_pick',
      'garage_view',
      'service_add',
      'booking_start',
      'otp_sent',
      'checkout_start',
      'pay_success',
    ]),
    // Never landed (a garage link from Instagram): not in this funnel.
    visits(50, ['app_open', 'garage_view', 'pay_success']),
  ]

  test('counts visits that landed, step by step', () => {
    expect(counts(groups)).toEqual({
      landed: 20,
      garageSeen: 10,
      area: 10,
      garage: 4,
      service: 4,
      booking: 1,
      number: 1,
      paid: 1,
    })
  })

  test('what was lost at each step, its share, and the biggest leak', () => {
    const funnel = behaviourFunnel(groups)
    const [landed, garageSeen, area, garage] = funnel.steps
    expect(landed).toMatchObject({ lost: null, ofPrevious: null, ofLanded: 1 })
    expect(garageSeen).toMatchObject({ count: 10, lost: 10, ofPrevious: 0.5, ofLanded: 0.5 })
    expect(area).toMatchObject({ count: 10, lost: 0, ofPrevious: 1 })
    expect(garage).toMatchObject({ count: 4, lost: 6, ofPrevious: 0.4, ofLanded: 0.2 })
    // 10 lost before "Saw a garage" beats 6 before "Opened a garage".
    expect(funnel.biggestLeak).toEqual({ key: 'garageSeen', from: 'landed', lost: 10 })
  })

  test('a tie goes to the earlier step', () => {
    const funnel = behaviourFunnel([
      visits(2, ['landing_view']),
      visits(2, ['landing_view', 'garage_card_seen']),
      visits(0, []),
      visits(2, ['landing_view', 'garage_card_seen', 'area_pick', 'garage_view']),
    ])
    expect(funnel.biggestLeak).toEqual({ key: 'garageSeen', from: 'landed', lost: 2 })
  })

  test('a step nothing records yet is not measured, and the drop skips it', () => {
    // Before the landing page's area chips: nobody picks an area.
    const funnel = behaviourFunnel([
      visits(8, ['landing_view', 'garage_card_seen']),
      visits(2, ['landing_view', 'garage_card_seen', 'garage_view']),
    ])
    const area = funnel.steps.find((step) => step.key === 'area')!
    const garage = funnel.steps.find((step) => step.key === 'garage')!
    expect(area).toMatchObject({ count: null, lost: null, ofPrevious: null })
    expect(garage).toMatchObject({ count: 2, lost: 8, ofPrevious: 0.2 })
    expect(funnel.biggestLeak).toEqual({ key: 'garage', from: 'garageSeen', lost: 8 })
  })

  test('the zeros after the last step anyone reached are measured: nobody got there', () => {
    const steps = behaviourFunnel([visits(5, ['landing_view', 'garage_card_seen'])]).steps
    expect(steps.map((step) => step.count)).toEqual([5, 5, 0, 0, 0, 0, 0, 0])
    expect(steps[2].lost).toBe(5)
    expect(steps[3].lost).toBe(0)
  })

  test('a skipped step never shows a negative loss', () => {
    // Opened a garage straight from search, no card seen first.
    const funnel = behaviourFunnel([
      visits(3, ['landing_view', 'garage_view']),
      visits(1, ['landing_view', 'garage_card_seen', 'garage_view']),
    ])
    const garage = funnel.steps.find((step) => step.key === 'garage')!
    expect(garage.count).toBe(4)
    expect(garage.lost).toBe(0)
    // More than the step before (4 against 1): shown as all of them, never 400%.
    expect(garage.ofPrevious).toBe(1)
  })

  test('a visit already signed in has given its number', () => {
    expect(
      counts([visits(1, ['landing_view', 'garage_view', 'booking_start', 'pay_success'], { signedIn: true })]).number
    ).toBe(1)
  })

  test('nothing at all: no visits, no leak, no division by zero', () => {
    const funnel = behaviourFunnel([])
    expect(funnel.steps.every((step) => step.count === 0 && step.ofLanded === null)).toBe(true)
    expect(funnel.biggestLeak).toBeNull()
  })
})

describe('last step before leaving', () => {
  test('the five commonest last events of visits that landed and did not pay, with their share', () => {
    const result = lastStepsBeforeLeaving([
      visits(5, ['landing_view']),
      visits(3, ['landing_view', 'garage_view']),
      visits(1, ['landing_view', 'garage_view', 'mode_switch']),
      visits(1, ['landing_view', 'booking_start', 'otp_sent']),
      visits(1, ['landing_view', 'search']),
      visits(1, ['landing_view', 'map_view']),
      visits(4, ['landing_view', 'pay_success']),
      visits(9, ['garage_view']),
    ])
    expect(result.leavers).toBe(12)
    expect(result.rows).toEqual([
      { event: 'landing_view', label: 'Landing page', sessions: 5, share: 5 / 12 },
      { event: 'garage_view', label: "A garage's page", sessions: 3, share: 3 / 12 },
      { event: 'map_view', label: 'Map', sessions: 1, share: 1 / 12 },
      { event: 'mode_switch', label: 'Switched At garage / Doorstep / Pickup', sessions: 1, share: 1 / 12 },
      { event: 'otp_sent', label: 'Sign-in code sent', sessions: 1, share: 1 / 12 },
    ])
  })

  test('a last event without words of its own shows its name', () => {
    expect(lastStepsBeforeLeaving([visits(1, ['landing_view', 'review_submit'])]).rows[0].label).toBe('review_submit')
  })
})

describe('the whole tab', () => {
  test("the team's visits and Test bookings are left out of every figure, and counted", () => {
    const summary = summariseBehaviour([
      visits(4, ['landing_view', 'garage_view']),
      visits(2, ['landing_view', 'garage_view', 'pay_success'], { team: true, signedIn: true }),
      visits(1, ['landing_view', 'pay_success'], { test: true, signedIn: true }),
      visits(1, ['landing_view', 'pay_success'], { test: true, team: true, signedIn: true }),
    ])
    expect(summary.visits).toBe(4)
    expect(summary.leftOut).toEqual({ team: 3, test: 1 })
    expect(summary.funnel.steps[0].count).toBe(4)
    expect(summary.funnel.steps.at(-1)!.count).toBe(0)
    expect(summary.lastSteps.leavers).toBe(4)
  })
})

describe('the Source filter', () => {
  test('Instagram, Google and Direct by name; everything else, or nothing known, is Other', () => {
    expect(sourceOf('instagram')).toBe('instagram')
    expect(sourceOf('google')).toBe('google')
    expect(sourceOf('direct')).toBe('direct')
    expect(sourceOf('facebook')).toBe('other')
    expect(sourceOf('whatsapp')).toBe('other')
    expect(sourceOf(null)).toBe('other')
  })
})
