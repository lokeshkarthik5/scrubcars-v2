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
import { zoneFor } from '../../lib/zones.js'
import { leadsRepository, type Conn } from '../leads/leads.repository.js'
import { toLeadResponse, type LeadResponse } from '../leads/leads.service.js'
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
  'live' | 'pending' | 'not_verified' | 'paused' | 'suspended' | 'archived'

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
  if (!row.isVerified) return 'not_verified'
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
  async overview(): Promise<CoverageOverview> {
    const [zones, garages, leads] = await Promise.all([
      coverageRepository.listZones(),
      coverageRepository.listGarages(),
      leadsRepository.listAll(),
    ])
    const sources = placesSources()
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

  /** Removes a zone no lead points at (409 ZONE_HAS_LEADS otherwise). Garages need nothing: their zone is worked out. */
  async removeZone(id: string, now = new Date()): Promise<{ removed: true }> {
    const zone = await coverageRepository.findZone(id)
    if (!zone) throw zoneNotFound()
    const count = await leadsRepository.countInZone(id)
    if (count > 0) {
      throw new AppError(
        409,
        `${count === 1 ? '1 lead is' : `${count} leads are`} in ${zone.name}. Move ${count === 1 ? 'it' : 'them'} to another zone or remove ${count === 1 ? 'it' : 'them'} first.`,
        'ZONE_HAS_LEADS'
      )
    }
    await coverageRepository
      .transaction(async (tx) => {
        const removed = await coverageRepository.deleteZone(id, tx)
        if (!removed) throw zoneNotFound()
        await rezoneLeads(tx, now)
      })
      .catch((err: unknown) => {
        // A lead added to it meanwhile: the RESTRICT key refuses the delete.
        if (hasPgCode(err, '23503')) {
          throw new AppError(
            409,
            `A lead was just added to ${zone.name}. Move it first.`,
            'ZONE_HAS_LEADS'
          )
        }
        throw err
      })
    clearZonesCache()
    log.info('coverage:zone_removed')
    return { removed: true }
  },
}
