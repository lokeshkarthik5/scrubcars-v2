import { describe, expect, test } from 'bun:test'
import * as server from './garage-book.js'

const coreUrl = new URL('../../../../packages/core/src/garage-book.ts', import.meta.url).href
const momentsUrl = new URL('../../../../packages/core/src/moments.ts', import.meta.url).href

describe('garage book parity', () => {
  test('the apps hold the same rules and words as the server', async () => {
    const core = (await import(coreUrl)) as typeof server
    const moments = (await import(momentsUrl)) as { formatIndianPlate: (plate: string) => string }
    expect(core.GARAGE_BOOK_LIMITS).toEqual(server.GARAGE_BOOK_LIMITS)
    expect(core.DEFAULT_REMINDER_MESSAGE).toBe(server.DEFAULT_REMINDER_MESSAGE)
    expect(core.DEFAULT_INTERVAL_DAYS).toBe(server.DEFAULT_INTERVAL_DAYS)
    expect(core.DETLIO_PUSH_EVERY_DAYS).toBe(server.DETLIO_PUSH_EVERY_DAYS)
    for (const from of server.JOB_STATUSES) {
      for (const to of server.JOB_STATUSES) expect(core.canMoveJob(from, to)).toBe(server.canMoveJob(from, to))
    }
    for (const text of ['', 'Hi', 'x'.repeat(501), 'www.a.in', 'Call 98400', 'mygarage.com', 'wa.me/91']) {
      expect(core.messageRefusal(text)).toBe(server.messageRefusal(text))
    }
    const values = { name: 'Suresh Kumar', car: 'Creta', garage: 'Sample', phone: '98400 00000' }
    expect(core.fillReminder(server.DEFAULT_REMINDER_MESSAGE, values)).toBe(server.fillReminder(server.DEFAULT_REMINDER_MESSAGE, values))
    for (const plate of ['tn09ab4521', 'TN 7 CD 9036', '22bh1234aa', 'odd one']) {
      expect(moments.formatIndianPlate(plate)).toBe(server.formatIndianPlate(plate))
      expect(core.plateKey(plate)).toBe(server.plateKey(plate))
    }
  })
})
