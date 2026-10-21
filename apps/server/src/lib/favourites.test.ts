import { describe, expect, test } from 'bun:test'
import { favouriteSaveRefusal, MAX_FAVOURITES } from './favourites.js'

describe('favouriteSaveRefusal', () => {
  test('room for one more, up to the cap', () => {
    expect(favouriteSaveRefusal({ alreadySaved: false, count: 0 })).toBeNull()
    expect(favouriteSaveRefusal({ alreadySaved: false, count: MAX_FAVOURITES - 1 })).toBeNull()
  })

  test('the 51st is refused', () => {
    expect(MAX_FAVOURITES).toBe(50)
    expect(favouriteSaveRefusal({ alreadySaved: false, count: MAX_FAVOURITES })).toBe('limit')
  })

  test('saving one already saved is fine, even at the cap: PUT is idempotent', () => {
    expect(favouriteSaveRefusal({ alreadySaved: true, count: MAX_FAVOURITES })).toBeNull()
    expect(favouriteSaveRefusal({ alreadySaved: true, count: MAX_FAVOURITES + 3 })).toBeNull()
  })
})
