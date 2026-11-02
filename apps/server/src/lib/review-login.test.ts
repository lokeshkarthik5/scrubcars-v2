import { describe, expect, test } from 'bun:test'
import { hashPassword } from './passwords.js'
import {
  encodeCodeHash,
  makeReviewCodeHash,
  readReviewLoginEnv,
  reviewCodeMatches,
  reviewLoginApplies,
} from './review-login.js'

const hash = await makeReviewCodeHash('424242')

const settings = () => ({
  REVIEW_LOGIN_CUSTOMER_PHONE: '9000011111',
  REVIEW_LOGIN_GARAGE_PHONE: '9000022222',
  REVIEW_LOGIN_CODE_HASH: hash,
})

describe('reading the settings', () => {
  test('all three, well formed: on', () => {
    const config = readReviewLoginEnv(settings())
    expect(config).toMatchObject({ customerPhone: '9000011111', garagePhone: '9000022222' })
    expect(config?.codeHash.startsWith('scrypt$')).toBe(true)
  })

  test('the hash has no character a shell or dotenv would expand', () => {
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('any one missing or blank: fully off', () => {
    for (const key of Object.keys(settings())) {
      expect(readReviewLoginEnv({ ...settings(), [key]: undefined })).toBeNull()
      expect(readReviewLoginEnv({ ...settings(), [key]: '' })).toBeNull()
      expect(readReviewLoginEnv({ ...settings(), [key]: '   ' })).toBeNull()
    }
    expect(readReviewLoginEnv({})).toBeNull()
  })

  test('a phone that is not a 10-digit Indian mobile: off', () => {
    for (const phone of ['12345', '5000011111', '90000111112', '+919000011111', 'abcdefghij']) {
      expect(readReviewLoginEnv({ ...settings(), REVIEW_LOGIN_CUSTOMER_PHONE: phone })).toBeNull()
      expect(readReviewLoginEnv({ ...settings(), REVIEW_LOGIN_GARAGE_PHONE: phone })).toBeNull()
    }
  })

  test('a hash that is not ours: off', async () => {
    for (const bad of [
      '424242',
      'not base64 at all!',
      encodeCodeHash('plain-text'),
      encodeCodeHash('scrypt$1$2$3'),
      // The raw scrypt string, unwrapped, has `$` and is refused.
      await hashPassword('424242'),
    ]) {
      expect(readReviewLoginEnv({ ...settings(), REVIEW_LOGIN_CODE_HASH: bad })).toBeNull()
    }
  })
})

describe('when it applies', () => {
  const config = readReviewLoginEnv(settings())

  test('the customer phone, in the customer app, for a login', () => {
    expect(reviewLoginApplies(config, { phone: '9000011111', purpose: 'login', audience: 'customer' })).toBe(true)
  })

  test('the garage phone, in the garage app, for a login', () => {
    expect(reviewLoginApplies(config, { phone: '9000022222', purpose: 'login', audience: 'vendor' })).toBe(true)
  })

  test('each phone only for its own app', () => {
    expect(reviewLoginApplies(config, { phone: '9000011111', purpose: 'login', audience: 'vendor' })).toBe(false)
    expect(reviewLoginApplies(config, { phone: '9000022222', purpose: 'login', audience: 'customer' })).toBe(false)
  })

  test('never for a purpose that creates an account', () => {
    for (const purpose of ['register', 'vendor_onboard']) {
      expect(reviewLoginApplies(config, { phone: '9000011111', purpose, audience: 'customer' })).toBe(false)
      expect(reviewLoginApplies(config, { phone: '9000022222', purpose, audience: 'vendor' })).toBe(false)
    }
  })

  test('never for any other phone', () => {
    for (const phone of ['9000033333', '9000011112', '9000011110', '']) {
      expect(reviewLoginApplies(config, { phone, purpose: 'login', audience: 'customer' })).toBe(false)
      expect(reviewLoginApplies(config, { phone, purpose: 'login', audience: 'vendor' })).toBe(false)
    }
  })

  test('never when it is off', () => {
    expect(reviewLoginApplies(null, { phone: '9000011111', purpose: 'login', audience: 'customer' })).toBe(false)
  })
})

describe('the code', () => {
  const config = readReviewLoginEnv(settings())!

  test('the right code matches, anything else does not', async () => {
    expect(await reviewCodeMatches(config, '424242')).toBe(true)
    for (const wrong of ['424243', '000000', '', '42424', '4242420', '424242 ']) {
      expect(await reviewCodeMatches(config, wrong)).toBe(false)
    }
  })

  test('two hashes of the same code differ (salted)', async () => {
    expect(await makeReviewCodeHash('424242')).not.toBe(hash)
  })

  test('the setting never contains the code', () => {
    expect(hash).not.toContain('424242')
    expect(config.codeHash).not.toContain('424242')
  })
})
