import { AppError, hasPgCode } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { placesSources } from '../../lib/places/index.js'
import {
  cleanZoneName,
  leadZoneMoves,
  newZoneSlug,
  ZONE_EDIT_MESSAGES,
  zoneEditProblem,
  type ZoneEditProblem,
} from '../../lib/zone-edits.js'
import {
  HOT_ZONE_RULES,
  zoneDemand,
  zoneRemovalBlock,
  type ZoneDemand,
} from '../../lib/zone-demand.js'
import { zoneFor } from '../../lib/zones.js'
import { areaSignupsRepository } from '../area-signups/area-signups.repository.js'
import { bookingRequestsRepository } from '../booking-requests/booking-requests.repository.js'
import { leadsRepository, type Conn } from '../leads/leads.repository.js'
import {
  toLeadResponse,
  toRecommendationResponse,
  type LeadResponse,
  type RecommendationResponse,
} from '../leads/leads.service.js'
import { clearZonesCache } from '../reach/reach.service.js'
import { isListedToCustomers } from '../vendors/vendors.predicates.js'
import { coverageRepository, type ZoneRecord } from './coverage.repository.js'
import type { CreateZoneInput, UpdateZoneInput } from './coverage.validation.js'

const log = logger.child({ module: 'coverage' })

export interface CoverageZone {
  id: string
  slug: string
  name: string
  lat: number
  lng: number
  priority: boolean
  target: number
  liveAt: string | null
  updatedAt: string
}

/** Where a garage is on the way to customers: live, or the step it is waiting on. */
export type GarageStage =
  'live' | 'pending' | 'not_shown' | 'paused' | 'suspended' | 'archived'

export interface CoverageGarage {
  id: string
  name: string
  phone: string
  lat: number | null
  lng: number | null
  /** From the pin by the zones' one rule (lib/zones.ts zoneFor); null with no pin or outside every zone. */
  zoneId: string | null
  live: boolean
  stage: GarageStage
}

export interface CoverageOverview {
  zones: CoverageZone[]
  garages: CoverageGarage[]
  leads: LeadResponse[]
  /** Which sources the zone finder can search. */
  finder: { google: boolean; ola: boolean }
  /** Each zone's demand, in the zones' order (lib/zone-demand.ts). */
  demand: ZoneDemand[]
  /** The Hot rule's numbers, for the panel to say (never to restate). */
  hotRule: typeof HOT_ZONE_RULES
  /** Customer recommendations not dismissed: new ones are the zones' lists, the rest show on their lead. */
  recommendations: RecommendationResponse[]
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Demand per zone, from customer reach's own rows: the sign-ups (with
 * their issued codes, read by area sign-ups' own query), the last 30 days'
 * requests by their latest row, and the recommendations.
 */
async function readDemand(
  zones: ZoneRecord[],
  recommendations: ReadonlyArray<{ zoneId: string | null; status: string }>,
  now: Date
): Promise<ZoneDemand[]> {
  const [signups, requests] = await Promise.all([
    coverageRepository.listSignups(),
    bookingRequestsRepository.listLatestSince(
      new Date(now.getTime() - HOT_ZONE_RULES.requestDays * DAY_MS)
    ),
  ])
  const discountIds = signups.flatMap((signup) =>
    signup.discountId ? [signup.discountId] : []
  )
  const discounts = new Map(
    (discountIds.length > 0
      ? await areaSignupsRepository.unusedDiscounts(discountIds)
      : []
    ).map((discount) => [discount.id, discount])
  )
  return zoneDemand(
    zones,
    {
      signups: signups.map((signup) => {
        const discount = signup.discountId
          ? discounts.get(signup.discountId)
          : undefined
        return {
          zoneId: signup.zoneId,
          freeWash: signup.freeWash,
          discount: discount
            ? {
                isActive: discount.isActive,
                held: Number(discount.held),
                endsAt: discount.endsAt,
              }
            : null,
        }
      }),
      requests,
      recommendations,
    },
    now
  )
}

function toZone(row: ZoneRecord): CoverageZone {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    priority: row.priority,
    target: row.target,
    liveAt: row.liveAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function garageStage(row: {
  status: string
  isVerified: boolean
  bookingsPausedAt: Date | null
  deletedAt: Date | null
}): GarageStage {
  if (isListedToCustomers(row)) return 'live'
  if (row.status === 'pending') return 'pending'
  if (row.status === 'suspended') return 'suspended'
  if (row.status === 'archived') return 'archived'
  if (!row.isVerified) return 'not_shown'
  return 'paused'
}

const ZONE_PROBLEM_STATUS: Record<ZoneEditProblem, number> = {
  name_length: 400,
  name_letters: 400,
  name_taken: 409,
  target: 400,
  outside_city: 400,
}

function zoneProblem(problem: ZoneEditProblem): AppError {
  return new AppError(
    ZONE_PROBLEM_STATUS[problem],
    ZONE_EDIT_MESSAGES[problem],
    problem === 'name_taken' ? 'ZONE_NAME_TAKEN' : 'ZONE_INVALID'
  )
}

const zoneNotFound = () => new AppError(404, 'Zone not found', 'ZONE_NOT_FOUND')

/**
 * After the zones changed, each pinned lead goes to the zone its pin is in
 * now (the zones' one rule), in the same transaction as the change.
 */
async function rezoneLeads(conn: Conn, now: Date): Promise<number> {
  const [zones, pinned] = await Promise.all([
    coverageRepository.listZones(conn),
    leadsRepository.listPinned(conn),
  ])
  const moves = leadZoneMoves(pinned, zones)
  await leadsRepository.setZones(moves, now, conn)
  return moves.length
}

/** A unique-name race the check above missed is the same answer. */
function asZoneWriteError(err: unknown): never {
  if (hasPgCode(err, '23505')) throw zoneProblem('name_taken')
  throw err
}

export const coverageService = {
  /**
   * The Coverage page in one read: every zone, every garage not in the Bin
   * with its zone (worked out here, by the one rule, so the panel never
   * restates it), every lead, and which finder sources are connected.
   */
  async overview(now = new Date()): Promise<CoverageOverview> {
    const [zones, garages, leads, recommendations] = await Promise.all([
      coverageRepository.listZones(),
      coverageRepository.listGarages(),
      leadsRepository.listAll(),
      leadsRepository.listRecommendations(),
    ])
    const sources = placesSources()
    const demand = await readDemand(zones, recommendations, now)
    return {
      zones: zones.map(toZone),
      garages: garages.map((garage) => ({
        id: garage.id,
        name: garage.businessName,
        phone: garage.phone,
        lat: garage.lat,
        lng: garage.lng,
        zoneId: zoneFor(garage, zones)?.id ?? null,
        live: isListedToCustomers(garage),
        stage: garageStage(garage),
      })),
      leads: leads.map(toLeadResponse),
      finder: { google: sources.google !== null, ola: sources.ola !== null },
      demand,
      hotRule: HOT_ZONE_RULES,
      recommendations: recommendations
        .filter((rec) => rec.status !== 'declined')
        .map(toRecommendationResponse),
    }
  },

  async createZone(
    input: CreateZoneInput,
    now = new Date()
  ): Promise<CoverageZone> {
    const zones = await coverageRepository.listZones()
    const name = cleanZoneName(input.name)
    const problem = zoneEditProblem(
      { id: null, name, target: input.target, lat: input.lat, lng: input.lng },
      zones
    )
    if (problem) throw zoneProblem(problem)
    const slug = newZoneSlug(name, new Set(zones.map((zone) => zone.slug)))

    const { zone, moved } = await coverageRepository
      .transaction(async (tx) => {
        const zone = await coverageRepository.insertZone(
          {
            slug,
            name,
            lat: input.lat,
            lng: input.lng,
            priority: input.priority,
            target: input.target,
            createdAt: now,
            updatedAt: now,
          },
          tx
        )
        return { zone, moved: await rezoneLeads(tx, now) }
      })
      .catch(asZoneWriteError)
    clearZonesCache()
    log.info({ moved }, 'coverage:zone_added')
    return toZone(zone)
  },

  async updateZone(
    id: string,
    input: UpdateZoneInput,
    now = new Date()
  ): Promise<CoverageZone> {
    const zones = await coverageRepository.listZones()
    const current = zones.find((zone) => zone.id === id)
    if (!current) throw zoneNotFound()
    const next = {
      id,
      name: input.name !== undefined ? cleanZoneName(input.name) : current.name,
      target: input.target ?? current.target,
      lat: input.lat ?? current.lat,
      lng: input.lng ?? current.lng,
    }
    const problem = zoneEditProblem(next, zones)
    // An existing zone keeps working even if its centre was left outside
    // the city by hand before: only a move is held to it.
    if (problem && !(problem === 'outside_city' && input.lat === undefined))
      throw zoneProblem(problem)

    const moved =
      input.lat !== undefined &&
      (input.lat !== current.lat || input.lng !== current.lng)
    const { zone, rezoned } = await coverageRepository
      .transaction(async (tx) => {
        const zone = await coverageRepository.updateZone(
          id,
          {
            ...(input.name !== undefined && { name: next.name }),
            ...(input.priority !== undefined && { priority: input.priority }),
            ...(input.target !== undefined && { target: input.target }),
            ...(moved && { lat: next.lat, lng: next.lng }),
            updatedAt: now,
          },
          tx
        )
        if (!zone) throw zoneNotFound()
        return { zone, rezoned: moved ? await rezoneLeads(tx, now) : 0 }
      })
      .catch(asZoneWriteError)
    clearZonesCache()
    log.info({ moved, rezoned }, 'coverage:zone_changed')
    return toZone(zone)
  },

  /**
   * Removes a zone nothing points at: no lead, and no customer's sign-up,
   * request or recommendation (409 ZONE_IN_USE, saying what is in it).
   * Garages need nothing: their zone is worked out.
   */
  async removeZone(id: string, now = new Date()): Promise<{ removed: true }> {
    const zone = await coverageRepository.findZone(id)
    if (!zone) throw zoneNotFound()
    const [leads, signups, requests, recommendations] = await Promise.all([
      leadsRepository.countInZone(id),
      coverageRepository.countSignupsInZone(id),
      bookingRequestsRepository.countInZone(zone.slug),
      leadsRepository.countRecommendationsInZone(id),
    ])
    const blocked = zoneRemovalBlock(zone.name, {
      leads,
      signups,
      requests,
      recommendations,
    })
    if (blocked) throw new AppError(409, blocked, 'ZONE_IN_USE')
    const inUse = () =>
      new AppError(
        409,
        `${zone.name} is still in use, so it was kept. Reload to see what is in it.`,
        'ZONE_IN_USE'
      )
    await coverageRepository
      .transaction(async (tx) => {
        const removed = await coverageRepository.deleteZone(id, tx)
        if (removed === 'missing') throw zoneNotFound()
        // A request sent from it meanwhile (requests keep the slug, not a key).
        if (removed === 'in_use') throw inUse()
        await rezoneLeads(tx, now)
      })
      .catch((err: unknown) => {
        // Something points at it that the count above did not see: a lead
        // added meanwhile, or a customer's sign-up or recommendation. The
        // foreign key refuses the delete; say so without guessing which.
        if (hasPgCode(err, '23503')) {
          throw inUse()
        }
        throw err
      })
    clearZonesCache()
    log.info('coverage:zone_removed')
    return { removed: true }
  },
}
