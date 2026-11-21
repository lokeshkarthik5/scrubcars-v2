import { describe, expect, test } from 'bun:test'
import { AppError } from './errors.js'
import { photoOrderError, photoOrderProblem } from './photo-order.js'

const A = 'e2e00000-0000-4000-8000-000000008020'
const B = 'e2e00000-0000-4000-8000-000000008021'
const C = 'e2e00000-0000-4000-8000-000000008022'
const FOREIGN = 'e2e00000-0000-4000-8000-000000008029'

describe('photoOrderProblem', () => {
  test('any order of exactly the garage photos is fine', () => {
    expect(photoOrderProblem([A, B, C], [C, A, B])).toBeNull()
    expect(photoOrderProblem([A, B, C], [A, B, C])).toBeNull()
    expect(photoOrderProblem([A], [A])).toBeNull()
  })

  test('a photo twice is the request’s own mistake', () => {
    expect(photoOrderProblem([A, B, C], [A, A, B])).toBe('PHOTO_ORDER_DUPLICATE')
    expect(photoOrderProblem([A, B], [A, B, B])).toBe('PHOTO_ORDER_DUPLICATE')
  })

  test('a missing, extra or another garage’s photo means the screen is behind', () => {
    expect(photoOrderProblem([A, B, C], [A, B])).toBe('PHOTO_ORDER_STALE')
    expect(photoOrderProblem([A, B], [A, B, C])).toBe('PHOTO_ORDER_STALE')
    expect(photoOrderProblem([A, B, C], [A, B, FOREIGN])).toBe('PHOTO_ORDER_STALE')
    expect(photoOrderProblem([], [A])).toBe('PHOTO_ORDER_STALE')
  })

  test('each problem has its status and code', () => {
    const duplicate = photoOrderError('PHOTO_ORDER_DUPLICATE')
    expect(duplicate).toBeInstanceOf(AppError)
    expect(duplicate.statusCode).toBe(400)
    expect(duplicate.code).toBe('PHOTO_ORDER_DUPLICATE')
    const stale = photoOrderError('PHOTO_ORDER_STALE')
    expect(stale.statusCode).toBe(409)
    expect(stale.code).toBe('PHOTO_ORDER_STALE')
    expect(stale.message).toContain('Reload')
  })
})
