import { describe, expect, test } from 'bun:test'
import { addGarageHref, cityDraftProblem, EMPTY_CITY_DRAFT, liveLine, offConfirmBody } from './cities'

describe('the Cities page', () => {
  test('"N of M garages live", one garage, or none yet', () => {
    expect(liveLine({ garagesLive: 3, garagesTotal: 5 })).toBe('3 of 5 garages live')
    expect(liveLine({ garagesLive: 1, garagesTotal: 1 })).toBe('1 of 1 garage live')
    expect(liveLine({ garagesLive: 0, garagesTotal: 0 })).toBe('No garages yet')
  })

  test('the confirm before switching off names how many garages go and that bookings carry on', () => {
    expect(offConfirmBody('Tirupur', 3)).toBe("Customers won't see 3 garages in Tirupur. Bookings already made carry on.")
    expect(offConfirmBody('Tirupur', 1)).toBe("Customers won't see 1 garage in Tirupur. Bookings already made carry on.")
    expect(offConfirmBody('Other towns', 0)).toContain('nothing changes for them yet')
  })

  test('a city needs a name, a centre and a reach of 1 to 300 whole km', () => {
    const draft = { ...EMPTY_CITY_DRAFT, name: 'Tirupur', lat: 11.1, lng: 77.3 }
    expect(cityDraftProblem(draft)).toBeNull()
    expect(cityDraftProblem({ ...draft, name: ' T ' })).toContain('at least 2 letters')
    expect(cityDraftProblem({ ...draft, lat: null })).toContain('centre')
    for (const reachKm of ['0', '301', '12.5', 'ten', '']) {
      expect(cityDraftProblem({ ...draft, reachKm })).toContain('1 to 300')
    }
    expect(cityDraftProblem({ ...draft, reachKm: '300' })).toBeNull()
  })

  test('"Add a garage here" opens Add garage with the city chosen', () => {
    expect(addGarageHref('Tirupur')).toBe('/vendors/new?city=Tirupur')
    expect(addGarageHref('Navi Mumbai')).toBe('/vendors/new?city=Navi%20Mumbai')
  })
})
