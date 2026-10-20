import { runInBackground } from '../../lib/background.js'
import {
  KEPT_REASONS,
  MAX_CHAINS_PER_RUN,
  MAX_CHECKOUTS_PER_RUN,
  MONEY_LABELS,
  chainRootOf,
  countLines,
  idsToLookUp,
  phraseMatches,
  planReset,
  untickedRows,
  type ChainPlan,
  type CheckoutPlan,
  type PlanInput,
  type RazorpayLookup,
  type ResetPlan,
  type ResetScope,
} from '../../lib/data-reset.js'
import { formatComplaintNumber } from '../../lib/complaints.js'
import { AppError, hasPgCode } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { lookupRazorpayMode, razorpayKeyMode } from '../../lib/razorpay.js'
import { removeJobPhotoObjects } from '../../lib/job-photo-storage.js'
import {
  dataResetRepository,
  type DataResetReads,
  type DataResetWrites,
} from './data-reset.repository.js'
import type { ExecuteInput, PreviewInput } from './data-reset.validation.js'

const log = logger.child({ module: 'data-reset' })

// ─── Asking Razorpay about old money ─────────────────────────────────────────
//
// Rows from before gateway_mode (0032) carry no mode, and the only way to
// tell a test payment from a live one is to ask Razorpay. A dry run must
// answer inside one function call whatever the backlog, so each call asks
// about a slice and says how many are left; the page calls again until none
// are. What Razorpay answers is written to gateway_mode, so nothing is asked
// twice. An id it could not answer for comes back to the page, which sends
// it on the next call so it is not asked again: it stays unknown, and kept.

/** The most ids one dry-run call asks Razorpay about. */
const LOOKUPS_PER_CALL = 25
/** How long one call may spend asking, all lookups together. */
const LOOKUP_BUDGET_MS = 6_000
/** The most one lookup may take. */
const LOOKUP_TIMEOUT_MS = 3_000
/** Lookups in flight at once. */
const LOOKUP_WORKERS = 4

/** The audit log's name for this action. */
const AUDIT_ACTION = 'test_data_reset'

/** Why a voided receipt number was voided, as receipt_number_voids records it. */
const VOID_REASON = 'Test data deleted by the admin test-data reset'

/**
 * Asks Razorpay about each id, a few at a time, stopping when the budget is
 * spent. Returns what was answered; ids it never got to are left out.
 */
async function askRazorpay(ids: string[]): Promise<Map<string, RazorpayLookup>> {
  const answers = new Map<string, RazorpayLookup>()
  const deadline = Date.now() + LOOKUP_BUDGET_MS
  const queue = [...ids]

  const worker = async () => {
    for (;;) {
      const id = queue.shift()
      const left = deadline - Date.now()
      if (!id || left <= 250) return
      answers.set(id, await lookupRazorpayMode(id, Math.min(LOOKUP_TIMEOUT_MS, left)))
    }
  }
  await Promise.all(Array.from({ length: LOOKUP_WORKERS }, worker))
  return answers
}

// ─── Reading the plan's rows ─────────────────────────────────────────────────

function cutoffInFuture() {
  return new AppError(
    400,
    'The cutoff is in the future. Pick a time up to now.',
    'CUTOFF_IN_FUTURE'
  )
}

/** The request's scope as the planner reads it. A cutoff may not be ahead of the clock. */
function toScope(scope: PreviewInput['scope'], now: Date): ResetScope {
  switch (scope.kind) {
    case 'before_cutoff': {
      const cutoff = new Date(scope.cutoff)
      // A minute's grace for a browser clock slightly ahead of the server's.
      if (cutoff.getTime() > now.getTime() + 60_000) throw cutoffInFuture()
      return { kind: 'before_cutoff', cutoff }
    }
    case 'marked_test':
      return { kind: 'marked_test' }
    case 'chains':
      return { kind: 'chains', bookingIds: scope.bookingIds }
  }
}

/** The chains a scope names, by their first booking's id. */
function chainKeysOf(repo: DataResetReads, scope: ResetScope): Promise<string[]> {
  switch (scope.kind) {
    case 'before_cutoff':
      return repo.chainKeysCreatedBefore(scope.cutoff)
    case 'marked_test':
      return repo.chainKeysMarkedTest()
    case 'chains':
      return repo.chainKeysOfBookings(scope.bookingIds)
    case 'garage':
      return repo.chainKeysOfGarage(scope.vendorId)
  }
}

/**
 * Every row the planner needs for a scope, read through `repo` (the plain
 * connection for a dry run, the delete's transaction for the delete).
 *
 * The whole scope, whatever is ticked: the planner applies `only`. So the
 * dry run, its CSV and the audit row list every row in scope, the kept and
 * the unticked with them, and say why each one stays.
 */
export async function loadPlanInput(
  repo: DataResetReads,
  scope: ResetScope,
  only: PreviewInput['only'],
  lookups: Map<string, RazorpayLookup>,
  lookupsUnavailable: boolean,
  now: Date
): Promise<PlanInput> {
  const keys = await chainKeysOf(repo, scope)

  const bookings = await repo.chainBookings(keys)
  const bookingIds = bookings.map((b) => b.id)
  const charges = await repo.charges(bookingIds)
  const ownIntents = await repo.intentsOfBookings(bookingIds)
  const orphanCheckouts =
    scope.kind === 'before_cutoff'
      ? await repo.checkoutsWithoutBooking(scope.cutoff)
      : scope.kind === 'garage'
        ? await repo.checkoutsWithoutBookingAt(scope.vendorId)
        : []
  const intents = [...ownIntents, ...orphanCheckouts]

  const bookingChildCounts = await repo.bookingChildCounts(bookingIds)
  const reschedulesByChain = await repo.reschedulesByChain(keys)
  const intentChildCounts = await repo.intentChildCounts(intents.map((intent) => intent.id))
  // Only a cutoff run takes complaints; the planner ticks them as one.
  const complaints = scope.kind === 'before_cutoff' ? await repo.complaintsMadeBefore(scope.cutoff) : []
  // Usage events (0040), likewise a cutoff run's only, counted not listed.
  const analyticsEvents = scope.kind === 'before_cutoff' ? await repo.analyticsEventsBefore(scope.cutoff) : 0
  // Garage payouts that paid any of these chains: they go only with every
  // booking they paid.
  const payouts = await repo.payoutsOfChains(keys)

  const receipts = await repo.receipts(keys)
  const years = [...new Set(receipts.map((receipt) => receipt.financialYear))]
  const yearReceipts = await repo.yearReceipts(years)
  // Only needed to decide a year's plan, so only read when a year is touched.
  const unnumberedReceipts = years.length > 0 ? await repo.unnumberedReceipts() : []
  const counters = await repo.counters(years)
  const voidsByYear = await repo.voidsByYear(years)

  return {
    now,
    scope,
    only: only ?? null,
    bookings,
    charges,
    intents,
    bookingChildCounts,
    reschedulesByChain,
    intentChildCounts,
    complaints,
    analyticsEvents,
    payouts,
    receipts,
    yearReceipts,
    unnumberedReceipts,
    counters,
    voidsByYear,
    lookups,
    lookupsUnavailable,
  }
}

/**
 * The rows the delete locks before planning again: the ticked chains' every
 * booking with their own checkouts, and the ticked checkouts. With nothing
 * ticked (`only` absent, as from a booking's page), everything in scope.
 * The lock order is checkouts, then bookings, each in id order.
 */
export function rowsToLock(seen: PlanInput, only: PreviewInput['only']) {
  const tickedChains = only ? new Set(only.chainIds) : null
  const tickedCheckouts = only ? new Set(only.checkoutIds) : null
  const bookingIds = seen.bookings
    .filter((booking) => !tickedChains || tickedChains.has(chainRootOf(booking)))
    .map((booking) => booking.id)
  const lockedBookings = new Set(bookingIds)
  const intentIds = seen.intents
    .filter((intent) =>
      intent.bookingId !== null
        ? lockedBookings.has(intent.bookingId)
        : !tickedCheckouts || tickedCheckouts.has(intent.id)
    )
    .map((intent) => intent.id)
  return { bookingIds, intentIds }
}

// ─── Answers ─────────────────────────────────────────────────────────────────

function keptView(reason: ChainPlan['kept']) {
  return reason ? { code: reason, ...KEPT_REASONS[reason] } : null
}

function toChainView(chain: ChainPlan) {
  return {
    rootId: chain.rootId,
    reference: chain.reference,
    bookingIds: chain.bookingIds,
    createdAt: chain.createdAt.toISOString(),
    scheduledAt: chain.scheduledAt.toISOString(),
    status: chain.status,
    garage: { id: chain.garageId, name: chain.garageName },
    customer: { id: chain.customerId, name: chain.customerName, phone: chain.customerPhone },
    amount: chain.amount,
    paymentStatus: chain.paymentStatus,
    razorpayIds: chain.razorpayIds,
    money: chain.money,
    moneyLabel: MONEY_LABELS[chain.money],
    receiptNumber: chain.receiptNumber,
    refunded: chain.refunded,
    markedTest: chain.markedTest,
    kept: keptView(chain.kept),
    selected: chain.selected,
  }
}

function toCheckoutView(checkout: CheckoutPlan) {
  return {
    id: checkout.id,
    reference: checkout.reference,
    createdAt: checkout.createdAt.toISOString(),
    status: checkout.status,
    customer: { id: checkout.customerId, name: checkout.customerName },
    garageName: checkout.garageName,
    amount: checkout.amount,
    paymentRef: checkout.paymentRef,
    money: checkout.money,
    moneyLabel: MONEY_LABELS[checkout.money],
    refunded: checkout.refunded,
    kept: keptView(checkout.kept),
    selected: checkout.selected,
  }
}

/** The complaints in scope as one row of the list: how many, which numbers, ticked or not. */
function toComplaintsView(plan: ResetPlan) {
  const { ids, first, last, selected } = plan.complaints
  return {
    count: ids.length,
    firstNumber: first === null ? null : formatComplaintNumber(first),
    lastNumber: last === null ? null : formatComplaintNumber(last),
    selected,
  }
}

function toPlanView(plan: ResetPlan) {
  return {
    chains: plan.chains.map(toChainView),
    checkouts: plan.checkouts.map(toCheckoutView),
    complaints: toComplaintsView(plan),
    analyticsEvents: plan.analyticsEvents,
    counts: plan.counts,
    countLines: countLines(plan.counts),
    receiptPlan: plan.receiptPlan,
    overCap: plan.overCap,
    confirmPhrase: plan.confirmPhrase,
    selectionHash: plan.selectionHash,
  }
}

/** What the scope was, for the audit and the answer. */
function scopeView(scope: ResetScope) {
  switch (scope.kind) {
    case 'before_cutoff':
      return { kind: scope.kind, cutoff: scope.cutoff.toISOString() }
    case 'marked_test':
      return { kind: scope.kind }
    case 'chains':
      return { kind: scope.kind, bookingIds: scope.bookingIds }
    case 'garage':
      return { kind: scope.kind, vendorId: scope.vendorId }
  }
}

// ─── Refusals ────────────────────────────────────────────────────────────────

function previewStale() {
  return new AppError(
    409,
    'Something changed since the dry run: a booking was paid, refunded, moved or marked. Nothing was deleted. Run the dry run again and check the list.',
    'PREVIEW_STALE'
  )
}

function wrongPhrase(phrase: string) {
  return new AppError(400, `Type ${phrase} exactly as shown to confirm.`, 'CONFIRM_PHRASE_MISMATCH')
}

function nothingToDelete() {
  return new AppError(400, 'Nothing is ticked to delete.', 'NOTHING_TO_DELETE')
}

/**
 * A row the run needed was busy (a payment settling at that moment), or it
 * ran too long. Postgres rolled it all back.
 */
function busy() {
  return new AppError(
    503,
    "Some of these bookings were being changed at the same moment, so nothing was deleted. Try again in a minute.",
    'RESET_BUSY'
  )
}

// lock_not_available (lock_timeout), deadlock_detected, query_canceled
// (statement_timeout).
const BUSY_CODES = ['55P03', '40P01', '57014']

/** A row was busy or the run took too long, and Postgres rolled it all back. */
export function isBusyError(error: unknown): boolean {
  return BUSY_CODES.some((code) => hasPgCode(error, code))
}

/**
 * Steps 5 and 6 of the delete (see execute): the deleted chains' receipt
 * numbers (voided, or gone with a restarting year), the checkouts' refund
 * records, the checkouts, the ticked complaints and usage events (a cutoff
 * run's), the garage payouts that paid only deleted chains, then the
 * bookings with everything that cascades from them. Returns the job photos'
 * storage keys, to remove after the commit, and the restarting years, whose
 * counters the caller locks and deletes last of all (finishRestarts), after
 * anything else it deletes.
 *
 * Shared with deleting a garage forever (modules/vendor-bin), so the two can
 * never treat receipts or money differently.
 */
export async function deletePlannedRows(
  repo: DataResetReads & DataResetWrites,
  plan: ResetPlan,
  auditId: string,
  voidReason: string
): Promise<{ photoKeys: string[]; restartYears: string[] }> {
  const receiptRoots = plan.chains.filter((chain) => chain.selected).map((chain) => chain.rootId)
  for (const year of plan.receiptPlan) {
    if (year.mode === 'void') {
      await repo.voidReceipts(receiptRoots, year.financialYear, auditId, voidReason)
    }
  }
  await repo.deleteReceipts(receiptRoots)
  const restartYears = plan.receiptPlan
    .filter((year) => year.mode === 'restart')
    .map((year) => year.financialYear)
  for (const year of restartYears) await repo.deleteVoids(year)

  await repo.deleteCheckoutRefunds(plan.selectedIntentIds)
  const photoKeys = await repo.photoKeys(plan.selectedBookingIds)
  await repo.deleteIntents(plan.selectedIntentIds)
  // Before the bookings, so their delete has no complaint to set null.
  await repo.deleteComplaints(plan.selectedComplaintIds)
  // A cutoff run's usage events, when ticked. They point at nothing.
  if (plan.analyticsCutoff) await repo.deleteAnalyticsEventsBefore(plan.analyticsCutoff)
  // Before the bookings too: a payout's items name them ON DELETE RESTRICT.
  await repo.deletePayouts(plan.selectedPayoutIds)
  await repo.deleteBookings(plan.selectedBookingIds)
  return { photoKeys, restartYears }
}

/**
 * Step 7: a restarting year's counter row, FOR UPDATE, last of all; checked
 * to have no receipt left in the year (a payment numbered one meanwhile:
 * 409, all rolled back), then deleted.
 */
export async function finishRestarts(
  repo: DataResetReads & DataResetWrites,
  restartYears: string[]
): Promise<void> {
  await repo.lockCounters(restartYears)
  if ((await repo.countReceiptsIn(restartYears)) > 0) throw previewStale()
  await repo.deleteCounters(restartYears)
}

/**
 * The job photos' files in storage, once the rows are gone: the private
 * bucket and the public one (older photos). Best effort.
 */
function removePhotoFiles(keys: string[]) {
  if (keys.length === 0) return
  runInBackground('data_reset_photos', async () => {
    await removeJobPhotoObjects(keys, 'data_reset')
    log.info({ photos: keys.length }, 'data_reset:photos_removed')
  })
}

export const dataResetService = {
  /** What the admin page needs before it shows anything. Only reached while the switch is on. */
  config(now = new Date()) {
    return {
      enabled: true,
      keyMode: razorpayKeyMode(),
      maxChainsPerRun: MAX_CHAINS_PER_RUN,
      maxCheckoutsPerRun: MAX_CHECKOUTS_PER_RUN,
      now: now.toISOString(),
    }
  },

  /**
   * The dry run: everything in scope, what is kept and why, what the ticked
   * rows delete table by table, the receipt plan, the phrase to type and the
   * fingerprint the delete must match. Deletes nothing. It does record what
   * Razorpay says about old payments (gateway_mode), and asks about at most
   * a slice of them per call: `lookups.remaining` says how many are left.
   */
  async preview(input: PreviewInput, now = new Date()) {
    const scope = toScope(input.scope, now)
    const keyMode = razorpayKeyMode()
    const lookupsUnavailable = keyMode === 'fake' || keyMode === 'none'
    const lookups = new Map<string, RazorpayLookup>(
      input.unknownIds.map((id) => [id, 'unknown' as const])
    )

    const planInput = await loadPlanInput(
      dataResetRepository,
      scope,
      input.only,
      lookups,
      lookupsUnavailable,
      now
    )

    let checkedNow = 0
    const newlyUnknown: string[] = []
    if (!lookupsUnavailable) {
      const pending = idsToLookUp(planInput)
      if (pending.length > 0) {
        const answers = await askRazorpay(pending.slice(0, LOOKUPS_PER_CALL))
        const definite: Array<{ id: string; mode: 'live' | 'test' }> = []
        for (const [id, answer] of answers) {
          lookups.set(id, answer)
          if (answer === 'unknown') newlyUnknown.push(id)
          else definite.push({ id, mode: answer })
        }
        await dataResetRepository.saveGatewayModes(definite)
        checkedNow = answers.size
        log.info(
          { asked: answers.size, live: definite.filter((a) => a.mode === 'live').length, unknown: newlyUnknown.length },
          'data_reset:razorpay_checked'
        )
      }
    }

    const plan = planReset(planInput)
    return {
      scope: scopeView(scope),
      generatedAt: now.toISOString(),
      ...toPlanView(plan),
      lookups: {
        keyMode,
        checkedNow,
        remaining: lookupsUnavailable ? 0 : idsToLookUp(planInput).length,
        unknownIds: [...input.unknownIds, ...newlyUnknown],
      },
    }
  },

  /**
   * The delete, in one transaction, in this order:
   *
   *   1. lock_timeout 5s and statement_timeout 60s, for this transaction;
   *   2. the checkouts, then the bookings, FOR UPDATE in id order (the lock
   *      order in bookings.repository.ts: an intent first, then the
   *      booking's own row);
   *   3. the plan worked out again from the locked rows, and refused unless
   *      its fingerprint is the dry run's (409 PREVIEW_STALE) and the typed
   *      phrase is its phrase (400 CONFIRM_PHRASE_MISMATCH);
   *   4. the audit row, with the full snapshot;
   *   5. receipt numbers: copied to the voids in a 'void' year, then
   *      deleted; a 'restart' year's voids deleted too;
   *   6. the checkouts' refund records (no foreign key), the checkouts, the
   *      ticked complaints and usage events, the garage payouts that paid
   *      only ticked bookings, then the bookings with everything that
   *      cascades from them;
   *   7. last of all, a restarting year's counter row, FOR UPDATE, checked
   *      to have no receipt left in the year (a payment numbered one in the
   *      meantime: 409, all rolled back), then deleted.
   *
   * After the commit, the job photos' files are removed from storage and the
   * team is told on Telegram. Live, cash and unconfirmed money is never in
   * the plan, so it cannot be deleted here whatever the request says.
   */
  async execute(sub: string, input: ExecuteInput, now = new Date()) {
    const scope = toScope(input.scope, now)
    const keyMode = razorpayKeyMode()
    const lookupsUnavailable = keyMode === 'fake' || keyMode === 'none'
    // No Razorpay calls inside the transaction: what was not answered in
    // the dry run stays unchecked, and so kept.
    const lookups = new Map<string, RazorpayLookup>(
      input.unknownIds.map((id) => [id, 'unknown' as const])
    )

    let outcome: { plan: ResetPlan; auditId: string; at: Date; photoKeys: string[] }
    try {
      outcome = await dataResetRepository.transaction(async (repo) => {
        await repo.limitWaits()

        // Only the ticked rows are locked: the rest of the scope is read for
        // the plan and the audit, but nothing is done to it, and locking
        // every booking in scope would hold up the pilot's payments.
        const seen = await loadPlanInput(repo, scope, input.only, lookups, lookupsUnavailable, now)
        const toLock = rowsToLock(seen, input.only)
        await repo.lockIntents(toLock.intentIds)
        await repo.lockBookings(toLock.bookingIds)

        const plan = planReset(
          await loadPlanInput(repo, scope, input.only, lookups, lookupsUnavailable, now)
        )
        if (plan.selectionHash !== input.selectionHash) throw previewStale()
        if (
          plan.selectedChainIds.length === 0 &&
          plan.selectedCheckoutIds.length === 0 &&
          plan.selectedComplaintIds.length === 0 &&
          plan.counts.analyticsEvents === 0
        ) {
          throw nothingToDelete()
        }
        if (!phraseMatches(input.confirmText, plan.confirmPhrase)) {
          throw wrongPhrase(plan.confirmPhrase)
        }

        const selected = plan.chains.filter((chain) => chain.selected)
        const kept = [...plan.chains, ...plan.checkouts].filter((row) => row.kept)
        // In scope and deletable, but not ticked (or past the run's cap), and
        // the complaints when their tick is off.
        const unticked = untickedRows(plan)
        const rowId = (row: ChainPlan | CheckoutPlan) => ('rootId' in row ? row.rootId : row.id)
        const audit = await repo.insertAudit({
          action: AUDIT_ACTION,
          actorSub: sub,
          actorName: input.actorName,
          summary: {
            scope: scopeView(scope),
            counts: plan.counts,
            receipts: plan.receiptPlan.map((year) => year.words),
            kept: kept.length,
            unticked: unticked.rowIds.length,
            untickedComplaints: unticked.complaintIds.length,
          },
          // Ids, references and Razorpay ids, never phone numbers.
          detail: {
            chains: selected.map((chain) => ({
              rootId: chain.rootId,
              reference: chain.reference,
              bookingIds: chain.bookingIds,
              createdAt: chain.createdAt.toISOString(),
              scheduledAt: chain.scheduledAt.toISOString(),
              status: chain.status,
              garageId: chain.garageId,
              garageName: chain.garageName,
              customerId: chain.customerId,
              amount: chain.amount,
              paymentStatus: chain.paymentStatus,
              razorpayIds: chain.razorpayIds,
              money: chain.money,
              receiptNumber: chain.receiptNumber,
              refunded: chain.refunded,
              markedTest: chain.markedTest,
            })),
            checkouts: plan.checkouts
              .filter((checkout) => checkout.selected)
              .map((checkout) => ({
                id: checkout.id,
                createdAt: checkout.createdAt.toISOString(),
                status: checkout.status,
                customerId: checkout.customerId,
                amount: checkout.amount,
                paymentRef: checkout.paymentRef,
                money: checkout.money,
                refunded: checkout.refunded,
              })),
            intentIds: plan.selectedIntentIds,
            // Ids only: a complaint's name, phone and words are not copied
            // into the audit log.
            complaintIds: plan.selectedComplaintIds,
            // Usage events are anonymous: only when they were cut off.
            analyticsEventsBefore: plan.analyticsCutoff?.toISOString() ?? null,
            // Garage payouts that paid only deleted bookings: ids only.
            payoutIds: plan.selectedPayoutIds,
            receiptPlan: plan.receiptPlan,
            kept: kept.map((row) => ({ id: rowId(row), reason: row.kept })),
            unticked: unticked.rowIds,
            untickedComplaintIds: unticked.complaintIds,
            selectionHash: plan.selectionHash,
          },
        })

        const { photoKeys, restartYears } = await deletePlannedRows(repo, plan, audit.id, VOID_REASON)

        // The counter's lock is the last one any transaction takes.
        await finishRestarts(repo, restartYears)

        return { plan, auditId: audit.id, at: audit.createdAt, photoKeys }
      })
    } catch (error) {
      if (error instanceof AppError) throw error
      if (isBusyError(error)) {
        log.warn({ err: error }, 'data_reset:busy')
        throw busy()
      }
      // A unique index on the receipt numbers or voids: the numbering moved
      // under the run. Everything was rolled back.
      if (hasPgCode(error, '23505')) throw previewStale()
      throw error
    }

    const { plan, auditId, at, photoKeys } = outcome
    removePhotoFiles(photoKeys)
    log.warn(
      {
        auditId,
        sub,
        by: input.actorName,
        scope: scopeView(scope),
        counts: plan.counts,
        receipts: plan.receiptPlan.map((year) => `${year.financialYear}:${year.mode}`),
      },
      'data_reset:executed'
    )
    alertOps({
      kind: 'test_data_cleared',
      by: input.actorName,
      bookings: plan.counts.bookings,
      checkouts: plan.selectedCheckoutIds.length,
      receipts: plan.receiptPlan.map((year) => year.words),
      auditId,
    })

    return {
      auditId,
      at: at.toISOString(),
      by: input.actorName,
      counts: plan.counts,
      countLines: countLines(plan.counts),
      receiptPlan: plan.receiptPlan,
      photosRemoved: photoKeys.length,
    }
  },
}
