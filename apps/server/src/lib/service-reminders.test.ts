import { describe, expect, test } from 'bun:test'
import {
  addMonths,
  answers,
  effectiveDueOn,
  HOME_STALE_DAYS,
  inUpdates,
  isReminderPushRun,
  nearestFirst,
  planOnCompletion,
  reminderMomentFor,
  reminderPushDue,
  reminderStanding,
  remindersForJob,
  showsOnHome,
  snoozeUntil,
  type CarBooking,
  type ReminderFacts,
} from './service-reminders.js'

const IST = (iso: string) => new Date(`${iso}+05:30`)

const job = (over: Partial<{ id: string; completedAt: Date | null; scheduledAt: Date; categories: string[] }> = {}) => ({
  id: 'job-1',
  completedAt: IST('2026-01-15T16:00:00'),
  scheduledAt: IST('2026-01-15T10:00:00'),
  categories: ['coating'],
  ...over,
})

const reminder = (over: Partial<ReminderFacts & { snoozedUntil: string | null }> = {}) => ({
  id: 'r-1',
  kind: 'maintenance_wash' as const,
  dueOn: '2026-04-15',
  sourceBookingId: 'job-1',
  snoozedUntil: null,
  ...over,
})

const booking = (over: Partial<CarBooking> = {}): CarBooking => ({
  id: 'b-2',
  status: 'completed',
  scheduledAt: IST('2026-04-12T10:00:00'),
  completedAt: IST('2026-04-12T11:00:00'),
  paid: true,
  categories: ['car_wash'],
  ...over,
})

describe('addMonths', () => {
  test('calendar months, clamped to the month end', () => {
    expect(addMonths('2026-01-15', 3)).toBe('2026-04-15')
    expect(addMonths('2026-08-31', 3)).toBe('2026-11-30')
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29')
    expect(addMonths('2026-10-18', 12)).toBe('2027-10-18')
    expect(addMonths('2026-12-31', 6)).toBe('2027-06-30')
  })
})

describe('scheduling: coating 3 and 12 months, detailing 6', () => {
  test('a coating schedules a maintenance wash at 3 months and a check at 12', () => {
    expect(remindersForJob(job())).toEqual([
      { kind: 'maintenance_wash', dueOn: '2026-04-15' },
      { kind: 'coating_check', dueOn: '2027-01-15' },
    ])
  })

  test('a detailing schedules a repeat at 6 months', () => {
    expect(remindersForJob(job({ categories: ['detailing'] }))).toEqual([
      { kind: 'detailing_repeat', dueOn: '2026-07-15' },
    ])
  })

  test('coating and detailing in one booking: the coating\'s two only', () => {
    expect(remindersForJob(job({ categories: ['detailing', 'coating', 'car_wash'] })).map((r) => r.kind)).toEqual([
      'maintenance_wash',
      'coating_check',
    ])
  })

  test('a plain wash or scratch removal schedules nothing', () => {
    expect(remindersForJob(job({ categories: ['car_wash'] }))).toEqual([])
    expect(remindersForJob(job({ categories: ['scratch_removal', 'others'] }))).toEqual([])
  })

  test('dated from the IST completion date, not UTC', () => {
    // 23:30 IST on 31 Jan is still 31 Jan in Chennai (18:00 UTC).
    const late = job({ completedAt: IST('2026-01-31T23:30:00') })
    expect(remindersForJob(late)[0]).toEqual({ kind: 'maintenance_wash', dueOn: '2026-04-30' })
  })

  test('a job from before completion times counts from its slot', () => {
    const old = job({ completedAt: null, scheduledAt: IST('2026-02-01T09:00:00') })
    expect(remindersForJob(old)[0].dueOn).toBe('2026-05-01')
  })

  test('a package standing for a coating counts', () => {
    expect(remindersForJob(job({ categories: ['package', 'car_wash', 'coating'] }))).toHaveLength(2)
  })
})

describe('the completion moves them: planOnCompletion', () => {
  test('a newer coating supersedes the older coating\'s open reminders', () => {
    const open: ReminderFacts[] = [
      { id: 'old-check', kind: 'coating_check', dueOn: '2027-01-15', sourceBookingId: 'job-1' },
    ]
    const plan = planOnCompletion(job({ id: 'job-2', completedAt: IST('2026-06-01T12:00:00') }), open)
    expect(plan.insert).toEqual([
      { kind: 'maintenance_wash', dueOn: '2026-09-01' },
      { kind: 'coating_check', dueOn: '2027-06-01' },
    ])
    expect(plan.superseded).toEqual(['old-check'])
    expect(plan.done).toEqual([])
  })

  test('a wash near the due date answers the maintenance wash (done)', () => {
    const open: ReminderFacts[] = [reminder()]
    const wash = job({ id: 'wash', completedAt: IST('2026-04-10T10:00:00'), categories: ['car_wash'] })
    expect(planOnCompletion(wash, open)).toEqual({ insert: [], done: ['r-1'], superseded: [] })
  })

  test('a weekly wash long before the due date answers nothing', () => {
    const wash = job({ id: 'wash', completedAt: IST('2026-01-22T10:00:00'), categories: ['car_wash'] })
    expect(planOnCompletion(wash, [reminder()])).toEqual({ insert: [], done: [], superseded: [] })
  })

  test('a later coating answers an old maintenance wash that is due, and replaces the old check', () => {
    const open: ReminderFacts[] = [
      reminder(),
      { id: 'old-check', kind: 'coating_check', dueOn: '2027-01-15', sourceBookingId: 'job-1' },
    ]
    const plan = planOnCompletion(job({ id: 'job-2', completedAt: IST('2026-05-01T12:00:00') }), open)
    expect(plan.done).toEqual(['r-1'])
    expect(plan.superseded).toEqual(['old-check'])
  })

  test('running it again for the same job changes nothing it wrote', () => {
    const own: ReminderFacts[] = [
      { id: 'mine', kind: 'maintenance_wash', dueOn: '2026-04-15', sourceBookingId: 'job-1' },
    ]
    const plan = planOnCompletion(job(), own)
    // The inserts are the same rows again (unique per job and kind, so the
    // repository writes nothing new) and its own reminders are left open.
    expect(plan.done).toEqual([])
    expect(plan.superseded).toEqual([])
  })

  test('a detailing does not touch the coating check', () => {
    const open: ReminderFacts[] = [
      { id: 'check', kind: 'coating_check', dueOn: '2027-01-15', sourceBookingId: 'job-1' },
    ]
    const plan = planOnCompletion(job({ id: 'd', completedAt: IST('2026-12-20T10:00:00'), categories: ['detailing'] }), open)
    expect(plan.done).toEqual([])
    expect(plan.superseded).toEqual([])
  })
})

describe('answers', () => {
  test('only a category that answers the kind', () => {
    const r = { kind: 'coating_check' as const, dueOn: '2027-01-15', sourceBookingId: 'job-1' }
    expect(answers(r, { id: 'x', dateKey: '2027-01-10', categories: ['car_wash'] })).toBe(false)
    expect(answers(r, { id: 'x', dateKey: '2027-01-10', categories: ['coating'] })).toBe(true)
  })

  test('from 30 days before the due date', () => {
    const r = reminder()
    expect(answers(r, { id: 'x', dateKey: '2026-03-16', categories: ['car_wash'] })).toBe(true)
    expect(answers(r, { id: 'x', dateKey: '2026-03-15', categories: ['car_wash'] })).toBe(false)
  })

  test('never the job that scheduled it', () => {
    expect(answers(reminder(), { id: 'job-1', dateKey: '2026-04-15', categories: ['coating'] })).toBe(false)
  })
})

describe('reminderStanding', () => {
  test('upcoming, due soon, due, overdue by the IST date', () => {
    expect(reminderStanding(reminder(), [], '2026-04-01')).toMatchObject({ kind: 'open', state: 'upcoming', daysLeft: 14 })
    expect(reminderStanding(reminder(), [], '2026-04-08')).toMatchObject({ kind: 'open', state: 'due_soon', daysLeft: 7 })
    expect(reminderStanding(reminder(), [], '2026-04-15')).toMatchObject({ kind: 'open', state: 'due', daysLeft: 0 })
    expect(reminderStanding(reminder(), [], '2026-04-20')).toMatchObject({ kind: 'open', state: 'overdue', daysLeft: -5 })
  })

  test('a paid booking still to happen makes it booked; unpaid or too early does not', () => {
    const ahead = booking({ status: 'confirmed', completedAt: null, scheduledAt: IST('2026-04-18T10:00:00') })
    expect(reminderStanding(reminder(), [ahead], '2026-04-15')).toMatchObject({ kind: 'booked', bookingId: 'b-2' })
    expect(reminderStanding(reminder(), [{ ...ahead, paid: false }], '2026-04-15').kind).toBe('open')
    const early = { ...ahead, scheduledAt: IST('2026-02-01T10:00:00') }
    expect(reminderStanding(reminder(), [early], '2026-01-30').kind).toBe('open')
  })

  test('a completed booking that answers it makes it done; a cancelled one brings it back', () => {
    expect(reminderStanding(reminder(), [booking()], '2026-04-15')).toEqual({ kind: 'done', bookingId: 'b-2' })
    expect(reminderStanding(reminder(), [booking({ status: 'cancelled' })], '2026-04-15').kind).toBe('open')
  })

  test('snoozed: the snooze date is the due date in force', () => {
    const snoozed = reminder({ snoozedUntil: snoozeUntil('2026-04-15') })
    expect(snoozed.snoozedUntil).toBe('2026-04-29')
    expect(effectiveDueOn(snoozed)).toBe('2026-04-29')
    expect(reminderStanding(snoozed, [], '2026-04-16')).toMatchObject({ kind: 'open', state: 'upcoming', dueOn: '2026-04-29' })
    // A snooze ending before the date the rules gave it changes nothing.
    expect(effectiveDueOn(reminder({ snoozedUntil: '2026-03-01' }))).toBe('2026-04-15')
  })
})

describe('where it shows', () => {
  test('Home: from a week before until long overdue', () => {
    expect(showsOnHome(reminderStanding(reminder(), [], '2026-04-07'))).toBe(false)
    expect(showsOnHome(reminderStanding(reminder(), [], '2026-04-08'))).toBe(true)
    expect(showsOnHome(reminderStanding(reminder(), [], '2026-04-15'))).toBe(true)
    const stale = reminderStanding(reminder({ dueOn: '2026-01-01' }), [], '2026-03-03')
    expect(stale).toMatchObject({ daysLeft: -(HOME_STALE_DAYS + 1) })
    expect(showsOnHome(stale)).toBe(false)
    expect(showsOnHome({ kind: 'booked', bookingId: 'b', scheduledAt: new Date() })).toBe(false)
  })

  test('Updates: from 09:00 IST on the due date', () => {
    const standing = reminderStanding(reminder(), [], '2026-04-15')
    expect(reminderMomentFor('2026-04-15').toISOString()).toBe(IST('2026-04-15T09:00:00').toISOString())
    expect(inUpdates(standing, IST('2026-04-15T08:59:00'))).toBe(false)
    expect(inUpdates(standing, IST('2026-04-15T09:00:00'))).toBe(true)
  })

  test('nearest first by the due date in force', () => {
    const a = { standing: reminderStanding(reminder({ dueOn: '2026-05-01' }), [], '2026-04-01'), createdAt: new Date(1) }
    const b = { standing: reminderStanding(reminder({ dueOn: '2026-04-20' }), [], '2026-04-01'), createdAt: new Date(2) }
    expect([a, b].sort(nearestFirst)[0]).toBe(b)
  })
})

describe('the due date\'s notification: once, in the 09:00 IST runs', () => {
  const due = reminderStanding(reminder(), [], '2026-04-15')

  test('only the 09:00–09:59 IST runs', () => {
    expect(isReminderPushRun(IST('2026-04-15T08:50:00'))).toBe(false)
    expect(isReminderPushRun(IST('2026-04-15T09:00:00'))).toBe(true)
    expect(isReminderPushRun(IST('2026-04-15T09:59:00'))).toBe(true)
    expect(isReminderPushRun(IST('2026-04-15T10:00:00'))).toBe(false)
  })

  test('on the due date, not before or after', () => {
    expect(reminderPushDue({ notifiedOn: null }, due, IST('2026-04-15T09:10:00'))).toBe(true)
    const tomorrow = reminderStanding(reminder(), [], '2026-04-16')
    expect(reminderPushDue({ notifiedOn: null }, tomorrow, IST('2026-04-16T09:10:00'))).toBe(false)
    const before = reminderStanding(reminder(), [], '2026-04-14')
    expect(reminderPushDue({ notifiedOn: null }, before, IST('2026-04-14T09:10:00'))).toBe(false)
  })

  test('deduped: never twice for the same date', () => {
    expect(reminderPushDue({ notifiedOn: '2026-04-15' }, due, IST('2026-04-15T09:20:00'))).toBe(false)
  })

  test('a snooze makes one more, on its own date', () => {
    const snoozed = reminder({ snoozedUntil: '2026-04-29' })
    const standing = reminderStanding(snoozed, [], '2026-04-29')
    expect(reminderPushDue({ notifiedOn: '2026-04-15' }, standing, IST('2026-04-29T09:00:00'))).toBe(true)
    // Not on the original date while snoozed.
    const during = reminderStanding(snoozed, [], '2026-04-15')
    expect(reminderPushDue({ notifiedOn: null }, during, IST('2026-04-15T09:00:00'))).toBe(false)
  })

  test('never once booked or done', () => {
    const booked = reminderStanding(
      reminder(),
      [booking({ status: 'confirmed', completedAt: null, scheduledAt: IST('2026-04-16T10:00:00') })],
      '2026-04-15'
    )
    expect(reminderPushDue({ notifiedOn: null }, booked, IST('2026-04-15T09:00:00'))).toBe(false)
  })
})
