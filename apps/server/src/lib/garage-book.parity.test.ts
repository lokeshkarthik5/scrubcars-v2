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

  test('stages 2 and 3 (0073): the same limits, lists and figures', async () => {
    const core = (await import(coreUrl)) as typeof server
    expect(core.GARAGE_BOOK_2_LIMITS).toEqual(server.GARAGE_BOOK_2_LIMITS)
    expect(core.EXPENSE_CATEGORIES).toEqual(server.EXPENSE_CATEGORIES)
    expect(core.EXPENSE_METHODS).toEqual(server.EXPENSE_METHODS)
    expect(core.PAY_APPS).toEqual(server.PAY_APPS)
    expect(core.STOCK_UNITS).toEqual(server.STOCK_UNITS)
    expect(core.MADE_WITH).toBe(server.MADE_WITH)
    for (const n of [0, 1, 142, 12345]) expect(core.billNumberText(n)).toBe(server.billNumberText(n))
    for (const apps of [[], ['gpay'], ['paytm', 'phonepe', 'gpay']]) {
      expect(core.payAppsText(apps)).toBe(server.payAppsText(apps))
      expect(core.payLine({ phone: '9840000000', apps })).toBe(server.payLine({ phone: '9840000000', apps }))
    }
    for (const [level, pack, low] of [[600, 5000, 1000], [0, null, 0], [500, null, 250], [9000, 5000, 0]] as const) {
      expect(core.stockShare(level, pack, low)).toBe(server.stockShare(level, pack, low))
      expect(core.isLow(level, low)).toBe(server.isLow(level, low))
      expect(core.suggestPacks(level, low, pack)).toBe(server.suggestPacks(level, low, pack))
      expect(core.jobsLeft(level, pack)).toBe(server.jobsLeft(level, pack))
    }
    for (const unit of server.STOCK_UNITS) {
      for (const amount of [0, 150, 1200, 5000]) expect(core.stockAmountText(amount, unit)).toBe(server.stockAmountText(amount, unit))
    }
  })
})
