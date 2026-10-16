import { describe, expect, test } from 'bun:test'
import {
  cardThumbnail,
  defaultAiSubject,
  formatClipLength,
  isClipTooLong,
  sampleArtFor,
} from './service-media'
import type { ServiceMedia } from './types'

const photo = (overrides: Partial<ServiceMedia> = {}): ServiceMedia => ({
  id: 'p1',
  kind: 'image',
  url: 'https://cdn.example/p1.jpg',
  posterUrl: null,
  durationSecs: null,
  source: 'upload',
  ...overrides,
})

const video: ServiceMedia = {
  id: 'v1',
  kind: 'video',
  url: 'https://customer-x.cloudflarestream.com/uid/manifest/video.m3u8',
  posterUrl: 'https://customer-x.cloudflarestream.com/uid/thumbnails/thumbnail.jpg?time=1s',
  durationSecs: 45,
  source: 'upload',
}

describe('cardThumbnail', () => {
  test("the video's poster first, with its length", () => {
    expect(cardThumbnail([photo(), video])).toEqual({
      kind: 'video',
      url: video.posterUrl as string,
      durationSecs: 45,
      sample: false,
    })
  })

  test('else the first photo, marked a sample when AI-made', () => {
    expect(cardThumbnail([photo()])).toEqual({ kind: 'photo', url: photo().url, sample: false })
    expect(cardThumbnail([photo({ source: 'ai' })])?.sample).toBe(true)
  })

  test('nothing when the service has no media: the card draws the sample', () => {
    expect(cardThumbnail([])).toBeNull()
  })
})

describe('sampleArtFor', () => {
  test('by category', () => {
    expect(sampleArtFor('car_wash', 'Full wash')).toBe('wash')
    expect(sampleArtFor('detailing', 'Interior detail')).toBe('detailing')
    expect(sampleArtFor('coating', 'Ceramic')).toBe('coating')
    expect(sampleArtFor('scratch_removal', 'Scratch fix')).toBe('scratch')
    expect(sampleArtFor('others', 'Battery check')).toBe('others')
  })

  test('a bike by its name, whatever the category', () => {
    expect(sampleArtFor('others', 'Bike Wash')).toBe('bike')
    expect(sampleArtFor('car_wash', 'Two-wheeler foam wash')).toBe('bike')
  })

  test("a wash filed under others still gets the wash", () => {
    expect(sampleArtFor('others', 'Quick wash')).toBe('wash')
  })
})

describe('clip length', () => {
  test('printed as m:ss', () => {
    expect(formatClipLength(45)).toBe('0:45')
    expect(formatClipLength(72)).toBe('1:12')
  })

  test('over 60 seconds is refused, rounding aside', () => {
    expect(isClipTooLong(60.4)).toBe(false)
    expect(isClipTooLong(61)).toBe(true)
  })
})

describe('defaultAiSubject', () => {
  test('only the service, never a person', () => {
    expect(defaultAiSubject('Full wash', 'car_wash', 'Car wash')).toBe(
      'Car wash: a clean dark-grey car after a full wash'
    )
    expect(defaultAiSubject('Bike Wash', 'others', 'Others')).toContain('motorbike')
  })
})
