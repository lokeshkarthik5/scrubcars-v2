import { describe, expect, test } from 'bun:test'
import {
  busiestIndex,
  customerTag,
  dayStrip,
  initials,
  jobTime,
  newClientId,
  ordinal,
  ownJobStatus,
  recentMonths,
  reminderReason,
  rupees,
  rupeesShort,
  showClosingCard,
  walkInTime,
  washWords,
} from './garage-book'

const now = new Date('2026-11-09T10:12:00+05:30')

describe('figures', () => {
  test('money is shown only when it is there (staff get none)', () => {
    expect(rupees(139_800)).toBe('₹1,398')
    expect(rupees(undefined)).toBeNull()
    expect(rupeesShort(320_000)).toBe('₹3.2k')
    expect(rupeesShort(18_430_000)).toBe('₹1.8L')
  })
  test('times, ordinals and initials as the screens write them', () => {
    expect(jobTime('2026-11-09T04:00:00Z')).toBe('9:30')
    expect(jobTime('2026-11-09T08:30:00Z')).toBe('2:00')
    expect(ordinal(7)).toBe('7th')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(13)).toBe('13th')
    expect(initials('Suresh Kumar')).toBe('SK')
    expect(initials('Meena')).toBe('ME')
  })
})

describe('a walk-in', () => {
  test('gets a client id that is new each time and fits the server', () => {
    const a = newClientId()
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(newClientId()).not.toBe(a)
  })
  test('Now is under way this minute; Later today is the next whole hour in IST; a picked time is kept', () => {
    expect(walkInTime('now', now)).toEqual({ scheduledAt: now.toISOString(), status: 'in_progress' })
    expect(walkInTime('later', now).scheduledAt).toBe('2026-11-09T05:30:00.000Z')
    expect(walkInTime('pick', now, '16:30').scheduledAt).toBe('2026-11-09T11:00:00.000Z')
  })
  test("status lines read like the mockup's", () => {
    expect(ownJobStatus({ status: 'in_progress', payment: 'upi', visitNumber: 7 })).toEqual({ text: 'In progress · 7th visit', tone: 'working' })
    expect(ownJobStatus({ status: 'booked', payment: 'later' })!.tone).toBe('owed')
    expect(ownJobStatus({ status: 'done', payment: 'cash' })).toEqual({ text: 'Done · CASH', tone: 'done' })
    expect(ownJobStatus({ status: 'booked', payment: 'upi' })).toBeNull()
  })
})

describe('lists', () => {
  test('the day strip starts yesterday', () => {
    expect(dayStrip('2026-11-09').map((d) => `${d.weekday} ${d.day}`)).toEqual(['Sun 8', 'Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13'])
  })
  test('the closing card shows once every job is finished and the last has started, today only', () => {
    const day = { date: '2026-11-09', allDone: true, lastStartsAt: '2026-11-09T04:00:00Z' }
    expect(showClosingCard(day, now)).toBe(true)
    expect(showClosingCard({ ...day, allDone: false }, now)).toBe(false)
    expect(showClosingCard({ ...day, date: '2026-11-08' }, now)).toBe(false)
    expect(showClosingCard({ ...day, lastStartsAt: '2026-11-09T12:00:00Z' }, now)).toBe(false)
  })
  test("a customer's tag and a reminder's reason", () => {
    expect(customerTag({ viaDetlio: false, due: { state: 'overdue' }, lastVisitAt: null }).text).toBe('Due today')
    expect(customerTag({ viaDetlio: true, due: { state: 'ok' }, lastVisitAt: null }).text).toBe('Via Detlio')
    expect(customerTag({ viaDetlio: false, due: { state: 'ok' }, owesPaise: 640_000, lastVisitAt: null }).text).toBe('₹6,400 owed')
    expect(reminderReason({ source: 'detlio', daysSince: 21, lastVisitAt: null, sentAt: null })).toBe('Wash · 21 days · Detlio sends it')
    expect(reminderReason({ source: 'own', daysSince: 30, lastVisitAt: '2026-10-08T06:00:00Z', sentAt: null })).toBe('Wash · 30 days since 8 Oct')
  })
  test('months, busiest day and the wash words', () => {
    expect(recentMonths(now, 3)).toEqual(['2026-11', '2026-10', '2026-09'])
    expect(recentMonths(new Date('2026-01-05T10:00:00+05:30'), 2)).toEqual(['2026-01', '2025-12'])
    expect(busiestIndex([1, 4, 2, 4])).toBe(1)
    expect(busiestIndex([0, 0])).toBeNull()
    expect(washWords({ daysSinceWash: 28, intervalDays: 30, dueOn: '2026-11-11', dueState: 'due_soon' }, now)).toEqual({
      lead: 'Due in 2 days.',
      rest: ' Every 30 days',
    })
  })
})

describe('stages 2 and 3 (0074)', () => {
  test('bill numbers, pay lines and the stock dial read as the server writes them', async () => {
    const { billNumberText, payLine, stockShare, isLow, jobsLeft, suggestPacks, stockAmountText, stockDeltaText } = await import('./garage-book')
    expect(billNumberText(7)).toBe('0007')
    expect(payLine({ phone: '9840000000', apps: ['phonepe', 'gpay'] })).toBe('Pay on GPay/PhonePe 98400 00000')
    expect(stockShare(600, 5000, 1000)).toBe(0.12)
    expect(isLow(600, 1000)).toBe(true)
    expect(jobsLeft(600, 100)).toBe(6)
    expect(suggestPacks(600, 1000, 5000)).toBe(1)
    expect(stockAmountText(10_000, 'ml')).toBe('10 L')
    expect(stockDeltaText(-300, 'ml')).toBe('−300 ml')
    expect(stockDeltaText(10_000, 'ml')).toBe('+10 L')
  })

  test('the words the Business tiles, Expenses and the milestone card show', async () => {
    const { expenseCategoryWord, teamTileLine, milestoneTitle, milestoneNext, stockMoveWord } = await import('./garage-book')
    expect(expenseCategoryWord('power_water')).toBe('Power & water')
    expect(expenseCategoryWord('salary')).toBe('Salaries')
    expect(stockMoveWord('counted')).toBe('Counted')
    expect(
      teamTileLine({ atWork: 4, members: [{ name: 'Ravi', jobsToday: 2 }, { name: 'Arun Kumar', jobsToday: 6 }] })
    ).toBe('4 at work · Arun 6 jobs')
    expect(teamTileLine({ atWork: 3, members: [{ name: 'Ravi', jobsToday: 0 }] })).toBe('3 at work')
    expect(milestoneTitle({ kind: 'customers', value: 100 })).toBe('100 customers in your book')
    expect(milestoneTitle({ kind: 'lakh_month', value: 1 })).toBe('First ₹1 lakh month')
    expect(milestoneNext({ kind: 'lakh_month', value: 2 })).toBe('Next: First ₹2 lakh month')
    expect(milestoneNext(null)).toBeNull()
  })

  test('the money-owed WhatsApp carries the garage’s pay line when it shows it', async () => {
    const { owedMessage } = await import('./garage-book')
    const plain = owedMessage({ name: 'Suresh Kumar', garage: 'Sample', amountPaise: 50_000 })
    expect(plain).not.toContain('Pay on')
    expect(owedMessage({ name: 'Suresh Kumar', garage: 'Sample', amountPaise: 50_000, payLine: 'Pay on GPay 98400 00000' })).toBe(
      `${plain}\nPay on GPay 98400 00000`
    )
  })

  test('a job’s ref for "who did it" and a bill', async () => {
    const { jobRef } = await import('./api/garage-book')
    expect(jobRef({ source: 'own', id: 'a' })).toBe('own:a')
    expect(jobRef({ source: 'detlio', id: 'b' })).toBe('detlio:b')
  })
})
