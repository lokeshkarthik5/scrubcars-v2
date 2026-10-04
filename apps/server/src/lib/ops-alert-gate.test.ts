import { describe, expect, test } from 'bun:test'
import { opsAlertChat } from './ops-alert-gate.js'

const live = { token: 'bot-token', chatId: '-1001234', vercelEnv: 'production' }

describe('opsAlertChat', () => {
  test('Production with both settings sends to the chat', () => {
    expect(opsAlertChat(live)).toBe('-1001234')
  })

  test('off without both settings', () => {
    expect(opsAlertChat({ ...live, token: undefined })).toBeNull()
    expect(opsAlertChat({ ...live, chatId: '' })).toBeNull()
  })

  test('off on previews, in development and locally, even holding the token', () => {
    expect(opsAlertChat({ ...live, vercelEnv: 'preview' })).toBeNull()
    expect(opsAlertChat({ ...live, vercelEnv: 'development' })).toBeNull()
    expect(opsAlertChat({ ...live, vercelEnv: undefined })).toBeNull()
  })

  test('a deliberate local test can switch it on', () => {
    expect(opsAlertChat({ ...live, vercelEnv: undefined, forced: true })).toBe('-1001234')
  })

  test('never on the E2E stack, whose payments are all fake', () => {
    expect(opsAlertChat({ ...live, fakePayments: true })).toBeNull()
    expect(opsAlertChat({ ...live, vercelEnv: undefined, forced: true, fakePayments: true })).toBeNull()
  })
})
