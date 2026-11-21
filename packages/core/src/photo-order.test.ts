import { describe, expect, test } from 'bun:test'
import { movedPhotos, photoMoves, withOrderOf } from './photo-order'

const photos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
const ids = (list: Array<{ id: string }> | null) => list?.map((p) => p.id) ?? null

describe('movedPhotos', () => {
  test('Make cover takes a photo to the front and keeps the rest in order', () => {
    expect(ids(movedPhotos(photos, 'c', 'cover'))).toEqual(['c', 'a', 'b', 'd'])
    expect(ids(movedPhotos(photos, 'd', 'cover'))).toEqual(['d', 'a', 'b', 'c'])
  })

  test('the arrows swap with the neighbour', () => {
    expect(ids(movedPhotos(photos, 'b', 'left'))).toEqual(['b', 'a', 'c', 'd'])
    expect(ids(movedPhotos(photos, 'b', 'right'))).toEqual(['a', 'c', 'b', 'd'])
  })

  test('nothing to do at the ends, for the cover, or for an unknown id', () => {
    expect(movedPhotos(photos, 'a', 'cover')).toBeNull()
    expect(movedPhotos(photos, 'a', 'left')).toBeNull()
    expect(movedPhotos(photos, 'd', 'right')).toBeNull()
    expect(movedPhotos(photos, 'z', 'cover')).toBeNull()
    expect(movedPhotos([], 'a', 'right')).toBeNull()
  })

  test('never changes the list it was given', () => {
    const before = photos.map((p) => p.id)
    movedPhotos(photos, 'c', 'cover')
    expect(photos.map((p) => p.id)).toEqual(before)
  })
})

describe('photoMoves', () => {
  test('the first is the cover and has no left; the last has no right', () => {
    expect(photoMoves(0, 3)).toEqual({ isCover: true, cover: false, left: false, right: true })
    expect(photoMoves(1, 3)).toEqual({ isCover: false, cover: true, left: true, right: true })
    expect(photoMoves(2, 3)).toEqual({ isCover: false, cover: true, left: true, right: false })
    expect(photoMoves(0, 1)).toEqual({ isCover: true, cover: false, left: false, right: false })
  })
})

describe('withOrderOf', () => {
  test('puts an order back', () => {
    const moved = movedPhotos(photos, 'c', 'cover')!
    expect(ids(withOrderOf(moved, ['a', 'b', 'c', 'd']))).toEqual(['a', 'b', 'c', 'd'])
  })

  test('keeps a photo added meanwhile at the end and drops one deleted meanwhile', () => {
    const now = [{ id: 'c' }, { id: 'a' }, { id: 'd' }, { id: 'e' }]
    expect(ids(withOrderOf(now, ['a', 'b', 'c', 'd']))).toEqual(['a', 'c', 'd', 'e'])
  })
})
