/**
 * Other towns (0069): garages in no city are shown unless admin switches
 * Other towns off. CITIES.far is pinned in no city: off, it leaves the list
 * and its page is not-found; on again, it is back.
 *
 * Other towns is team-wide, and many fixtures are in no city (the REACH_*
 * garages, the add-on garages, CITIES.far and hill), so while it is off any
 * spec listing or booking one of them would fail. `workers: 1` on a project
 * does not stop the other projects running beside it, so this lives in the
 * `alone` project: left out of the main run and run by itself afterwards
 * (`bun run test:e2e:alone`, its own step in e2e.yml). It still keeps the
 * switch off only for the two reads it needs and turns it back on in
 * `finally`, for anyone running it locally against a reused database.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { CITIES } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const C = CITIES
const OTHER_TOWNS = `${API}/api/v1/admin/cities/other-towns`

test.describe('Other towns @p0', () => {
  test('switched off, a garage in no city is hidden; on again, it is back', async ({ page, request }) => {
    expect((await request.get(`${API}/api/v1/vendors/${C.far.id}`)).status()).toBe(200)
    try {
      const off = await page.request.patch(OTHER_TOWNS, { data: { visible: false } })
      expect(off.status()).toBe(200)
      expect((await off.json()).data.otherTowns).toMatchObject({ label: 'Other towns', visible: false })

      const page404 = await request.get(`${API}/api/v1/vendors/${C.far.id}`)
      expect(page404.status()).toBe(404)
      const list = await request.get(`${API}/api/v1/vendors`, { params: { q: C.far.name, limit: '50' } })
      expect(((await list.json()).data.items as Array<{ id: string }>).map((item) => item.id)).not.toContain(C.far.id)
    } finally {
      const on = await page.request.patch(OTHER_TOWNS, { data: { visible: true } })
      expect(on.status()).toBe(200)
    }
    expect((await request.get(`${API}/api/v1/vendors/${C.far.id}`)).status()).toBe(200)
  })
})
