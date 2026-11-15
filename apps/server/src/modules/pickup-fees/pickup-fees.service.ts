import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { isPickupOffered } from '../../lib/pickup.js'
import {
  adminFeeProblems,
  detlioPlan,
  garageFeeOf,
  livePlanOf,
  nextGarageChangeAt,
  normaliseFee,
  parsePickupFeeSettings,
  problemMessage,
  pickupFeeSettingsProblems,
  planGarageChange,
  type GaragePickupFee,
  type PickupFeeMode,
  type PickupFeePlan,
  type PickupFeeSettings,
  type VendorFeeColumns,
} from '../../lib/pickup-fee.js'
import { pickupFeesRepository, type GarageFeeRow, type PickupFeeChangeRecord } from './pickup-fees.repository.js'

const log = logger.child({ module: 'pickup-fees' })

// ─── The settings, read once a minute at most ────────────────────────────────

const SETTINGS_TTL_MS = 60_000
let cached: { at: number; settings: PickupFeeSettings } | null = null

/** Forget the cached settings (after a save, and in tests). */
export function forgetPickupFeeSettings(): void {
  cached = null
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

export interface FeeChangeView {
  id: string
  kind: 'fee' | 'locked' | 'unlocked'
  byKind: 'garage' | 'detlio'
  byName: string
  before: GaragePickupFee
  after: GaragePickupFee
  status: 'live' | 'waiting' | 'approved' | 'kept' | 'replaced'
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  reason: string | null
}

function feeOfJson(value: unknown): GaragePickupFee {
  const stored = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const mode = stored.mode === 'fixed' || stored.mode === 'distance' ? (stored.mode as PickupFeeMode) : 'free'
  return {
    mode,
    fixed: n(stored.fixed),
    freeKm: n(stored.freeKm),
    perKm: n(stored.perKm),
    minCharge: n(stored.minCharge),
    maxCharge: n(stored.maxCharge),
  }
}

function toChangeView(row: PickupFeeChangeRecord): FeeChangeView {
  return {
    id: row.id,
    kind: row.kind,
    byKind: row.byKind,
    byName: row.byName,
    before: feeOfJson(row.before),
    after: feeOfJson(row.after),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedBy: row.decidedBy ?? null,
    reason: row.decisionReason ?? null,
  }
}

function columnsOf(row: GarageFeeRow): VendorFeeColumns {
  return {
    pickupFeeMode: row.pickupFeeMode,
    pickupFeeFixed: row.pickupFeeFixed,
    pickupFeeFreeKm: row.pickupFeeFreeKm,
    pickupFeePerKm: row.pickupFeePerKm,
    pickupFeeMin: row.pickupFeeMin,
    pickupFeeMax: row.pickupFeeMax,
    pickupFeeWaitingSince: row.pickupFeeWaitingSince,
    pickupFeeLockedAt: row.pickupFeeLockedAt,
    pickupFeeChangedAt: row.pickupFeeChangedAt,
  }
}

/** What the garage's screen and admin's card both show. */
function baseView(row: GarageFeeRow, settings: PickupFeeSettings, now: Date) {
  const next = nextGarageChangeAt(row.pickupFeeChangedAt, settings.limits.changeEveryDays)
  return {
    pickupOffered: isPickupOffered(row),
    fee: garageFeeOf(columnsOf(row)),
    livePlan: livePlanOf(columnsOf(row), settings),
    detlioPlan: detlioPlan(settings),
    waiting: row.pickupFeeWaitingSince ? { sentAt: row.pickupFeeWaitingSince.toISOString() } : null,
    locked: row.pickupFeeLockedAt !== null,
    /** When the garage may change its fee again; null when it may now. */
    nextChangeAt: next && next.getTime() > now.getTime() ? next.toISOString() : null,
    suggested: settings.suggested,
    limits: settings.limits,
  }
}

async function garageOr404(vendorId: string): Promise<GarageFeeRow> {
  const row = await pickupFeesRepository.findGarage(vendorId)
  if (!row || row.deletedAt) throw new AppError(404, 'Garage not found', 'VENDOR_NOT_FOUND')
  return row
}

/** "Velan Car Care (owner)", or the seat's own name. */
async function garageActorName(row: GarageFeeRow, userId: string): Promise<string> {
  if (row.ownerId === userId) return `${row.businessName} (owner)`
  const person = await pickupFeesRepository.findPerson(userId)
  const who = person?.name?.trim() || person?.phone || 'Team member'
  return `${who} (${row.businessName})`
}

// ─── The service ─────────────────────────────────────────────────────────────

export const pickupFeesService = {
  /** Admin's settings over the defaults, cached for a minute. */
  async settings(now = Date.now()): Promise<PickupFeeSettings> {
    if (cached && now - cached.at < SETTINGS_TTL_MS) return cached.settings
    const settings = parsePickupFeeSettings(await pickupFeesRepository.readSettings())
    cached = { at: now, settings }
    return settings
  },

  /** The fee customers see for a garage (null when it doesn't offer pickup). */
  livePlanFor(row: VendorFeeColumns & Parameters<typeof isPickupOffered>[0], settings: PickupFeeSettings): PickupFeePlan | null {
    return isPickupOffered(row) ? livePlanOf(row, settings) : null
  },

  /** Public: Detlio's suggestion and convenience fee, for Ask for pickup and checkout. */
  async publicConfig() {
    const settings = await this.settings()
    return {
      suggested: detlioPlan(settings),
      askRaisePct: settings.limits.askRaisePct,
      maxCharge: settings.limits.maxCharge,
      convenienceFee: settings.convenienceFee,
    }
  },

  // ─── The garage ──────────────────────────────────────────────────────────

  async getForGarage(vendorId: string, now = new Date()) {
    const settings = await this.settings()
    const row = await garageOr404(vendorId)
    const decision = await pickupFeesRepository.latestDecision(vendorId)
    // Only a decision on the garage's latest change matters to it.
    const fresh =
      decision && decision.decidedAt && (!row.pickupFeeChangedAt || decision.createdAt >= row.pickupFeeChangedAt)
    return {
      ...baseView(row, settings, now),
      decision: fresh
        ? { status: decision.status as 'approved' | 'kept', at: decision.decidedAt!.toISOString(), reason: decision.decisionReason ?? null }
        : null,
    }
  },

  /** The garage's own change (owner seat, never a Detlio support session). */
  async changeByGarage(
    vendorId: string,
    actor: { userId: string; viaSupport: boolean },
    requested: GaragePickupFee,
    now = new Date()
  ) {
    if (actor.viaSupport) {
      throw new AppError(403, "Change a garage's pickup fee from admin's garage editor.", 'PICKUP_FEE_GARAGE_ONLY')
    }
    const settings = await this.settings()
    const row = await garageOr404(vendorId)
    const plan = planGarageChange(columnsOf(row), requested, settings, now)
    if (!plan.ok) {
      throw new AppError(plan.status, plan.message, plan.code)
    }
    const written = await pickupFeesRepository.writeGarageChange({
      vendorId,
      fee: plan.fee,
      before: garageFeeOf(columnsOf(row)),
      status: plan.status,
      expectedChangedAt: row.pickupFeeChangedAt,
      actor: { kind: 'garage', userId: actor.userId, name: await garageActorName(row, actor.userId) },
      now,
    })
    if (!written) throw new AppError(409, 'Your pickup fee just changed. Pull to refresh.', 'PICKUP_FEE_STATE_CHANGED')
    log.info({ vendorId, mode: plan.fee.mode, status: plan.status }, 'pickup_fee:garage_changed')
    return this.getForGarage(vendorId, now)
  },

  // ─── Admin ───────────────────────────────────────────────────────────────

  async getSettings() {
    return this.settings(0)
  },

  async saveSettings(input: PickupFeeSettings, actor: { sub: string; name: string }) {
    const problems = pickupFeeSettingsProblems(input)
    if (problems.length > 0) throw new AppError(400, problems[0]!, 'PICKUP_FEE_SETTINGS_INVALID')
    await pickupFeesRepository.saveSettings({ ...input } as unknown as Record<string, unknown>, actor)
    forgetPickupFeeSettings()
    log.info({ actor: actor.name }, 'pickup_fee:settings_saved')
    return this.settings()
  },

  /** The garage editor's pickup card: the fee, lock, waiting change and every change. */
  async getForAdmin(vendorId: string, now = new Date()) {
    const settings = await this.settings()
    const row = await garageOr404(vendorId)
    const changes = await pickupFeesRepository.listChanges(vendorId)
    const waiting = changes.find((change) => change.status === 'waiting') ?? null
    return {
      ...baseView(row, settings, now),
      lockedBy: row.pickupFeeLockedBy ?? null,
      waitingChangeId: waiting?.id ?? null,
      changes: changes.map(toChangeView),
    }
  },

  /** Admin sets or overrides the fee: within the limits, live at once, no check. */
  async setByAdmin(vendorId: string, requested: GaragePickupFee, actorName: string, now = new Date()) {
    const settings = await this.settings()
    const row = await garageOr404(vendorId)
    const problems = adminFeeProblems(requested, settings)
    if (problems.length > 0) throw new AppError(400, problemMessage(problems[0]!), 'PICKUP_FEE_OUT_OF_LIMITS')
    await pickupFeesRepository.writeAdminFee({
      vendorId,
      fee: normaliseFee(requested, settings),
      before: garageFeeOf(columnsOf(row)),
      actor: { kind: 'detlio', userId: null, name: `Detlio · ${actorName}` },
      now,
    })
    log.info({ vendorId, mode: requested.mode }, 'pickup_fee:admin_set')
    return this.getForAdmin(vendorId, now)
  },

  async setLock(vendorId: string, locked: boolean, actorName: string, now = new Date()) {
    const row = await garageOr404(vendorId)
    await pickupFeesRepository.setLock({
      vendorId,
      locked,
      fee: garageFeeOf(columnsOf(row)),
      actor: { kind: 'detlio', userId: null, name: `Detlio · ${actorName}` },
      now,
    })
    log.info({ vendorId, locked }, 'pickup_fee:lock')
    return this.getForAdmin(vendorId, now)
  },

  /** Approve a waiting fee, or keep Detlio's with a reason the garage sees. */
  async decide(changeId: string, decision: 'approved' | 'kept', reason: string | null, actorName: string, now = new Date()) {
    if (decision === 'kept' && !reason?.trim()) {
      throw new AppError(400, 'Write the reason the garage will see.', 'PICKUP_FEE_REASON_REQUIRED')
    }
    const decided = await pickupFeesRepository.decide({
      changeId,
      decision,
      reason: decision === 'kept' ? reason!.trim().slice(0, 300) : null,
      actorName: `Detlio · ${actorName}`,
      now,
    })
    if (!decided) throw new AppError(409, 'This fee has already been checked. Reload to see where it is.', 'PICKUP_FEE_ANSWERED')
    log.info({ changeId, vendorId: decided.vendorId, decision }, 'pickup_fee:decided')
    return toChangeView(decided)
  },

  /** Issues → Pickup fees. */
  async listForCheck(show: 'waiting' | 'approved' | 'kept', now = new Date()) {
    const settings = await this.settings()
    const rows = await pickupFeesRepository.listForCheck(show)
    const counts = await pickupFeesRepository.countByStatus()
    const pickups = await pickupFeesRepository.pickupsSince(
      [...new Set(rows.map((row) => row.change.vendorId))],
      new Date(now.getTime() - 30 * 86_400_000)
    )
    return {
      counts,
      suggested: settings.suggested,
      items: rows.map((row) => ({
        ...toChangeView(row.change),
        garage: { id: row.change.vendorId, name: row.garageName },
        askedBy: {
          role: row.change.byUserId && row.change.byUserId === row.garageOwnerId ? ('owner' as const) : ('team' as const),
          phone: row.askedByPhone ?? null,
        },
        pickupsLast30Days: pickups.get(row.change.vendorId) ?? 0,
      })),
    }
  },
}
