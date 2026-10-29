/**
 * The team's Cancel (0064) and a customer's checkout for the same accepted
 * request never cross: both take the request's row lock first, each as a
 * statement of its own, so whichever comes second sees what the first did.
 *
 * - Cancel locks the row, then cancels with a separate statement that
 *   refuses while a checkout is open. (One statement that waited for the
 *   lock would re-check only the row, never the intent written meanwhile.)
 * - A checkout locks the row and opens only while the request is still
 *   accepted, before writing its intent.
 *
 * The statements are run against a stand-in connection that records them
 * (drizzle's pg-proxy driver), never a database.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/pg-proxy'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { db } = await import('../../db/index.js')
const { bookingRequestsRepository } = await import('./booking-requests.repository.js')
const { bookingIntentsRepository } = await import('../booking-intents/booking-intents.repository.js')

const REQUEST = 'e2e00000-0000-4000-8000-000000005990'
const STOP = new Error('stop: the statements so far are the point')

/** A transaction on a connection that records each statement and answers with `answers`, in order. */
function recordTransactions(answers: unknown[][][]) {
  const statements: string[] = []
  const tx = drizzle(async (sql) => {
    statements.push(sql.replace(/\s+/g, ' ').trim().toLowerCase())
    const rows = answers.shift()
    if (!rows) throw STOP
    return { rows }
  })
  const original = db.transaction
  ;(db as unknown as { transaction: unknown }).transaction = (work: (t: unknown) => Promise<unknown>) => work(tx)
  restore = () => {
    ;(db as unknown as { transaction: unknown }).transaction = original
  }
  return statements
}

/** The error a stopped statement ends in (drizzle wraps it, with ours as the cause). */
const stopped = (err: unknown) => (err as { cause?: unknown }).cause ?? err

let restore = () => {}
afterEach(() => restore())

describe('the team’s Cancel takes the request’s lock before it cancels', () => {
  test('a lock on the row on its own, then the conditional cancel as a later statement', async () => {
    // Nothing locked, nothing cancelled (a checkout is open, or it moved on).
    const statements = recordTransactions([[], []])
    const cancelled = await bookingRequestsRepository.cancelByAdmin({
      id: REQUEST,
      actorName: 'Raga',
      actorSub: 'admin:1',
      reason: 'Customer asked us to',
      now: new Date(),
    })
    expect(cancelled).toBeNull()
    expect(statements).toHaveLength(2)
    expect(statements[0]).toStartWith('select')
    expect(statements[0]).toContain('from "booking_requests"')
    expect(statements[0]).toEndWith('for update')
    expect(statements[1]).toStartWith('update "booking_requests"')
    expect(statements[1]).toContain('not exists ( select 1 from booking_intents i')
  })
})

describe('a checkout for a request opens only while it is still accepted, under its lock', () => {
  const intent = (requestId: string | null) =>
    ({
      userId: 'e2e00000-0000-4000-8000-000000005991',
      vendorId: 'e2e00000-0000-4000-8000-000000005992',
      serviceId: 'e2e00000-0000-4000-8000-000000005993',
      vehicleId: 'e2e00000-0000-4000-8000-000000005994',
      bookingType: 'doorstep',
      scheduledAt: new Date(),
      serviceDurationMins: 60,
      subtotalAmount: '600.00',
      requestId,
      amount: '600.00',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }) as Parameters<typeof bookingIntentsRepository.createIntent>[0]
  const items = [{ serviceId: 'e2e00000-0000-4000-8000-000000005993', name: 'Foam wash', amount: '600.00', durationMins: 60 }]

  test('cancelled meanwhile (by the team or the customer): no intent is written', async () => {
    const statements = recordTransactions([[['cancelled']]])
    expect(await bookingIntentsRepository.createIntent(intent(REQUEST), items)).toBeNull()
    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('from "booking_requests"')
    expect(statements[0]).toEndWith('for update')
  })

  test('gone altogether: no intent either', async () => {
    const statements = recordTransactions([[]])
    expect(await bookingIntentsRepository.createIntent(intent(REQUEST), items)).toBeNull()
    expect(statements).toHaveLength(1)
  })

  test('still accepted: the intent is written after the lock, in the same transaction', async () => {
    const statements = recordTransactions([[['accepted']]])
    expect(await bookingIntentsRepository.createIntent(intent(REQUEST), items).catch(stopped)).toBe(STOP)
    expect(statements[0]).toEndWith('for update')
    expect(statements[1]).toStartWith('insert into "booking_intents"')
  })

  test('an ordinary checkout (no request) takes no request lock', async () => {
    const statements = recordTransactions([])
    expect(await bookingIntentsRepository.createIntent(intent(null), items).catch(stopped)).toBe(STOP)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toStartWith('insert into "booking_intents"')
  })
})
