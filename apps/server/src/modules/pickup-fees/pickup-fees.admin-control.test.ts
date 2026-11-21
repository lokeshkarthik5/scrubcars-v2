/**
 * Admin's control of each garage's pickup fee (0079, owner's 15 Nov ask:
 * "grey it out for each garage & whatever we want to do"), through the real
 * service and, for the garage's refusal, the real route with its auth and
 * tenant middleware. Only the repository is stood in for, as an in-memory
 * garage row that the stand-ins write the same columns to (the column sets
 * come from lib/pickup-fee.ts, as the real repository's do), and put back.
 *
 *   - admin's own fee: past the garage limits, inside the hard caps, live at
 *     once with no approval, logged with admin's name, the garage's 7 days
 *     untouched;
 *   - "Who sets this garage's fee: Detlio" refuses the garage's own change
 *     (409 PICKUP_FEE_LOCKED at the API) and a Detlio support session's;
 *   - per-garage limits: checked against the hard caps, enforced on the
 *     garage's change, shown to the garage as its limits.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { pickupFeesRepository } = await import('./pickup-fees.repository.js')
const { pickupFeesService, forgetPickupFeeSettings } = await import('./pickup-fees.service.js')
const { garagePickupFeeRoutes } = await import('./pickup-fees.routes.js')
const lib = await import('../../lib/pickup-fee.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const GARAGE = id(7795)
const OWNER = id(7796)
const NOW = new Date('2026-11-15T06:00:00.000Z')
const DAY = 86_400_000

type Row = Record<string, unknown>
let garage: Row
let written: Array<{ kind: string; byName: string; status?: string }>

const restores: Array<() => void> = []
function patch(target: object, key: string, value: unknown) {
  const holder = target as Record<string, unknown>
  const original = holder[key]
  holder[key] = value
  restores.push(() => {
    holder[key] = original
  })
}

function freshGarage(over: Row = {}): Row {
  return {
    id: GARAGE,
    businessName: 'Velan Pickup Care',
    ownerId: OWNER,
    phone: '9000007795',
    pickup: 'yes',
    pickupRadiusKm: 10,
    pickupTermsAcceptedAt: new Date('2026-10-01T00:00:00Z'),
    deletedAt: null,
    ...lib.feeColumns(lib.FREE_PICKUP_FEE),
    pickupFeeWaitingSince: null,
    pickupFeeLockedAt: null,
    pickupFeeLockedBy: null,
    pickupFeeChangedAt: null,
    pickupFeeSource: 'garage',
    ...lib.limitColumns(lib.NO_LIMIT_OVERRIDES),
    ...over,
  }
}

beforeEach(() => {
  garage = freshGarage()
  written = []
  forgetPickupFeeSettings()
  patch(pickupFeesRepository, 'readSettings', async () => null)
  patch(pickupFeesRepository, 'findGarage', async () => ({ ...garage }))
  patch(pickupFeesRepository, 'findLimits', async () => ({ ...garage }))
  patch(pickupFeesRepository, 'listChanges', async () => [])
  patch(pickupFeesRepository, 'latestDecision', async () => null)
  patch(pickupFeesRepository, 'writeAdminFee', async (input: { fee: never; actor: { name: string } }) => {
    Object.assign(garage, lib.adminFeeColumns(input.fee))
    written.push({ kind: 'fee', byName: input.actor.name, status: 'live' })
  })
  patch(pickupFeesRepository, 'writeGarageChange', async (input: { fee: never; status: 'live' | 'waiting'; now: Date; actor: { name: string } }) => {
    Object.assign(garage, lib.garageChangeColumns(input.fee, input.status, input.now))
    written.push({ kind: 'fee', byName: input.actor.name, status: input.status })
    return true
  })
  patch(pickupFeesRepository, 'writeLimits', async (input: { overrides: never; actor: { name: string } }) => {
    Object.assign(garage, lib.limitColumns(input.overrides))
    written.push({ kind: 'limits', byName: input.actor.name })
  })
  patch(pickupFeesRepository, 'setLock', async (input: { locked: boolean; actor: { name: string }; now: Date }) => {
    Object.assign(
      garage,
      input.locked
        ? { pickupFeeLockedAt: input.now, pickupFeeLockedBy: input.actor.name }
        : { pickupFeeLockedAt: null, pickupFeeLockedBy: null }
    )
    written.push({ kind: input.locked ? 'locked' : 'unlocked', byName: input.actor.name })
    return true
  })
})

afterEach(() => {
  while (restores.length) restores.pop()!()
  forgetPickupFeeSettings()
})

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (err) {
    return err
  }
  return null
}

const fixed = (amount: number) => ({ ...lib.FREE_PICKUP_FEE, mode: 'fixed' as const, fixed: amount })
const distance = (over: Partial<ReturnType<typeof fixed>> = {}) => ({ ...lib.FREE_PICKUP_FEE, mode: 'distance' as const, ...over })

describe('admin sets a garage’s fee', () => {
  test('past the garage limits, inside the hard caps: live at once, no approval, admin’s name on it', async () => {
    garage = freshGarage(lib.limitColumns({ ...lib.NO_LIMIT_OVERRIDES, fixedMax: 150 }))
    // ₹280 fixed: above this garage's ₹150 limit and above Detlio's suggestion.
    const view = await pickupFeesService.setByAdmin(GARAGE, fixed(280), 'Lokesh', NOW)
    expect(written).toEqual([{ kind: 'fee', byName: 'Detlio · Lokesh', status: 'live' }])
    expect(view.waiting).toBeNull()
    expect(view.setBy).toBe('detlio')
    expect(view.livePlan).toMatchObject({ mode: 'fixed', fixed: 280 })
    expect(garage.pickupFeeWaitingSince).toBeNull()
  })

  test('Free keeps pickup on at ₹0', async () => {
    garage = freshGarage(lib.feeColumns(fixed(150)))
    const view = await pickupFeesService.setByAdmin(GARAGE, lib.FREE_PICKUP_FEE, 'Lokesh', NOW)
    expect(view.pickupOffered).toBe(true)
    expect(view.livePlan.mode).toBe('free')
  })

  test('past the hard caps: refused, nothing written', async () => {
    const err = await refusal(pickupFeesService.setByAdmin(GARAGE, fixed(300), 'Lokesh', NOW))
    expect(err).toBeInstanceOf(AppError)
    expect((err as InstanceType<typeof AppError>).code).toBe('PICKUP_FEE_OUT_OF_LIMITS')
    expect(written).toEqual([])
  })

  test('the garage’s 7-day counter is neither used up nor reset', async () => {
    const ownChange = new Date(NOW.getTime() - 2 * DAY)
    garage = freshGarage({ ...lib.feeColumns(distance()), pickupFeeChangedAt: ownChange })
    const before = (await pickupFeesService.getForGarage(GARAGE, NOW)).nextChangeAt
    await pickupFeesService.setByAdmin(GARAGE, fixed(200), 'Lokesh', NOW)
    expect(garage.pickupFeeChangedAt).toEqual(ownChange)
    expect((await pickupFeesService.getForGarage(GARAGE, NOW)).nextChangeAt).toBe(before)
    expect(before).toBe(new Date(ownChange.getTime() + 7 * DAY).toISOString())

    // A garage that never changed its own fee can still change it at once after admin's.
    garage = freshGarage()
    await pickupFeesService.setByAdmin(GARAGE, fixed(200), 'Lokesh', NOW)
    expect((await pickupFeesService.getForGarage(GARAGE, NOW)).nextChangeAt).toBeNull()
    await pickupFeesService.changeByGarage(GARAGE, { userId: OWNER, viaSupport: false }, distance(), NOW)
    expect(garage.pickupFeeSource).toBe('garage')
  })
})

describe('who sets this garage’s fee: Detlio', () => {
  test('the garage’s own change is refused, and the fee stays as admin set it', async () => {
    await pickupFeesService.setByAdmin(GARAGE, fixed(250), 'Lokesh', NOW)
    await pickupFeesService.setLock(GARAGE, true, 'Lokesh', NOW)
    const view = await pickupFeesService.getForGarage(GARAGE, NOW)
    expect(view.locked).toBe(true)
    expect(view.livePlan).toMatchObject({ mode: 'fixed', fixed: 250 })
    const err = await refusal(pickupFeesService.changeByGarage(GARAGE, { userId: OWNER, viaSupport: false }, lib.FREE_PICKUP_FEE, NOW))
    expect((err as InstanceType<typeof AppError>).code).toBe('PICKUP_FEE_LOCKED')
    expect((err as InstanceType<typeof AppError>).message).toBe('Set by Detlio. Ask Detlio to change it.')
    // Admin still can.
    await pickupFeesService.setByAdmin(GARAGE, fixed(120), 'Lokesh', NOW)
    expect((await pickupFeesService.getForGarage(GARAGE, NOW)).livePlan).toMatchObject({ mode: 'fixed', fixed: 120 })
  })

  test('a Detlio support session in the garage portal can’t change it either', async () => {
    const err = await refusal(pickupFeesService.changeByGarage(GARAGE, { userId: OWNER, viaSupport: true }, fixed(100), NOW))
    expect((err as InstanceType<typeof AppError>).code).toBe('PICKUP_FEE_GARAGE_ONLY')
  })
})

describe('per-garage limits', () => {
  test('saved inside the hard caps, shown to the garage as its limits, enforced on its change', async () => {
    const limits = { ...lib.NO_LIMIT_OVERRIDES, perKm: { min: 5, max: 12 }, fixedMax: 150, needsApproval: false }
    const admin = await pickupFeesService.setLimits(GARAGE, limits, 'Lokesh', NOW)
    expect(written).toEqual([{ kind: 'limits', byName: 'Detlio · Lokesh' }])
    expect(admin.overrides).toEqual(limits)
    expect(admin.defaultLimits).toEqual(lib.DEFAULT_PICKUP_FEE_SETTINGS.limits)

    const view = await pickupFeesService.getForGarage(GARAGE, NOW)
    expect(view.limits.perKm).toEqual({ min: 5, max: 12 })
    expect(view.limits.fixedMax).toBe(150)
    expect(view.needsApproval).toBe(false)

    const tooHigh = await refusal(pickupFeesService.changeByGarage(GARAGE, { userId: OWNER, viaSupport: false }, fixed(200), NOW))
    expect((tooHigh as InstanceType<typeof AppError>).code).toBe('PICKUP_FEE_OUT_OF_LIMITS')
    // A fixed ₹150 is above Detlio's free short trips, but this garage skips the check.
    const saved = await pickupFeesService.changeByGarage(GARAGE, { userId: OWNER, viaSupport: false }, fixed(150), NOW)
    expect(saved.waiting).toBeNull()
    expect(saved.livePlan).toMatchObject({ mode: 'fixed', fixed: 150 })
  })

  test('narrowed after the garage saved: customers are charged inside the new limits', async () => {
    await pickupFeesService.changeByGarage(GARAGE, { userId: OWNER, viaSupport: false }, fixed(150), NOW)
    expect(garage.pickupFeeWaitingSince).not.toBeNull()
    garage.pickupFeeWaitingSince = null // approved
    await pickupFeesService.setLimits(GARAGE, { ...lib.NO_LIMIT_OVERRIDES, fixedMax: 99 }, 'Lokesh', NOW)
    expect((await pickupFeesService.getForGarage(GARAGE, NOW)).livePlan).toMatchObject({ mode: 'fixed', fixed: 99 })
    // Reset to Detlio's defaults: the garage's ₹150 again.
    await pickupFeesService.setLimits(GARAGE, lib.NO_LIMIT_OVERRIDES, 'Lokesh', NOW)
    expect((await pickupFeesService.getForGarage(GARAGE, NOW)).livePlan).toMatchObject({ mode: 'fixed', fixed: 150 })
  })

  test('outside the hard caps, or a range the wrong way round: refused, nothing written', async () => {
    for (const bad of [
      { ...lib.NO_LIMIT_OVERRIDES, fixedMax: 300 },
      { ...lib.NO_LIMIT_OVERRIDES, perKm: { min: 20, max: 10 } },
      { ...lib.NO_LIMIT_OVERRIDES, perKm: { min: 5, max: 31 } },
      { ...lib.NO_LIMIT_OVERRIDES, askRaisePct: 60 },
      { ...lib.NO_LIMIT_OVERRIDES, changeEveryDays: 0 },
      // Below the top of the lowest-charge range (₹149).
      { ...lib.NO_LIMIT_OVERRIDES, maxCharge: 120 },
    ]) {
      const err = await refusal(pickupFeesService.setLimits(GARAGE, bad, 'Lokesh', NOW))
      expect((err as InstanceType<typeof AppError>).code).toBe('PICKUP_FEE_LIMITS_INVALID')
    }
    expect(written).toEqual([])
  })
})

describe('PUT /vendors/me/pickup-fee (the garage’s own route)', () => {
  const app = new Hono()
  app.onError((err, c) =>
    err instanceof AppError
      ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
      : c.json({ success: false, message: String(err) }, 500)
  )
  app.route('/vendors/me/pickup-fee', garagePickupFeeRoutes)

  async function put(body: unknown) {
    const token = await signAccessToken({ sub: OWNER, aud: 'vendor', isCustomer: false, isVendorOwner: true })
    return app.request('/vendors/me/pickup-fee', {
      method: 'PUT',
      headers: { Cookie: `access_token=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  beforeEach(() => {
    patch(membersRepository, 'listActiveVendorSeats', async () => [{ id: id(7797), vendorId: GARAGE, role: 'vendor_admin' }])
  })

  test('set by Detlio: 409 PICKUP_FEE_LOCKED, nothing written', async () => {
    garage = freshGarage({ ...lib.adminFeeColumns(fixed(250)), pickupFeeLockedAt: NOW, pickupFeeLockedBy: 'Detlio · Lokesh' })
    const res = await put({ mode: 'free' })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('PICKUP_FEE_LOCKED')
    expect(written).toEqual([])
    expect(garage.pickupFeeMode).toBe('fixed')
  })

  test('the garage’s route takes the fee alone: who sets it, its limits and its source are not its to send', async () => {
    for (const extra of [{ locked: false }, { source: 'detlio' }, { limits: { fixedMax: 299 } }, { needsApproval: false }]) {
      const res = await put({ mode: 'fixed', fixed: 100, ...extra })
      expect(res.status).toBe(400)
    }
    expect(written).toEqual([])
  })

  test('set by the garage: its change goes through', async () => {
    const res = await put({ mode: 'distance' })
    expect(res.status).toBe(200)
    expect(written).toEqual([{ kind: 'fee', byName: 'Velan Pickup Care (owner)', status: 'live' }])
  })
})
