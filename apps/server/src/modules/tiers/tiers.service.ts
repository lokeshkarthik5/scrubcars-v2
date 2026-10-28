import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { isDocumentStorageConfigured } from '../../lib/document-storage.js'
import { isCertified } from '../../lib/certification.js'
import {
  DEFAULT_TIER_SWITCHES,
  TIERS,
  TIER_LABELS,
  TIER_RULES,
  agreementStep,
  goldSteps,
  heldTier,
  progressLine,
  shownTier,
  silverAndAboveTiers,
  silverFilterOffered,
  silverSteps,
  tierGraceEndsOn,
  tierProgress,
  tierRunPaused,
  type Tier,
  type TierHoldings,
  type TierSwitches,
} from '../../lib/tiers.js'
import { agreementPublished, agreementStandings, agreementsService } from '../agreements/agreements.service.js'
import { measureTierFacts } from '../certification/certification.service.js'
import { tiersRepository } from './tiers.repository.js'
import type { TierHiddenInput, TierSwitchInput } from './tiers.validation.js'

const log = logger.child({ module: 'tiers' })

/** Admin's switches, every tier present (a missing row reads as on). */
async function readSwitches(): Promise<TierSwitches> {
  const rows = await tiersRepository.listSwitches()
  const switches = { ...DEFAULT_TIER_SWITCHES }
  for (const row of rows) switches[row.tier] = row.shown
  return switches
}

/** What each of these garages holds now: Gold, Silver (stored) and Bronze (the agreement). */
async function holdings(vendorIds: string[], now = new Date()): Promise<Map<string, TierHoldings>> {
  if (vendorIds.length === 0) return new Map()
  const gold = await tiersRepository.listGoldIds(vendorIds)
  const silver = await tiersRepository.listSilverIds(vendorIds)
  const agreements = await agreementStandings(vendorIds, now)
  return new Map(
    vendorIds.map((id) => [
      id,
      { gold: gold.has(id), silver: silver.has(id), bronze: agreements.get(id)?.bronze ?? false },
    ])
  )
}

/** The highest tier each of these garages holds now, whatever customers are shown. */
async function heldTiers(vendorIds: string[], now = new Date()): Promise<Map<string, Tier | null>> {
  const held = await holdings(vendorIds, now)
  return new Map(vendorIds.map((id) => [id, heldTier(held.get(id)!)]))
}

const NOTHING: TierHoldings = { gold: false, silver: false, bronze: false }

/** Where a garage stands now and what the next tier takes, from its own figures. */
async function progressOf(vendorId: string, now = new Date()) {
  const facts = await measureTierFacts(vendorId, now)
  const progress = tierProgress({
    agreement: facts.agreement,
    metrics: facts.metrics,
    check: facts.check,
    silverHeld: facts.silver?.silverAt != null,
    goldHeld: isCertified(facts.certification),
  })
  // A held tier falling short: the last day it is kept (Gold's 14 days run
  // in vendor_certifications, Silver's in vendor_tier_standings).
  const goldShort = progress.tier === 'gold' ? facts.certification?.ineligibleSince : null
  const silverShort = progress.tier === 'silver' ? facts.silver?.silverShortSince : null
  const shortSince = goldShort ?? silverShort ?? null
  return {
    facts,
    progress,
    atRisk: shortSince && progress.tier ? { tier: progress.tier, keepsUntil: tierGraceEndsOn(shortSince) } : null,
  }
}

function garageNotFound() {
  return new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
}

export const tiersService = {
  readSwitches,
  heldTiers,

  /**
   * The medal customers see on each of these garages: the highest tier held
   * that admin has switched on, none while hidden (lib/tiers.ts shownTier).
   */
  async customerTiers(vendorIds: string[], now = new Date()): Promise<Map<string, Tier | null>> {
    if (vendorIds.length === 0) return new Map()
    const [switches, held, hidden] = [
      await readSwitches(),
      await holdings(vendorIds, now),
      await tiersRepository.listHiddenIds(vendorIds),
    ]
    return new Map(vendorIds.map((id) => [id, shownTier(held.get(id) ?? NOTHING, switches, hidden.has(id))]))
  },

  /**
   * The tiers "Silver & above" lets through (the switched-on ones of Silver
   * and Gold), or null when the filter is not offered (both off): the list
   * then ignores it rather than come back empty.
   */
  async silverFilterTiers(): Promise<Array<'silver' | 'gold'> | null> {
    const switches = await readSwitches()
    return silverFilterOffered(switches) ? silverAndAboveTiers(switches) : null
  },

  /** GET /tiers: what the customer app needs to draw the filter. Public. */
  async publicConfig() {
    const switches = await readSwitches()
    return { shown: switches, silverFilter: silverFilterOffered(switches) }
  },

  /**
   * GET /vendors/me/tier: the garage's own tier and what the next one takes,
   * whatever admin's switches say (a garage always sees its own progress).
   * Never whether admin hid its medal, a checker's name or a check's notes.
   */
  async getForGarage(vendorId: string) {
    const { facts, progress, atRisk } = await progressOf(vendorId)
    return {
      tier: progress.tier,
      line: progressLine(progress),
      next: progress.next,
      /** What the tier held now asks for and is not met: what to put right. */
      keep: progress.keep,
      atRisk,
      agreement: facts.agreement,
      documentsOn: isDocumentStorageConfigured(),
      graceDays: TIER_RULES.graceDays,
    }
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /** Settings → Tiers: each tier's switch, who changed it last and when. */
  async getSettings() {
    const rows = await tiersRepository.listSwitches()
    const byTier = new Map(rows.map((row) => [row.tier, row]))
    const switches = await readSwitches()
    return {
      tiers: TIERS.map((tier) => ({
        tier,
        label: TIER_LABELS[tier],
        shown: switches[tier],
        updatedAt: byTier.get(tier)?.updatedAt.toISOString() ?? null,
        updatedBy: byTier.get(tier)?.updatedBy ?? null,
      })),
      silverFilter: silverFilterOffered(switches),
    }
  },

  async setSwitch(actorSub: string, input: TierSwitchInput) {
    await tiersRepository.setSwitch(input.tier, input.shown, { sub: actorSub, name: input.actorName })
    log.info({ tier: input.tier, shown: input.shown }, 'tiers:switch')
    return tiersService.getSettings()
  },

  /**
   * The garage page's tier section: what it holds, what customers see (and
   * why not), each tier's steps, the agreement acceptances, and the hide
   * switch. Gold's own screen (checks, Award Gold, Revoke) is the
   * certification section. Works for a garage in the Bin (read-only).
   */
  async getForAdmin(vendorId: string) {
    const garage = await tiersRepository.findGarage(vendorId)
    if (!garage || garage.purgedAt) throw garageNotFound()
    const now = new Date()
    const { facts, progress, atRisk } = await progressOf(vendorId, now)
    const switches = await readSwitches()
    const shown = shownTier(
      {
        gold: isCertified(facts.certification),
        silver: facts.silver?.silverAt != null,
        bronze: facts.agreement.bronze,
      },
      switches,
      garage.tierHidden
    )
    return {
      garage: { id: garage.id, businessName: garage.businessName, inBin: garage.deletedAt !== null },
      tier: progress.tier,
      line: progressLine(progress),
      /** The medal customers see now, and the switches that decide it. */
      shown,
      hidden: garage.tierHidden,
      switches,
      atRisk,
      next: progress.next,
      keep: progress.keep,
      steps: {
        bronze: [agreementStep(facts.agreement)],
        silver: silverSteps(facts.metrics),
        gold: goldSteps(facts.metrics, facts.check),
      },
      silver: {
        since: facts.silver?.silverAt?.toISOString() ?? null,
        lostAt: facts.silver?.silverLostAt?.toISOString() ?? null,
        lastEvaluatedAt: facts.silver?.lastEvaluatedAt?.toISOString() ?? null,
      },
      agreement: facts.agreement,
      acceptances: await agreementsService.acceptancesForAdmin(vendorId),
      /** Why the nightly run is changing nothing now, if it is not. */
      runPaused: tierRunPaused({
        documentsOn: isDocumentStorageConfigured(),
        agreementPublished: await agreementPublished(),
      }),
    }
  },

  /** Hide this garage's medal from customers, or show it again. Not on a garage in the Bin. */
  async setHidden(vendorId: string, actorSub: string, input: TierHiddenInput) {
    const garage = await tiersRepository.findGarage(vendorId)
    if (!garage || garage.purgedAt) throw garageNotFound()
    if (garage.deletedAt) {
      throw new AppError(409, 'This garage is in the Bin. Restore it first.', 'VENDOR_IN_BIN')
    }
    const result = await tiersRepository.setHidden(vendorId, input.hidden, { sub: actorSub, name: input.actorName })
    if (!result) throw garageNotFound()
    log.info({ vendorId, hidden: input.hidden }, 'tiers:medal_hidden')
    return tiersService.getForAdmin(vendorId)
  },
}
