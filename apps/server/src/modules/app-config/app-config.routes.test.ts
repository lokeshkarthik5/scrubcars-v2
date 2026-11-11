/**
 * GET /app-config through the real route and validation: public (no cookie,
 * no header), every bad query a 400, and nothing set means nobody is told to
 * update. Only the environment's settings are stood in for.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { readAppConfigEnv } = await import('../../lib/app-config.js')
const { appConfigRoutes } = await import('./app-config.routes.js')

const app = new Hono().route('/app-config', appConfigRoutes)
const envValues = env as unknown as Record<string, unknown>
const saved = envValues.appConfig

function configure(source: Record<string, string>) {
  envValues.appConfig = readAppConfigEnv(source)
}

async function get(query: string) {
  const res = await app.request(`/app-config${query}`)
  return { res, body: (await res.json()) as Record<string, any> }
}

beforeEach(() => configure({}))
afterAll(() => {
  envValues.appConfig = saved
})

describe('GET /app-config', () => {
  test('nothing set: 200 and never required', async () => {
    const { res, body } = await get('?app=customer&platform=ios&version=1.0.0')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({
      success: true,
      // garageBook (0072): added; GARAGE_BOOK is off unless set.
      data: { minVersion: null, latestVersion: null, updateRequired: false, storeUrl: null, garageBook: false },
    })
  })

  test('answers without any sign-in', async () => {
    configure({ APP_MIN_VERSION_GARAGE_ANDROID: '3.0.0', APP_STORE_URL_GARAGE_ANDROID: 'https://play.google.com/x' })
    const { res, body } = await get('?app=garage&platform=android&version=2.9.9')
    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      minVersion: '3.0.0',
      latestVersion: '3.0.0',
      updateRequired: true,
      storeUrl: 'https://play.google.com/x',
      garageBook: false,
    })
  })

  test('says whether Garage Book is on, for the garage app (0072)', async () => {
    const before = envValues.garageBook
    envValues.garageBook = true
    const { body } = await get('?app=garage&platform=ios&version=1.0.0')
    envValues.garageBook = before
    expect(body.data.garageBook).toBe(true)
  })

  test('an app at or above the minimum is not required', async () => {
    configure({ APP_MIN_VERSION_CUSTOMER_IOS: '1.9.0' })
    expect((await get('?app=customer&platform=ios&version=1.9.0')).body.data.updateRequired).toBe(false)
    expect((await get('?app=customer&platform=ios&version=1.10.0')).body.data.updateRequired).toBe(false)
    expect((await get('?app=customer&platform=ios&version=1.8.99')).body.data.updateRequired).toBe(true)
  })

  test('the minimum for one app and platform does not leak to another', async () => {
    configure({ APP_MIN_VERSION_CUSTOMER_IOS: '5.0.0' })
    expect((await get('?app=customer&platform=android&version=1.0.0')).body.data.updateRequired).toBe(false)
    expect((await get('?app=garage&platform=ios&version=1.0.0')).body.data.updateRequired).toBe(false)
  })

  test('a malformed version is a 400', async () => {
    for (const version of ['abc', '1.2.3.4', 'v1.2.3', '1.2.x', '', '1.2.3-beta', '-1']) {
      const { res } = await get(`?app=customer&platform=ios&version=${encodeURIComponent(version)}`)
      expect(res.status).toBe(400)
    }
  })

  test('a missing or unknown part is a 400', async () => {
    for (const query of [
      '',
      '?app=customer&platform=ios',
      '?app=customer&version=1.0.0',
      '?platform=ios&version=1.0.0',
      '?app=admin&platform=ios&version=1.0.0',
      '?app=customer&platform=web&version=1.0.0',
      '?app=Customer&platform=ios&version=1.0.0',
    ]) {
      expect((await get(query)).res.status).toBe(400)
    }
  })

  test('nothing else rides along', async () => {
    const { res } = await get('?app=customer&platform=ios&version=1.0.0&userId=abc')
    expect(res.status).toBe(400)
  })

  test('only GET exists', async () => {
    const res = await app.request('/app-config?app=customer&platform=ios&version=1.0.0', { method: 'POST' })
    expect(res.status).toBe(404)
  })
})
