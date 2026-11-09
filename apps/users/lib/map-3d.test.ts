import { describe, expect, test } from 'bun:test'
import {
  ARC_STEPS,
  PEEK_PLANE_PX,
  arcLift,
  groundCurve,
  pathThrough,
  peekTilt,
  peekZoom,
  planePoint,
  tiltProject,
} from './map-3d'

// Adyar, and garages around it.
const ADYAR = { lat: 13.0012, lng: 80.2565 }
const NEAR = { lat: 13.0102, lng: 80.2465 }
const MID = { lat: 13.0402, lng: 80.2565 }
const FAR = { lat: 13.0827, lng: 80.2707 }

describe('the map peek', () => {
  test('zooms out until every garage is on the plane, within the city range', () => {
    const close = peekZoom(ADYAR, [NEAR])
    const wide = peekZoom(ADYAR, [NEAR, MID])
    expect(close).toBeGreaterThan(wide)
    expect(close).toBeLessThanOrEqual(15)
    // At the zoom chosen, the farther garage is inside the plane's middle.
    const p = planePoint(MID, ADYAR, wide, { x: 0, y: 0 })
    expect(Math.abs(p.y)).toBeLessThanOrEqual(PEEK_PLANE_PX * 0.36)
    // A garage across the city: no further out than the city view.
    expect(peekZoom(ADYAR, [FAR])).toBe(11)
  })

  test('with no garages it stays at street level', () => {
    expect(peekZoom(ADYAR, [])).toBe(15)
  })

  test('the customer is the anchor; north is up and east is right', () => {
    const anchor = { x: 262, y: 318 }
    expect(planePoint(ADYAR, ADYAR, 13, anchor)).toEqual(anchor)
    const north = planePoint({ lat: ADYAR.lat + 0.01, lng: ADYAR.lng }, ADYAR, 13, anchor)
    const east = planePoint({ lat: ADYAR.lat, lng: ADYAR.lng + 0.01 }, ADYAR, 13, anchor)
    expect(north.y).toBeLessThan(anchor.y)
    expect(east.x).toBeGreaterThan(anchor.x)
  })

  test('flat, a point lands where it was; tilted, far points shrink towards the eye and near ones grow', () => {
    const origin = { x: 180, y: 72 }
    const eye = { x: 180, y: 40 }
    expect(tiltProject({ x: 30, y: 50 }, origin, 0, 620, eye)).toEqual({ x: 210, y: 122 })
    const far = tiltProject({ x: 100, y: -100 }, origin, 52, 620, eye)
    const near = tiltProject({ x: 100, y: 100 }, origin, 52, 620, eye)
    // Behind the origin: pulled in towards the eye. In front: pushed out.
    expect(far.x - eye.x).toBeLessThan(100)
    expect(near.x - eye.x).toBeGreaterThan(100)
    // Foreshortened: 100 px of ground covers less than 100 px of screen.
    expect(Math.abs(far.y - origin.y)).toBeLessThan(100)
  })

  test('the tilt opens to 52° and leans a little further, at most 14°, as the list scrolls', () => {
    expect(peekTilt(0, 0)).toBe(0)
    expect(peekTilt(1, 0)).toBe(52)
    expect(peekTilt(1, 100)).toBeCloseTo(58)
    expect(peekTilt(1, 5000)).toBe(66)
  })
})

describe('the route arc', () => {
  test('starts at the customer, ends at the garage, and bends to one side', () => {
    const curve = groundCurve(ADYAR, FAR)
    expect(curve).toHaveLength(ARC_STEPS + 1)
    expect(curve[0]).toEqual(ADYAR)
    expect(curve[ARC_STEPS].lat).toBeCloseTo(FAR.lat, 10)
    expect(curve[ARC_STEPS].lng).toBeCloseTo(FAR.lng, 10)
    // The middle is off the straight line between them.
    const mid = curve[ARC_STEPS / 2]
    const straight = { lat: (ADYAR.lat + FAR.lat) / 2, lng: (ADYAR.lng + FAR.lng) / 2 }
    expect(Math.hypot(mid.lat - straight.lat, mid.lng - straight.lng)).toBeGreaterThan(0.001)
  })

  test('lifts most in the middle and not at all at the ends; more on a pitched map', () => {
    const ground = Array.from({ length: ARC_STEPS + 1 }, (_, i) => ({ x: i * 5, y: 400 }))
    const lift = arcLift(ground, 50)
    expect(lift[0]).toBe(0)
    expect(lift[ARC_STEPS]).toBeCloseTo(0, 10)
    expect(Math.max(...lift)).toBe(lift[ARC_STEPS / 2])
    expect(Math.max(...arcLift(ground, 0))).toBeLessThan(Math.max(...lift))
  })

  test('a long route on screen is capped, so the arc stays in view', () => {
    const ground = [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 10000, y: 0 }]
    expect(Math.max(...arcLift(ground, 90))).toBeLessThanOrEqual(160)
  })

  test('a path through the points', () => {
    expect(pathThrough([{ x: 1, y: 2 }, { x: 3.14159, y: 4 }])).toBe('M1.0 2.0L3.1 4.0')
  })
})
