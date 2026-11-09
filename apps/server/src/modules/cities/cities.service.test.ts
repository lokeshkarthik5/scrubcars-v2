/**
 * Cities (0069) through the real service code, with only the database stood
 * in for: the Cities page's counts (which city each garage is in, who is
 * live, and how many a switch-off would hide), the name check, and the
 * live rule other screens read through `rules()`.
 */
import { afterEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { citiesService } = await import('./cities.service.js')
const { citiesRepository } = await import('./cities.repository.js')
const { areaSignupsService } = await import('../area-signups/area-signups.service.js')
const { AppError } = await import('../../lib/errors.js')
const { cityOfGarage } = await import('../../lib/cities.js')

const restores: Array<() => void> = []
function patch(target: object, key: string, value: unknown) {
  const holder = target as Record<string, unknown>
  const original = holder[key]
  holder[key] = value
  restores.push(() => {
    holder[key] = original
  })
}
afterEach(() => {
  while (restores.length) restores.pop()!()
})

const at = new Date('2026-11-10T04:30:00Z')
const city = (id: string, name: string, lat: number, lng: number, reachKm: number, customersSee: boolean) => ({
  id, name, lat, lng, reachKm, customersSee, createdAt: at, updatedAt: at,
})
const CHENNAI = city('c-chennai', 'Chennai', 13.0827, 80.2707, 50, true)
const TIRUPUR = city('c-tirupur', 'Tirupur', 11.1085, 77.3411, 25, false)

// `cityId` is what the database stores (0069's trigger, by cityOfGarage's
// rule); the first test below checks each one is what the rule says.
const live = { status: 'active', isVerified: true, bookingsPausedAt: null, deletedAt: null, showWhenCityOff: false }
const GARAGES = [
  // Chennai, live.
  { ...live, id: 'g1', lat: 13.0067, lng: 80.2573, city: 'Chennai', cityId: 'c-chennai' },
  // Chennai, pending.
  { ...live, id: 'g2', lat: 13.05, lng: 80.25, city: 'Chennai', cityId: 'c-chennai', status: 'pending' },
  // Tirupur is off: one hidden, one shown anyway.
  { ...live, id: 'g3', lat: 11.12, lng: 77.35, city: 'Tirupur', cityId: 'c-tirupur' },
  { ...live, id: 'g4', lat: 11.1, lng: 77.34, city: 'Tirupur', cityId: 'c-tirupur', showWhenCityOff: true },
  // No pin, says Madras: Chennai.
  { ...live, id: 'g5', lat: null, lng: null, city: 'Madras', cityId: 'c-chennai' },
  // Sivakasi: Other towns.
  { ...live, id: 'g6', lat: 9.4533, lng: 77.8024, city: 'Sivakasi', cityId: null },
]

function standIn(otherTowns: unknown = undefined) {
  patch(citiesRepository, 'listCities', async () => [CHENNAI, TIRUPUR])
  patch(citiesRepository, 'otherTownsValue', async () => otherTowns)
  patch(citiesRepository, 'listGarageFacts', async () => GARAGES)
  patch(areaSignupsService, 'launchSoon', () => undefined)
}

describe('the Cities page', () => {
  test("the stand-in garages' stored city is cityOfGarage's choice", () => {
    for (const garage of GARAGES) {
      expect(cityOfGarage(garage, [CHENNAI, TIRUPUR])?.id ?? null).toBe(garage.cityId)
    }
  })

  test('each city with its garages, live and hidden-if-off, and Other towns', async () => {
    standIn()
    const overview = await citiesService.overview()
    expect(overview.cities.map(({ name, garagesLive, garagesTotal, garagesHiddenWhenOff }) => ({
      name, garagesLive, garagesTotal, garagesHiddenWhenOff,
    }))).toEqual([
      { name: 'Chennai', garagesLive: 2, garagesTotal: 3, garagesHiddenWhenOff: 2 },
      // Off: only the one shown anyway is live, and it would stay so.
      { name: 'Tirupur', garagesLive: 1, garagesTotal: 2, garagesHiddenWhenOff: 0 },
    ])
    expect(overview.otherTowns).toEqual({
      label: 'Other towns', visible: true, garagesLive: 1, garagesTotal: 1, garagesHiddenWhenOff: 1,
    })
  })

  test('Other towns off hides the garage in no city, and says so', async () => {
    standIn({ visible: false })
    const overview = await citiesService.overview()
    expect(overview.otherTowns).toMatchObject({ visible: false, garagesLive: 0, garagesTotal: 1 })
  })

  test('a second city of the same name, in any case, or Madras beside Chennai, is refused', async () => {
    standIn()
    patch(citiesRepository, 'listOtherCityNames', async () => [{ id: CHENNAI.id, name: 'Chennai' }])
    for (const name of ['chennai ', 'Madras']) {
      const refusal = await citiesService
        .createCity({ name, lat: 13, lng: 80, reachKm: 50, customersSee: true, actorName: 'E2E Admin' }, { sub: 'admin', name: 'E2E Admin' })
        .catch((error: unknown) => error)
      expect(refusal).toBeInstanceOf(AppError)
      expect((refusal as InstanceType<typeof AppError>).code).toBe('CITY_NAME_TAKEN')
    }
  })
})

describe('the live rule other screens read', () => {
  test("rules() names the garage's stored city and why it hides the garage", async () => {
    standIn()
    const rules = await citiesService.rules()
    expect(rules.standingOf({ cityId: 'c-tirupur', showWhenCityOff: false })).toEqual({
      city: { id: 'c-tirupur', name: 'Tirupur' },
      cityShown: false,
      hiddenReason: 'Its city, Tirupur, is off for customers',
    })
    expect(rules.standingOf({ cityId: 'c-chennai', showWhenCityOff: false }).city?.name).toBe('Chennai')
    // Other towns, shown (never set); and a stored id no longer in the list reads as Other towns.
    expect(rules.standingOf({ cityId: null, showWhenCityOff: false })).toEqual({ city: null, cityShown: true, hiddenReason: null })
    expect(rules.standingOf({ cityId: 'c-gone', showWhenCityOff: false }).city).toBeNull()
  })
})
