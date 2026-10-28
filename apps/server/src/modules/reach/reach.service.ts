import { logger } from '../../lib/logger.js'
import {
  JUST_OUTSIDE_LIMIT,
  listCarriesJustOutside,
  listCarriesReach,
  outsideByKm,
} from '../../lib/reach.js'
import { zonesWithGarages } from '../../lib/zones.js'
import type { ListPublicVendorsQuery } from '../vendors/vendors.validation.js'
import {
  vendorCardsFor,
  type VendorListItemResponse,
  type VendorListResponse,
} from '../vendors/vendors.service.js'
import { reachRepository, type ReachRow } from './reach.repository.js'

const log = logger.child({ module: 'reach' })

/** One zone as the customer app reads it (`GET /zones`). */
export interface PublicZone {
  slug: string
  name: string
  lat: number
  lng: number
  priority: boolean
  /** At least one live listed garage's pin is in this zone (lib/zones.ts). */
  hasGarage: boolean
}

/**
 * How many garages each tab offers the customer, for the At garage tab's
 * "Skip the drive" card and the bottom of every tab (customer reach, 0062).
 * Follows the list's category and Certified filters.
 */
export interface ReachSummary {
  dropin: {
    count: number
    /** The nearest at-garage garage, in km to one decimal; null without a location or a pinned one. */
    nearestKm: number | null
  }
  /** Doorstep garages that come to the customer (all pinned ones without a location). */
  doorstep: { count: number; fromPrice: number | null }
  /** Pickup & drop garages that collect from the customer (all pinned ones without a location). */
  pickup: { count: number; fromPrice: number | null }
}

/** A "Just outside their area" card: the list's card plus how far it reaches and how far out the customer is. */
export type JustOutsideItem = VendorListItemResponse & {
  /** The radius it covers, in km; null for a doorstep garage with a drawn area. */
  coverKm: number | null
  /** How far past its reach the customer is, in km to one decimal (never under 0.1). */
  outsideKm: number
}

export type ReachListResponse = VendorListResponse & {
  /**
   * On a list's first page (not a search or the map): what each tab offers.
   * Null on later pages, and when the figures could not be read (the list
   * still answers; the cards that need them just do not show).
   */
  reach: ReachSummary | null
  /**
   * Doorstep and Pickup & drop with a location, first page: garages that do
   * not come to the customer but are within 15 km past their reach, closest
   * to covering them first. Null otherwise.
   */
  outside: JustOutsideItem[] | null
}

/** Zones change rarely; one read a minute per instance at most. */
const ZONES_TTL_MS = 60_000
let zonesCache: { at: number; zones: PublicZone[] } | null = null

const toNumber = (value: number | string | null): number | null =>
  value === null || value === undefined ? null : Number(value)

function toSummary(row: ReachRow): ReachSummary {
  const nearestM = toNumber(row.dropin_nearest_m)
  return {
    dropin: {
      count: Number(row.dropin_count),
      nearestKm: nearestM === null ? null : Number((nearestM / 1000).toFixed(1)),
    },
    doorstep: { count: Number(row.doorstep_count), fromPrice: toNumber(row.doorstep_from) },
    pickup: { count: Number(row.pickup_count), fromPrice: toNumber(row.pickup_from) },
  }
}

export const reachService = {
  /** Every zone, and whether a live listed garage is in it. Cached a minute. */
  async listZones(now = Date.now()): Promise<PublicZone[]> {
    if (zonesCache && now - zonesCache.at < ZONES_TTL_MS) return zonesCache.zones
    const [rows, pins] = [await reachRepository.listZones(), await reachRepository.listListedGaragePins()]
    const withGarage = zonesWithGarages(rows, pins)
    const zones = rows.map((zone) => ({
      slug: zone.slug,
      name: zone.name,
      lat: zone.lat,
      lng: zone.lng,
      priority: zone.priority,
      hasGarage: withGarage.has(zone.slug),
    }))
    zonesCache = { at: now, zones }
    return zones
  },

  /**
   * The garage list with its reach figures and, on Doorstep and Pickup & drop,
   * the "Just outside their area" group: both in the same call, so the
   * screen never needs a second request to never be empty.
   *
   * Each extra is optional for the list: a failure is logged and comes back
   * as null, and the garages still answer.
   */
  async withReach(list: VendorListResponse, query: ListPublicVendorsQuery): Promise<ReachListResponse> {
    const origin =
      query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : undefined
    const filters = { category: query.category, certifiedOnly: query.certified }

    let reach: ReachSummary | null = null
    if (listCarriesReach(query)) {
      try {
        reach = toSummary(await reachRepository.summary(origin, filters))
      } catch (error) {
        log.warn({ err: error }, 'reach:summary_failed')
      }
    }

    let outside: JustOutsideItem[] | null = null
    if (
      origin &&
      (query.bookingType === 'doorstep' || query.bookingType === 'pickup') &&
      listCarriesJustOutside({ ...query, hasOrigin: true })
    ) {
      try {
        const rows = await reachRepository.listJustOutside({
          origin,
          bookingType: query.bookingType,
          filters,
          limit: JUST_OUTSIDE_LIMIT,
        })
        const cards = await vendorCardsFor(rows.map((row) => ({ id: row.id, distanceM: row.distanceM })))
        const byId = new Map(rows.map((row) => [row.id, row]))
        outside = cards.flatMap((card) => {
          const row = byId.get(card.id)
          if (!row) return []
          return [
            {
              ...card,
              coverKm: row.coverKm,
              outsideKm: outsideByKm(row.outsideM / 1000, 0),
            },
          ]
        })
      } catch (error) {
        log.warn({ err: error }, 'reach:just_outside_failed')
      }
    }

    return { ...list, reach, outside }
  },
}

/** For tests: forget the cached zones. */
export function clearZonesCache() {
  zonesCache = null
}
