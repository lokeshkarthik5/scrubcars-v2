import { describe, expect, test } from 'bun:test'
import {
  PIN_MAX_WIDTH_PX,
  PIN_OVERLAP_PX,
  PIN_SELECTED_SCALE,
  bubbleTap,
  fitPadding,
  frameCentreOffset,
  framingBounds,
  groupPins,
  isInFrame,
  nextInBubble,
  pinLabel,
  worldPixel,
} from './map-view'

// Chennai Central, and points a known distance from it.
const CENTRAL = { lat: 13.0827, lng: 80.2707 }

describe('pinLabel', () => {
  test('a short name is kept whole', () => {
    expect(pinLabel('Shine Garage')).toBe('Shine Garage')
    expect(pinLabel('  Marina   Auto ')).toBe('Marina Auto')
  })

  test('a long one is cut to 14 characters with an ellipsis', () => {
    expect(pinLabel('Sri Murugan Car Wash')).toBe('Sri Murugan C…')
    expect(pinLabel('Sri Murugan Car Wash')).toHaveLength(14)
    // No space left dangling before the ellipsis.
    expect(pinLabel('Sri Car Wash Centre')).toBe('Sri Car Wash…')
  })
})

describe('framingBounds', () => {
  test('nothing to frame is null', () => {
    expect(framingBounds([], 5)).toBeNull()
  })

  test('frames the customer and every garage', () => {
    const far = { lat: 13.3, lng: 80.05 }
    const box = framingBounds([CENTRAL, far], 3)!
    expect(box.minLat).toBeCloseTo(13.0827)
    expect(box.maxLat).toBeCloseTo(13.3)
    expect(box.minLng).toBeCloseTo(80.05)
    expect(box.maxLng).toBeCloseTo(80.2707)
  })

  test('one point is widened to the minimum span, centred on it', () => {
    const box = framingBounds([CENTRAL], 12)!
    expect((box.maxLat - box.minLat) * 111.32).toBeCloseTo(12)
    expect((box.minLat + box.maxLat) / 2).toBeCloseTo(CENTRAL.lat)
    expect((box.minLng + box.maxLng) / 2).toBeCloseTo(CENTRAL.lng)
    // A degree of longitude is shorter at 13°N, so it takes more of them.
    expect(box.maxLng - box.minLng).toBeGreaterThan(box.maxLat - box.minLat)
  })
})

describe('fitPadding', () => {
  test('keeps pins clear of the controls on top and the cards below', () => {
    expect(fitPadding({ width: 390, height: 844 }, { top: 72, bottom: 260 })).toEqual({
      top: 128,
      bottom: 284,
      left: 73,
      right: 73,
    })
  })

  test('leaves half the widest pin at each side, chosen pin included', () => {
    // A pin is centred on its spot, so the outermost garage's pin reaches
    // this far past it; with less, its name ran off the screen edge.
    const half = (PIN_MAX_WIDTH_PX * PIN_SELECTED_SCALE) / 2
    for (const width of [375, 390, 428]) {
      const padding = fitPadding({ width, height: 844 }, { top: 72, bottom: 250 })
      expect(padding.left).toBeGreaterThanOrEqual(half)
      expect(padding.right).toBeGreaterThanOrEqual(half)
    }
  })

  test('on a short screen both shrink rather than leave nothing to fit into', () => {
    const padding = fitPadding({ width: 390, height: 420 }, { top: 72, bottom: 260 })
    expect(padding.top + padding.bottom).toBeLessThanOrEqual(420 - 120)
    expect(padding.top).toBeGreaterThan(0)
    expect(padding.bottom).toBeGreaterThan(padding.top)
  })

  test('a very narrow map drops the side padding', () => {
    expect(fitPadding({ width: 120, height: 800 }, { top: 0, bottom: 0 }).left).toBe(0)
  })
})

describe('worldPixel', () => {
  test('doubles with each zoom level', () => {
    const z10 = worldPixel(CENTRAL, 10)
    const z11 = worldPixel(CENTRAL, 11)
    expect(z11.x).toBeCloseTo(z10.x * 2)
    expect(z11.y).toBeCloseTo(z10.y * 2)
  })

  test('the equator and the antimeridian land where Web Mercator puts them', () => {
    expect(worldPixel({ lat: 0, lng: -180 }, 0)).toEqual({ x: 0, y: 256 })
    expect(worldPixel({ lat: 0, lng: 0 }, 0)).toEqual({ x: 256, y: 256 })
  })
})

describe('groupPins', () => {
  // About 200 m apart, east-west.
  const a = { id: 'a', lat: 13.0827, lng: 80.2707 }
  const b = { id: 'b', lat: 13.0827, lng: 80.2725 }
  // About 11 km north.
  const c = { id: 'c', lat: 13.1827, lng: 80.2707 }

  test('pins that would overlap at a city view become one count', () => {
    const groups = groupPins([a, b, c], 11)
    expect(groups.map((g) => g.members.map((m) => m.id))).toEqual([['a', 'b'], ['c']])
    expect(groups[0].key).toBe('a|b')
    expect(groups[0].lng).toBeCloseTo((a.lng + b.lng) / 2)
  })

  test('zoomed in far enough, every pin stands alone', () => {
    expect(groupPins([a, b, c], 16).every((g) => g.members.length === 1)).toBe(true)
  })

  test('zoomed far out, everything nearby is one count', () => {
    const groups = groupPins([a, b, c], 6)
    expect(groups).toHaveLength(1)
    expect(groups[0].members).toHaveLength(3)
  })

  test('keeps the order it was given, so the nearest garage leads its group', () => {
    expect(groupPins([b, a], 11)[0].members.map((m) => m.id)).toEqual(['b', 'a'])
  })

  test('two pins one pin-width apart are grouped: names never print over each other', () => {
    // The overlap test is the widest pin, not a typical one.
    expect(PIN_OVERLAP_PX.x).toBeGreaterThanOrEqual(PIN_MAX_WIDTH_PX)
    // a and b are ~168 px apart at zoom 16 and ~126 px at 15.6: a 132 px pin
    // would still overlap its neighbour there, so they share a bubble.
    expect(groupPins([a, b], 15.6)).toHaveLength(1)
    expect(groupPins([a, b], 16)).toHaveLength(2)
  })

  test('panning cannot regroup: only the zoom is read', () => {
    expect(groupPins([a, b, c], 12.5)).toEqual(groupPins([a, b, c], 12.5))
    expect(groupPins([], 12)).toEqual([])
  })
})

describe('bubbleTap', () => {
  // About 30 m apart: the same street, or one complex.
  const near1 = { id: 'n1', lat: 13.0827, lng: 80.2707 }
  const near2 = { id: 'n2', lat: 13.0827, lng: 80.27098 }
  // About 1 km apart.
  const far1 = { id: 'f1', lat: 13.0827, lng: 80.2707 }
  const far2 = { id: 'f2', lat: 13.0827, lng: 80.2799 }

  test('garages 30 m apart are still one bubble at the closest a fit reaches', () => {
    expect(groupPins([near1, near2], 16.3)).toHaveLength(1)
    expect(groupPins([near1, near2], 17)).toHaveLength(1)
  })

  test('a bubble that zooming will split just zooms in', () => {
    expect(bubbleTap([far1, far2], 12, 15.5)).toEqual({ zoomTo: 15.5, select: false })
  })

  test('a bubble that zooming cannot split zooms in and brings a card up', () => {
    expect(bubbleTap([near1, near2], 12, 16.3)).toEqual({ zoomTo: 16.3, select: true })
  })

  test('already as close as the fit gets, a tap chooses instead of doing nothing', () => {
    // A phone 375 px wide: the fit lands at 16.27, where the camera already is.
    expect(bubbleTap([near1, near2], 16.27, 16.27)).toEqual({ zoomTo: null, select: true })
    expect(bubbleTap([near1, near2], 16.27, 16.3)).toEqual({ zoomTo: null, select: true })
    expect(bubbleTap([near1, near2], 16.27, undefined)).toEqual({ zoomTo: null, select: true })
  })
})

describe('nextInBubble', () => {
  const order = ['a', 'b', 'c', 'd']
  const pick = (ids: string[], selected: string | null) =>
    nextInBubble(
      ids.map((id) => ({ id })),
      order,
      selected
    ).id

  test('with nothing chosen, the nearest garage in the bubble', () => {
    expect(pick(['b', 'c'], null)).toBe('b')
  })

  test('repeat taps go round every garage, not back and forth between two', () => {
    // The chosen garage leaves its bubble, so each tap sees the other members.
    expect(pick(['b', 'c'], 'a')).toBe('b')
    expect(pick(['a', 'c'], 'b')).toBe('c')
    expect(pick(['a', 'b'], 'c')).toBe('a')
  })
})

describe('isInFrame', () => {
  const view = { width: 390, height: 844 }
  const padding = { top: 128, bottom: 284, left: 73, right: 73 }

  test('a pin in the clear part of the map is in frame', () => {
    expect(isInFrame({ x: 195, y: 400 }, view, padding)).toBe(true)
  })

  test('off screen, under the cards or under the controls is not', () => {
    expect(isInFrame({ x: -40, y: 400 }, view, padding)).toBe(false)
    expect(isInFrame({ x: 195, y: 700 }, view, padding)).toBe(false)
    expect(isInFrame({ x: 195, y: 60 }, view, padding)).toBe(false)
    expect(isInFrame({ x: 380, y: 400 }, view, padding)).toBe(false)
  })
})

describe('frameCentreOffset', () => {
  test('points at the middle of the clear part: up, since the cards are taller than the controls', () => {
    expect(frameCentreOffset({ top: 128, bottom: 284, left: 73, right: 73 })).toEqual([0, -78])
  })
})
