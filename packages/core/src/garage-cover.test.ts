import { describe, expect, test } from 'bun:test'
import {
  COVER_TONES,
  coverMetaParts,
  coverToneFor,
  garageInitials,
} from './garage-cover'

describe('garageInitials', () => {
  test('the first letters of the first two words', () => {
    expect(garageInitials('Glossy Doorstep')).toBe('GD')
    expect(garageInitials('Elite Shine Car Care')).toBe('ES')
  })

  test('a dot splits a name like "A.J"', () => {
    expect(garageInitials('A.J Auto Garage')).toBe('AJ')
    expect(garageInitials('S.K. Car Wash')).toBe('SK')
  })

  test('a one-word name gives its first two letters', () => {
    expect(garageInitials('Shine')).toBe('SH')
    expect(garageInitials('X')).toBe('X')
  })

  test('little words are skipped while there are others', () => {
    expect(garageInitials('Point to Point Doorstep')).toBe('PP')
    expect(garageInitials('Wash n Shine')).toBe('WS')
    expect(garageInitials('The Car Spa')).toBe('CS')
    expect(garageInitials('The End')).toBe('EN')
    expect(garageInitials('Of The')).toBe('OT')
  })

  test('punctuation and emoji are ignored', () => {
    expect(garageInitials('✨ Sparkle & Co. 🚗')).toBe('SC')
    expect(garageInitials("Raj's Car Spa")).toBe('RC')
    expect(garageInitials('  --  glossy   doorstep  ')).toBe('GD')
  })

  test('uppercase, digits kept', () => {
    expect(garageInitials('glossy doorstep')).toBe('GD')
    expect(garageInitials('3M Car Care')).toBe('3C')
  })

  test('a name with no letters gives nothing', () => {
    expect(garageInitials('')).toBe('')
    expect(garageInitials('🚗 — !')).toBe('')
  })

  test('other scripts keep their first letter', () => {
    expect(garageInitials('ராஜா கார் வாஷ்')).toBe('ரக')
  })
})

describe('coverToneFor', () => {
  test('the same garage always gets the same colour', () => {
    const id = 'e2e00000-0000-4000-8000-000000004550'
    const tone = coverToneFor(id)
    for (let i = 0; i < 10; i++) expect(coverToneFor(id)).toBe(tone)
    expect(COVER_TONES).toContain(tone)
  })

  test('is pinned, so a deploy never repaints every garage', () => {
    // FNV-1a 32-bit of "a" is 0xe40c292c = 3826002220; % 5 = 0 → red.
    expect(coverToneFor('a')).toBe('red')
    expect(coverToneFor('')).toBe(COVER_TONES[0x811c9dc5 % 5])
  })

  test('every one of the five colours is reached over many garages', () => {
    const seen = new Map<string, number>()
    for (let i = 0; i < 500; i++) {
      const id = `e2e00000-0000-4000-8000-${String(i).padStart(12, '0')}`
      const tone = coverToneFor(id)
      seen.set(tone, (seen.get(tone) ?? 0) + 1)
    }
    expect([...seen.keys()].sort()).toEqual([...COVER_TONES].sort())
    // Spread out, not 496 reds and one of each of the rest.
    for (const count of seen.values()) expect(count).toBeGreaterThan(50)
  })
})

describe('coverMetaParts', () => {
  const base = {
    area: 'Chennai',
    lat: null,
    lng: null,
    outsideServiceCity: null,
    dropinEnabled: false,
    doorstepEnabled: true,
    pickupEnabled: false,
  }

  test('the neighbourhood its pin is near, then how it is booked', () => {
    expect(coverMetaParts({ ...base, lat: 13.085, lng: 80.2101 })).toEqual([
      'Anna Nagar',
      'Doorstep',
    ])
  })

  test('no pin: its city; no city: the service city', () => {
    expect(coverMetaParts(base)).toEqual(['Chennai', 'Doorstep'])
    expect(coverMetaParts({ ...base, area: '' })).toEqual([
      'Chennai',
      'Doorstep',
    ])
  })

  test('outside the city: its own town, even when pinned', () => {
    expect(
      coverMetaParts({
        ...base,
        area: 'Sivakasi',
        lat: 9.45,
        lng: 77.8,
        outsideServiceCity: { town: 'Sivakasi', km: 485 },
      })
    ).toEqual(['Sivakasi', 'Doorstep'])
  })

  test('every mode it offers, in switch order', () => {
    expect(
      coverMetaParts({ ...base, dropinEnabled: true, pickupEnabled: true })
    ).toEqual(['Chennai', 'At garage', 'Doorstep', 'Pickup & drop'])
  })
})
