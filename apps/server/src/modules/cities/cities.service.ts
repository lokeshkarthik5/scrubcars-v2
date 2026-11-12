import {
  cityById,
  cityNameKey,
  cityStanding,
  customerCities,
  OTHER_TOWNS_LABEL,
  parseOtherTownsVisible,
  type City,
  type CustomerCity,
  type GarageCityStanding,
} from '../../lib/cities.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { areaSignupsService } from '../area-signups/area-signups.service.js'
import { isListedToCustomers } from '../vendors/vendors.predicates.js'
import { citiesRepository, type CityRecord } from './cities.repository.js'
import type { CreateCityInput, OtherTownsInput, UpdateCityInput } from './cities.validation.js'

const log = logger.child({ module: 'cities' })

/**
 * A city's switch, reach or centre changes which garages customers can find
 * in one go, as a garage's own status change does: the waiting customers'
 * "a garage has come to your area" check runs (0062), in the background.
 * The customers' list of cities is read again on this instance at once.
 */
function listingMayHaveChanged() {
  clearCustomerCitiesCache()
  areaSignupsService.launchSoon()
}

/**
 * The customers' cities change rarely (an admin action) and their garage
 * counts slowly, so one read a minute per instance at most, as GET /zones
 * (reach.service listZones). A change made on this instance clears it.
 */
const CUSTOMER_CITIES_TTL_MS = 60_000
let customerCitiesCache: { at: number; cities: CustomerCity[] } | null = null

/** For tests, and after a city change: read the customers' cities again. */
export function clearCustomerCitiesCache() {
  customerCitiesCache = null
}

type Actor = { sub: string; name: string }

function cityNotFound() {
  return new AppError(404, 'City not found', 'CITY_NOT_FOUND')
}

function toCity(row: CityRecord): City {
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    reachKm: row.reachKm,
    customersSee: row.customersSee,
    growing: row.growing,
  }
}

/** How many garages a place holds, and how many customers can find. */
export interface PlaceCounts {
  /** Listed to customers now (isListedToCustomers, the city's switch included). */
  garagesLive: number
  /** Every garage not in the Bin. */
  garagesTotal: number
  /**
   * The live garages switching this place off would hide: every live one
   * but those with "Show this garage anyway". For the confirm sheet's
   * "Customers won't see N garages in Tirupur".
   */
  garagesHiddenWhenOff: number
}

export type AdminCity = City & PlaceCounts & { createdAt: string; updatedAt: string }

export interface CitiesOverview {
  cities: AdminCity[]
  otherTowns: PlaceCounts & { label: string; visible: boolean }
}

/** What every caller of the live rule needs to know about cities, read once. */
export interface CityRules {
  cities: City[]
  otherTownsVisible: boolean
  /**
   * The garage's city (its stored `vendors.city_id`, which the database
   * keeps by lib/cities.ts cityOfGarage), and whether it lets customers see
   * the garage.
   */
  standingOf(garage: { cityId: string | null; showWhenCityOff: boolean }): GarageCityStanding
}

async function assertNameFree(name: string, exceptId: string | null) {
  const key = cityNameKey(name)
  const others = await citiesRepository.listOtherCityNames(exceptId)
  const taken = others.find((other) => cityNameKey(other.name) === key)
  if (taken) {
    throw new AppError(409, `There is already a city called ${taken.name}.`, 'CITY_NAME_TAKEN')
  }
}

/** A unique-index refusal from a city added meanwhile, as the same 409. */
function nameTakenOnWrite(name: string) {
  return (err: unknown) => {
    if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
      throw new AppError(409, `There is already a city called ${name}.`, 'CITY_NAME_TAKEN')
    }
    throw err
  }
}

export const citiesService = {
  /**
   * The cities and the Other towns switch, read once, with a resolver for
   * any garage. The admin list's Live, Coverage and leads all ask the live
   * rule through this, so they agree with the customer lists' SQL
   * (CITY_SHOWN in vendors.predicates.ts).
   */
  async rules(): Promise<CityRules> {
    const [rows, otherTowns] = await Promise.all([
      citiesRepository.listCities(),
      citiesRepository.otherTownsValue(),
    ])
    const list = rows.map(toCity)
    const otherTownsVisible = parseOtherTownsVisible(otherTowns)
    return {
      cities: list,
      otherTownsVisible,
      standingOf: (garage) => cityStanding(cityById(garage.cityId, list), garage.showWhenCityOff, otherTownsVisible),
    }
  },

  /**
   * `GET /cities` (0070): the cities switched on for customers, the default
   * first, each with how many garages customers can find there. Cached a
   * minute.
   */
  async customerCities(now = Date.now()): Promise<CustomerCity[]> {
    if (customerCitiesCache && now - customerCitiesCache.at < CUSTOMER_CITIES_TTL_MS) {
      return customerCitiesCache.cities
    }
    const [rows, counts] = await Promise.all([
      citiesRepository.listCities(),
      citiesRepository.listedGarageCounts(),
    ])
    const list = customerCities(
      rows.map((row) => ({ ...toCity(row), createdAt: row.createdAt })),
      counts
    )
    customerCitiesCache = { at: now, cities: list }
    return list
  },

  /** Every city, A–Z, for the garage forms' city select (no counts). */
  async listCities(): Promise<City[]> {
    return (await citiesRepository.listCities()).map(toCity)
  },

  /** Admin → Cities: each city with its counts, and the Other towns row. */
  async overview(): Promise<CitiesOverview> {
    const [rows, otherTowns, garages] = await Promise.all([
      citiesRepository.listCities(),
      citiesRepository.otherTownsValue(),
      citiesRepository.listGarageFacts(),
    ])
    const list = rows.map(toCity)
    const otherTownsVisible = parseOtherTownsVisible(otherTowns)
    const counts = new Map<string | null, PlaceCounts>()
    const countOf = (key: string | null) => {
      let entry = counts.get(key)
      if (!entry) {
        entry = { garagesLive: 0, garagesTotal: 0, garagesHiddenWhenOff: 0 }
        counts.set(key, entry)
      }
      return entry
    }
    for (const garage of garages) {
      const city = cityById(garage.cityId, list)
      const cityShown = city ? city.customersSee : otherTownsVisible
      const entry = countOf(city?.id ?? null)
      entry.garagesTotal += 1
      if (isListedToCustomers({ ...garage, cityShown })) {
        entry.garagesLive += 1
        if (!garage.showWhenCityOff) entry.garagesHiddenWhenOff += 1
      }
    }
    const none = { garagesLive: 0, garagesTotal: 0, garagesHiddenWhenOff: 0 }
    return {
      cities: rows.map((row) => ({
        ...toCity(row),
        ...(counts.get(row.id) ?? none),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      otherTowns: { label: OTHER_TOWNS_LABEL, visible: otherTownsVisible, ...(counts.get(null) ?? none) },
    }
  },

  async createCity(input: CreateCityInput, actor: Actor) {
    await assertNameFree(input.name, null)
    const city = await citiesRepository
      .createCity(
        {
          name: input.name,
          lat: input.lat,
          lng: input.lng,
          reachKm: input.reachKm,
          customersSee: input.customersSee,
          growing: input.growing,
        },
        actor
      )
      .catch(nameTakenOnWrite(input.name))
    log.info({ cityId: city.id, reachKm: city.reachKm, customersSee: city.customersSee }, 'cities:added')
    listingMayHaveChanged()
    return citiesService.overview()
  },

  async updateCity(id: string, input: UpdateCityInput, actor: Actor) {
    const existing = await citiesRepository.findCity(id)
    if (!existing) throw cityNotFound()
    if (input.name !== undefined) await assertNameFree(input.name, id)
    const updated = await citiesRepository
      .updateCity(
        id,
        {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.lat !== undefined && input.lng !== undefined && { lat: input.lat, lng: input.lng }),
          ...(input.reachKm !== undefined && { reachKm: input.reachKm }),
          ...(input.customersSee !== undefined && { customersSee: input.customersSee }),
          ...(input.growing !== undefined && { growing: input.growing }),
        },
        actor
      )
      .catch(nameTakenOnWrite(input.name ?? existing.name))
    if (!updated) throw cityNotFound()
    log.info({ cityId: id, customersSee: updated.customersSee, growing: updated.growing }, 'cities:updated')
    listingMayHaveChanged()
    return citiesService.overview()
  },

  /**
   * Deletes a city. Its garages move to whichever city now holds them, or to
   * Other towns: the database recomputes every garage's city_id in the same
   * statement (0069's trigger on cities). A whole-city doorstep or pickup
   * garage left with no city keeps to its own radius.
   */
  async deleteCity(id: string, actor: Actor) {
    const deleted = await citiesRepository.deleteCity(id, actor)
    if (!deleted) throw cityNotFound()
    log.info({ cityId: id }, 'cities:deleted')
    listingMayHaveChanged()
    return citiesService.overview()
  },

  async setOtherTowns(input: OtherTownsInput, actor: Actor) {
    await citiesRepository.setOtherTowns(input.visible, actor)
    log.info({ visible: input.visible }, 'cities:other_towns')
    listingMayHaveChanged()
    return citiesService.overview()
  },
}
