import { beforeEach, describe, expect, test } from 'bun:test'
import {
  classifyExpoResponse,
  createExpoPushSender,
  EXPO_PUSH_URL,
  expoRequestMessage,
  fakeDeviceOutbox,
  isExpoPushToken,
} from './expo-push.js'
import type { PushMessage } from './push.js'

const TOKEN = 'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]'

const MESSAGE: PushMessage = {
  title: 'New booking',
  body: 'Exterior Wash at 10:30 am',
  url: '/bookings/abc',
  tag: 'booking:11111111-2222-4333-8444-555555555555',
  category: 'booking_update',
  ttlSeconds: 14_400,
  urgency: 'high',
}

describe('token shape', () => {
  test('both Expo spellings are tokens', () => {
    expect(isExpoPushToken(TOKEN)).toBe(true)
    expect(isExpoPushToken('ExpoPushToken[AbCdEfGhIjKlMnOpQrStUv]')).toBe(true)
    expect(isExpoPushToken('ExponentPushToken[a-b_c-d_e-f_g-h_i-j_k]')).toBe(true)
  })

  test('anything else is not', () => {
    for (const bad of [
      '',
      'AbCdEfGhIjKlMnOpQrStUv',
      'ExponentPushToken[]',
      'ExponentPushToken[short]',
      'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv',
      'ExponentPushToken AbCdEfGhIjKlMnOpQrStUv',
      'exponentpushtoken[AbCdEfGhIjKlMnOpQrStUv]',
      'FcmToken[AbCdEfGhIjKlMnOpQrStUv]',
      'ExponentPushToken[AbCdEfGhIjKlMnOp QrStUv]',
      'ExponentPushToken[AbCdEfGhIjKlMnOp<script>]',
      'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]extra',
      ' ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]',
      'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]\n',
      `ExponentPushToken[${'a'.repeat(65)}]`,
      'https://exp.host/--/api/v2/push/send',
    ]) {
      expect(isExpoPushToken(bad)).toBe(false)
    }
  })
})

describe('the request', () => {
  test('carries the browser words and the url, and no personal fields', () => {
    expect(expoRequestMessage({ token: TOKEN, platform: 'ios' }, MESSAGE)).toEqual({
      to: TOKEN,
      title: 'New booking',
      body: 'Exterior Wash at 10:30 am',
      data: { url: '/bookings/abc', tag: MESSAGE.tag },
      sound: 'default',
      ttl: 14_400,
      priority: 'high',
      collapseId: MESSAGE.tag,
    })
  })

  test('normal urgency is default priority; a tag over 64 bytes is not a collapseId', () => {
    const request = expoRequestMessage(
      { token: TOKEN, platform: 'android' },
      { ...MESSAGE, urgency: 'normal', tag: 'x'.repeat(65) }
    )
    expect(request.priority).toBe('default')
    expect(request).not.toHaveProperty('collapseId')
    expect(request).not.toHaveProperty('channelId')
  })

  test('a reminder goes to the reminders channel', () => {
    const request = expoRequestMessage({ token: TOKEN, platform: 'android' }, { ...MESSAGE, category: 'reminder' })
    expect(request.channelId).toBe('reminders')
  })
})

describe('what Expo’s answer means', () => {
  test('an ok ticket is sent', () => {
    expect(classifyExpoResponse(200, { data: [{ status: 'ok', id: 'r1' }] })).toEqual({ kind: 'sent' })
    expect(classifyExpoResponse(200, { data: { status: 'ok', id: 'r1' } })).toEqual({ kind: 'sent' })
  })

  test('DeviceNotRegistered is gone', () => {
    const body = { data: [{ status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } }] }
    expect(classifyExpoResponse(200, body)).toEqual({ kind: 'gone' })
  })

  test('every other failure is kept', () => {
    const other = { data: [{ status: 'error', message: 'x', details: { error: 'MessageRateExceeded' } }] }
    expect(classifyExpoResponse(200, other)).toEqual({ kind: 'failed', status: 200 })
    expect(classifyExpoResponse(200, { data: [{ status: 'error' }] })).toEqual({ kind: 'failed', status: 200 })
    expect(classifyExpoResponse(401, { errors: [{ code: 'UNAUTHORIZED' }] })).toEqual({ kind: 'failed', status: 401 })
    expect(classifyExpoResponse(429, null)).toEqual({ kind: 'failed', status: 429 })
    expect(classifyExpoResponse(500, 'oops')).toEqual({ kind: 'failed', status: 500 })
    expect(classifyExpoResponse(200, null)).toEqual({ kind: 'failed', status: 200 })
    expect(classifyExpoResponse(200, { data: [] })).toEqual({ kind: 'failed', status: 200 })
    expect(classifyExpoResponse(200, { data: 'nope' })).toEqual({ kind: 'failed', status: 200 })
  })

  test('DeviceNotRegistered on a failed request is not believed', () => {
    const body = { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }
    expect(classifyExpoResponse(503, body)).toEqual({ kind: 'failed', status: 503 })
  })
})

describe('the sender', () => {
  type Call = { url: string; init: RequestInit }
  const calls: Call[] = []
  let answer: () => Promise<Response>

  const sender = (options: { token?: string; fake?: boolean } = {}) =>
    createExpoPushSender({
      fetch: async (url, init) => {
        calls.push({ url, init })
        return answer()
      },
      accessToken: () => options.token,
      fake: () => options.fake ?? false,
    })

  beforeEach(() => {
    calls.length = 0
    fakeDeviceOutbox.length = 0
    answer = async () => Response.json({ data: [{ status: 'ok', id: 'r1' }] })
  })

  test('posts one message to Expo with the access token', async () => {
    const result = await sender({ token: 'secret-access' }).send({ token: TOKEN, platform: 'ios' }, MESSAGE)
    expect(result).toEqual({ kind: 'sent' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(EXPO_PUSH_URL)
    expect(calls[0].url).toBe('https://exp.host/--/api/v2/push/send')
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret-access')
    expect(headers['content-type']).toBe('application/json')
    expect(JSON.parse(calls[0].init.body as string)).toEqual([expoRequestMessage({ token: TOKEN, platform: 'ios' }, MESSAGE)])
  })

  test('no access token, no Authorization header', async () => {
    await sender().send({ token: TOKEN, platform: 'android' }, MESSAGE)
    expect((calls[0].init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  test('a dead token is gone', async () => {
    answer = async () =>
      Response.json({ data: [{ status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } }] })
    expect(await sender().send({ token: TOKEN, platform: 'ios' }, MESSAGE)).toEqual({ kind: 'gone' })
  })

  test('an error status, a non-JSON body or a thrown fetch is a failure, never a throw', async () => {
    answer = async () => new Response('Bad gateway', { status: 502 })
    expect(await sender().send({ token: TOKEN, platform: 'ios' }, MESSAGE)).toEqual({ kind: 'failed', status: 502 })

    answer = async () => new Response('<html>', { status: 200 })
    expect(await sender().send({ token: TOKEN, platform: 'ios' }, MESSAGE)).toEqual({ kind: 'failed', status: 200 })

    answer = async () => {
      throw new Error(`connect failed for ${TOKEN}`)
    }
    expect(await sender().send({ token: TOKEN, platform: 'ios' }, MESSAGE)).toEqual({ kind: 'failed', status: null })
  })

  test('test mode records the message, never calls Expo and never keeps the token', async () => {
    const result = await sender({ fake: true, token: 'secret-access' }).send({ token: TOKEN, platform: 'android' }, MESSAGE)
    expect(result).toEqual({ kind: 'sent' })
    expect(calls).toHaveLength(0)
    expect(fakeDeviceOutbox).toEqual([
      {
        title: MESSAGE.title,
        body: MESSAGE.body,
        url: MESSAGE.url,
        tag: MESSAGE.tag,
        category: 'booking_update',
        platform: 'android',
      },
    ])
    expect(JSON.stringify(fakeDeviceOutbox)).not.toContain('AbCdEf')
  })
})
