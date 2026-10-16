import { describe, expect, test } from 'bun:test'
import { classifyModeLookup, gatewayModeForKey, isLookupId } from './gateway-mode.js'

describe('the mode an order is opened in', () => {
  test('from the key id, unless the server mints the order itself', () => {
    expect(gatewayModeForKey('rzp_live_Abc123', false)).toBe('live')
    expect(gatewayModeForKey('rzp_test_Abc123', false)).toBe('test')
    // A key that is not a live key is never called live.
    expect(gatewayModeForKey('something_else', false)).toBe('test')
    expect(gatewayModeForKey(undefined, false)).toBe('test')
    // E2E_FAKE_PAYMENTS wins whatever keys are set.
    expect(gatewayModeForKey('rzp_live_Abc123', true)).toBe('fake')
    expect(gatewayModeForKey('rzp_test_Abc123', true)).toBe('fake')
  })
})

describe('what a Razorpay lookup says about an old id', () => {
  const missing = 'The id provided does not exist'
  const answer = (status: number, description: string | null = null) => ({
    ok: status >= 200 && status < 300,
    status,
    description,
  })

  test('live keys: known is live, "does not exist" is test money', () => {
    expect(classifyModeLookup({ liveKeys: true, answer: answer(200) })).toBe('live')
    expect(classifyModeLookup({ liveKeys: true, answer: answer(400, missing) })).toBe('test')
    expect(classifyModeLookup({ liveKeys: true, answer: answer(404, 'Not found') })).toBe('test')
  })

  test('test keys: known is test money, and "does not exist" proves nothing', () => {
    expect(classifyModeLookup({ liveKeys: false, answer: answer(200) })).toBe('test')
    // A live id is invisible to test keys too, so it could be real money.
    expect(classifyModeLookup({ liveKeys: false, answer: answer(400, missing) })).toBe('unknown')
    expect(classifyModeLookup({ liveKeys: false, answer: answer(404, 'Not found') })).toBe('unknown')
  })

  test('every failure is unknown, with either keys', () => {
    for (const liveKeys of [true, false]) {
      // A 400 or 404 that does not say the id is missing.
      expect(classifyModeLookup({ liveKeys, answer: answer(400, 'Bad request') })).toBe('unknown')
      expect(classifyModeLookup({ liveKeys, answer: answer(404) })).toBe('unknown')
      // Keys refused, account blocked, rate limited, Razorpay down.
      expect(classifyModeLookup({ liveKeys, answer: answer(401, missing) })).toBe('unknown')
      expect(classifyModeLookup({ liveKeys, answer: answer(403) })).toBe('unknown')
      expect(classifyModeLookup({ liveKeys, answer: answer(429) })).toBe('unknown')
      expect(classifyModeLookup({ liveKeys, answer: answer(500, missing) })).toBe('unknown')
      expect(classifyModeLookup({ liveKeys, answer: answer(503) })).toBe('unknown')
      // No answer at all: a network error or a timeout.
      expect(classifyModeLookup({ liveKeys, answer: null })).toBe('unknown')
    }
  })

  test('only a payment or order id is ever put in the path', () => {
    expect(isLookupId('pay_Abc123')).toBe(true)
    expect(isLookupId('order_Abc123')).toBe(true)
    expect(isLookupId('pay_../../v1/refunds')).toBe(false)
    expect(isLookupId('rfnd_Abc123')).toBe(false)
    expect(isLookupId('order_e2e_123')).toBe(false)
    expect(isLookupId('')).toBe(false)
  })
})
