import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { AppError } from '../lib/errors.js'
import { notFoundUnless } from './feature-switch.middleware.js'

/** A tiny app answering the way app.ts does, behind the switch. */
function appWith(enabled: () => boolean) {
  const app = new Hono()
  app.onError((err, c) =>
    err instanceof AppError
      ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 404)
      : c.json({ success: false }, 500)
  )
  app.use('/reset/*', notFoundUnless(enabled))
  app.get('/reset/config', (c) => c.json({ success: true, data: { enabled: true } }))
  app.post('/reset/execute', (c) => c.json({ success: true, data: {} }))
  return app
}

describe('a switched-off tool', () => {
  test('every route is a 404 while the switch is off', async () => {
    const app = appWith(() => false)
    for (const [method, path] of [
      ['GET', '/reset/config'],
      ['POST', '/reset/execute'],
    ] as const) {
      const response = await app.request(path, { method })
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ success: false, message: 'Not found', code: 'NOT_FOUND' })
    }
  })

  test('the routes answer while it is on', async () => {
    let on = false
    const app = appWith(() => on)
    expect((await app.request('/reset/config')).status).toBe(404)
    on = true
    const response = await app.request('/reset/config')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { enabled: true } })
  })
})
