import { describe, expect, test } from 'bun:test'
import { safeNextPath } from '@repo/core/redirect'
import { saveGarageReturnPath, withoutSaveFlag } from './saved-garages'

const GARAGE = 'e2e00000-0000-4000-8000-000000000301'

describe('saving a garage after signing in', () => {
  test('sign-in comes back to the same garage, asking for the save', () => {
    const next = saveGarageReturnPath(GARAGE)
    expect(next).toBe(`/garage/${GARAGE}?save=1`)
    // Survives the login page's own check on `next`.
    expect(safeNextPath(next)).toBe(next)
  })

  test('the flag comes out of the URL once saved; the rest stays', () => {
    expect(withoutSaveFlag(`/garage/${GARAGE}`, '?save=1')).toBe(`/garage/${GARAGE}`)
    expect(withoutSaveFlag(`/garage/${GARAGE}`, '?mode=doorstep&save=1&code=DIWALI')).toBe(
      `/garage/${GARAGE}?mode=doorstep&code=DIWALI`
    )
  })
})
