import { describe, expect, test } from 'bun:test'
import { MAX_BODY_BYTES, MAX_EVENTS_PER_BATCH } from '../../lib/analytics.js'
import { eventBatchSchema, parseEventBatch } from './analytics.validation.js'

const VISIT = '6f1d2c3b-4a59-4e1f-8d2c-0b9a8e7f6d5c'
const GARAGE = '2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10'

function batch(events: unknown[], extra: Record<string, unknown> = {}) {
  return { visitId: VISIT, device: 'phone', appVersion: '0.3.0', events, ...extra }
}

const ok = (body: unknown) => eventBatchSchema.safeParse(body).success

describe('a batch of usage events', () => {
  test('takes the events the app sends, with their own props', () => {
    expect(
      ok(
        batch([
          { name: 'app_open', path: '/', props: { source: 'instagram' } },
          { name: 'garage_view', path: '/garage/:id', props: { vendorId: GARAGE, mode: 'doorstep' } },
          { name: 'search', props: { category: 'car_wash', queryLength: 6 } },
          { name: 'pay_click', props: { vendorId: GARAGE, mode: 'dropin', serviceCount: 2, amountBucket: '500_999' } },
          { name: 'home_view' },
        ])
      )
    ).toBe(true)
  })

  test('refuses an event it does not know, and the API’s own', () => {
    expect(ok(batch([{ name: 'page_view' }]))).toBe(false)
    expect(ok(batch([{ name: 'booking_paid', props: { vendorId: GARAGE } }]))).toBe(false)
    expect(ok(batch([{ name: 'booking_cancelled' }]))).toBe(false)
  })

  test('refuses a key it does not know, anywhere', () => {
    expect(ok(batch([{ name: 'search', props: { query: 'ceramic coating' } }]))).toBe(false)
    expect(ok(batch([{ name: 'home_view', props: { phone: '9876543210' } }]))).toBe(false)
    expect(ok(batch([{ name: 'home_view', at: 123 }]))).toBe(false)
    expect(ok(batch([{ name: 'home_view' }], { userId: GARAGE }))).toBe(false)
  })

  test("refuses a known key on an event that doesn't take it", () => {
    expect(ok(batch([{ name: 'home_view', props: { vendorId: GARAGE } }]))).toBe(false)
    expect(ok(batch([{ name: 'app_open', props: { queryLength: 3 } }]))).toBe(false)
    expect(ok(batch([{ name: 'search', props: { cancelledBy: 'customer' } }]))).toBe(false)
  })

  test('refuses free text in any value', () => {
    expect(ok(batch([{ name: 'app_open', props: { source: 'my friend Ravi' } }]))).toBe(false)
    expect(ok(batch([{ name: 'app_open', props: { source: 'x'.repeat(33) } }]))).toBe(false)
    expect(ok(batch([{ name: 'garage_view', props: { vendorId: 'Sparkle Car Spa' } }]))).toBe(false)
    expect(ok(batch([{ name: 'search', props: { category: 'anything' } }]))).toBe(false)
    expect(ok(batch([{ name: 'search', props: { queryLength: 2.5 } }]))).toBe(false)
    expect(ok(batch([{ name: 'checkout_start', props: { serviceCount: 99 } }]))).toBe(false)
    expect(ok(batch([{ name: 'home_view' }], { device: 'iPhone 15 Pro' }))).toBe(false)
    expect(ok(batch([{ name: 'home_view' }], { appVersion: '0.3.0 (build for Ravi)' }))).toBe(false)
  })

  test('needs a random visit id, not anything else', () => {
    expect(ok(batch([{ name: 'home_view' }], { visitId: '9876543210' }))).toBe(false)
    expect(ok({ device: 'phone', appVersion: '0.3.0', events: [{ name: 'home_view' }] })).toBe(false)
  })

  test(`caps a batch at ${MAX_EVENTS_PER_BATCH} events, and refuses an empty one`, () => {
    const many = (n: number) => Array.from({ length: n }, () => ({ name: 'home_view' }))
    expect(ok(batch(many(MAX_EVENTS_PER_BATCH)))).toBe(true)
    expect(ok(batch(many(MAX_EVENTS_PER_BATCH + 1)))).toBe(false)
    expect(ok(batch([]))).toBe(false)
  })

  test('caps a path at 200 characters', () => {
    expect(ok(batch([{ name: 'home_view', path: `/${'a'.repeat(199)}` }]))).toBe(true)
    expect(ok(batch([{ name: 'home_view', path: `/${'a'.repeat(200)}` }]))).toBe(false)
  })

  test('the biggest batch the app can send fits well inside the body limit', () => {
    const biggest = batch(
      Array.from({ length: MAX_EVENTS_PER_BATCH }, () => ({
        name: 'pay_click',
        path: `/${'a'.repeat(199)}`,
        props: { vendorId: GARAGE, mode: 'doorstep', serviceCount: 20, amountBucket: '5000_plus' },
      }))
    )
    expect(ok(biggest)).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify(biggest)).length).toBeLessThan(MAX_BODY_BYTES)
  })

  test('reads the text/plain body sendBeacon sends, and refuses one that is not JSON', () => {
    expect(parseEventBatch(JSON.stringify(batch([{ name: 'home_view' }]))).ok).toBe(true)
    expect(parseEventBatch('{"visitId":').ok).toBe(false)
    expect(parseEventBatch('').ok).toBe(false)
    expect(parseEventBatch('[]').ok).toBe(false)
  })
})
