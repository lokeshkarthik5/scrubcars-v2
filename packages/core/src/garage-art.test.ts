import { describe, expect, test } from 'bun:test'
import { carShape, garageCarDataUrl, garageCarSvg, type ArtRarity } from './garage-art'

const RARITIES: ArtRarity[] = [
  ...Array<ArtRarity>(20).fill('common'),
  ...Array<ArtRarity>(12).fill('rare'),
  ...Array<ArtRarity>(6).fill('epic'),
  ...Array<ArtRarity>(2).fill('legendary'),
]

describe('the drawn cars', () => {
  test('the same card always draws the same car', () => {
    const a = garageCarSvg({ number: 7, paint: '#0F7A78', tone: 'dark', rarity: 'rare' })
    expect(garageCarSvg({ number: 7, paint: '#0F7A78', tone: 'dark', rarity: 'rare' })).toBe(a)
    expect(garageCarSvg({ number: 8, paint: '#0F7A78', tone: 'dark', rarity: 'rare' })).not.toBe(a)
  })

  test('40 cards, 40 different shapes, the series and number decide it', () => {
    const shapes = RARITIES.map((rarity, i) => JSON.stringify(carShape({ number: i + 1, rarity })))
    expect(new Set(shapes).size).toBe(40)
    expect(JSON.stringify(carShape({ number: 1, series: 2, rarity: 'common' }))).not.toBe(shapes[0])
  })

  test('no letters anywhere: no text, no badge, no plate in the picture', () => {
    for (const [i, rarity] of RARITIES.entries()) {
      for (const silhouette of [false, true]) {
        const svg = garageCarSvg({ number: i + 1, paint: '#B07A2A', tone: i % 2 ? 'dark' : 'light', rarity }, { silhouette })
        expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg"')
        expect(svg).not.toMatch(/<text|<image|href=|NaN|undefined/)
      }
    }
  })

  test('a silhouette carries no paint', () => {
    expect(garageCarSvg({ number: 3, paint: '#F29A1F', tone: 'dark', rarity: 'rare' }, { silhouette: true })).not.toContain('F29A1F')
  })

  test('a bad paint falls back to grey rather than breaking the picture', () => {
    expect(garageCarSvg({ number: 3, paint: 'teal', tone: 'dark', rarity: 'rare' })).toContain('svg')
    expect(garageCarDataUrl({ number: 3, paint: '#123456', tone: 'light', rarity: 'common' })).toStartWith('data:image/svg+xml;charset=utf-8,')
  })

  test('legendary cars wear gold or bronze wheels', () => {
    for (const n of [20, 40]) expect(['gold', 'bronze']).toContain(carShape({ number: n, rarity: 'legendary' }).rimFinish)
  })
})
