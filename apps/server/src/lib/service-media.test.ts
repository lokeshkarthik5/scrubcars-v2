import { describe, expect, test } from 'bun:test'
import {
  ABANDONED_UPLOAD_MS,
  AI_PICTURE_STYLE,
  buildAiPicturePrompt,
  consentGiven,
  formatClipLength,
  hasRealMedia,
  isAiTempKeyFor,
  isServicePhotoKey,
  isStreamUid,
  photosCountingAgainstLimit,
  removedOnVideoStart,
  removedWhenVideoReady,
  signStreamWebhook,
  streamErrorMessage,
  streamUrls,
  toManagedMedia,
  toPublicMedia,
  uploadAbandoned,
  verifyStreamSignature,
  videoCountsOnStart,
  VIDEO_TOO_LONG_MESSAGE,
  videoUpdateFrom,
  type MediaRow,
} from './service-media.js'

const NOW = new Date('2026-10-16T10:00:00Z')
const NOW_SECS = Math.floor(NOW.getTime() / 1000)
const VENDOR = '11111111-1111-4111-8111-111111111111'
const SERVICE = '22222222-2222-4222-8222-222222222222'
const FILE = '33333333-3333-4333-8333-333333333333'
const UID = '0123456789abcdef0123456789abcdef'
const SECRET = 'whsec-test'

let next = 0
const row = (overrides: Partial<MediaRow> = {}): MediaRow => ({
  id: `row-${++next}`,
  kind: 'image',
  source: 'upload',
  url: `https://cdn.example/photo-${next}.jpg`,
  sortOrder: next,
  createdAt: NOW,
  consentConfirmedAt: NOW,
  uploadedBy: 'garage',
  videoUid: null,
  videoStatus: null,
  videoError: null,
  durationSecs: null,
  posterUrl: null,
  ...overrides,
})

const video = (status: MediaRow['videoStatus'], overrides: Partial<MediaRow> = {}) =>
  row({
    kind: 'video',
    url: 'https://customer-x.cloudflarestream.com/uid/manifest/video.m3u8',
    videoUid: UID,
    videoStatus: status,
    durationSecs: status === 'ready' ? 45 : null,
    posterUrl: status === 'ready' ? 'https://customer-x.cloudflarestream.com/uid/thumbnails/thumbnail.jpg?time=1s' : null,
    ...overrides,
  })

describe('toPublicMedia', () => {
  test('a customer sees photos and a ready video, video first', () => {
    const photo = row()
    const ready = video('ready')
    const media = toPublicMedia([photo, ready])
    expect(media.map((m) => m.kind)).toEqual(['video', 'image'])
    expect(media[0]).toEqual({
      id: ready.id,
      kind: 'video',
      url: ready.url,
      posterUrl: ready.posterUrl,
      durationSecs: 45,
      source: 'upload',
    })
  })

  test('a processing or failed video does not exist for a customer', () => {
    expect(toPublicMedia([video('processing'), video('error')])).toEqual([])
  })

  test('never carries who added it or the privacy tick', () => {
    const [media] = toPublicMedia([row({ uploadedBy: 'Super Sundar' })])
    expect(Object.keys(media).sort()).toEqual(
      ['durationSecs', 'id', 'kind', 'posterUrl', 'source', 'url'].sort()
    )
    expect(JSON.stringify(media)).not.toContain('Sundar')
  })

  test('an AI picture never reaches a customer', () => {
    expect(toPublicMedia([row({ source: 'ai' })])).toEqual([])
    const real = row()
    expect(toPublicMedia([row({ source: 'ai' }), real]).map((m) => m.id)).toEqual([real.id])
  })

  test('photos keep their order', () => {
    const a = row({ sortOrder: 2 })
    const b = row({ sortOrder: 0 })
    expect(toPublicMedia([a, b]).map((m) => m.id)).toEqual([b.id, a.id])
  })
})

describe('toManagedMedia', () => {
  test('the garage sees every row with its state', () => {
    const media = toManagedMedia([video('processing'), video('error', { videoError: 'x' })])
    expect(media.map((m) => m.videoStatus)).toEqual(['processing', 'error'])
    expect(media[1].videoError).toBe('x')
  })
})

describe('limits', () => {
  test('a real photo counts real photos only: AI samples give way to it', () => {
    const rows = [row(), row(), row({ source: 'ai' }), video('ready')]
    expect(photosCountingAgainstLimit(rows, 'upload')).toBe(2)
  })

  test('an AI picture counts every photo', () => {
    const rows = [row(), row({ source: 'ai' })]
    expect(photosCountingAgainstLimit(rows, 'ai')).toBe(2)
  })

  test('a real photo or video means no AI sample is wanted', () => {
    expect(hasRealMedia([row({ source: 'ai' })])).toBe(false)
    expect(hasRealMedia([row({ source: 'ai' }), video('processing')])).toBe(true)
  })
})

describe('replacing a video', () => {
  test('without replaces, any video leaves no room', () => {
    expect(videoCountsOnStart(video('ready'), undefined)).toBe(true)
    expect(videoCountsOnStart(video('error'), undefined)).toBe(true)
    expect(videoCountsOnStart(row(), undefined)).toBe(false)
  })

  test('replacing the ready video: it stays, and does not count', () => {
    const live = video('ready')
    expect(videoCountsOnStart(live, live.id)).toBe(false)
    expect(removedOnVideoStart(live, live.id)).toBe(false)
  })

  test('a failed replacement can itself be replaced, and goes when the next starts', () => {
    const live = video('ready')
    const failed = video('error')
    expect([live, failed].filter((r) => videoCountsOnStart(r, failed.id))).toEqual([])
    expect(removedOnVideoStart(failed, failed.id)).toBe(true)
    expect(removedOnVideoStart(live, failed.id)).toBe(false)
  })

  test('a second upload cannot start while one is still on its way', () => {
    const live = video('ready')
    const pending = video('processing')
    expect([live, pending].filter((r) => videoCountsOnStart(r, live.id))).toEqual([pending])
  })

  test('AI samples are not removed when an upload starts, only when it is ready', () => {
    const sample = row({ source: 'ai' })
    expect(removedOnVideoStart(sample, undefined)).toBe(false)
    const ready = video('ready')
    expect(removedWhenVideoReady(sample, ready.id)).toBe(true)
  })

  test('a ready video takes the earlier one’s place, and keeps the photos', () => {
    const earlier = video('ready')
    const fresh = video('ready')
    const photo = row()
    const rows = [earlier, fresh, photo]
    expect(rows.filter((r) => removedWhenVideoReady(r, fresh.id))).toEqual([earlier])
  })
})

describe('consentGiven', () => {
  test('only a literal true is the privacy tick', () => {
    expect(consentGiven(true)).toBe(true)
    expect(consentGiven(undefined)).toBe(false)
    expect(consentGiven(false)).toBe(false)
    expect(consentGiven('true')).toBe(false)
  })
})

describe('formatClipLength', () => {
  test('minutes and two-digit seconds', () => {
    expect(formatClipLength(45)).toBe('0:45')
    expect(formatClipLength(72)).toBe('1:12')
    expect(formatClipLength(59.6)).toBe('1:00')
  })
})

describe('videoUpdateFrom', () => {
  test('ready once Stream can play it, with whole seconds', () => {
    expect(
      videoUpdateFrom({ readyToStream: true, duration: 44.6, status: { state: 'ready' } })
    ).toEqual({ videoStatus: 'ready', durationSecs: 45 })
  })

  test('still encoding is no change', () => {
    expect(videoUpdateFrom({ readyToStream: false, status: { state: 'inprogress' } })).toBeNull()
    expect(videoUpdateFrom({ status: { state: 'pendingupload' } })).toBeNull()
  })

  test('too long is a plain error for the garage', () => {
    expect(
      videoUpdateFrom({
        readyToStream: false,
        status: { state: 'error', errorReasonCode: 'ERR_DURATION_EXCEED_CONSTRAINT' },
      })
    ).toEqual({ videoStatus: 'error', videoError: VIDEO_TOO_LONG_MESSAGE })
  })

  test('a ready video over the limit is refused too', () => {
    expect(videoUpdateFrom({ readyToStream: true, duration: 72 })).toEqual({
      videoStatus: 'error',
      videoError: VIDEO_TOO_LONG_MESSAGE,
    })
  })

  test("Stream's own error text is never passed on", () => {
    expect(streamErrorMessage('ERR_SOMETHING_NEW')).not.toContain('ERR_')
    expect(streamErrorMessage('ERR_MALFORMED_VIDEO')).toContain('could not be read')
  })
})

describe('uploadAbandoned', () => {
  test('only an upload that never arrived, after two hours', () => {
    const old = new Date(NOW.getTime() - ABANDONED_UPLOAD_MS - 1)
    expect(uploadAbandoned('pendingupload', old, NOW.getTime())).toBe(true)
    expect(uploadAbandoned('pendingupload', NOW, NOW.getTime())).toBe(false)
    expect(uploadAbandoned('inprogress', old, NOW.getTime())).toBe(false)
  })
})

describe('streamUrls', () => {
  test('poster at one second, and the HLS manifest', () => {
    expect(streamUrls('abc123', UID)).toEqual({
      posterUrl: `https://customer-abc123.cloudflarestream.com/${UID}/thumbnails/thumbnail.jpg?time=1s`,
      hlsUrl: `https://customer-abc123.cloudflarestream.com/${UID}/manifest/video.m3u8`,
    })
  })

  test('a uid is 32 hex characters', () => {
    expect(isStreamUid(UID)).toBe(true)
    expect(isStreamUid('../etc')).toBe(false)
    expect(isStreamUid(42)).toBe(false)
  })
})

describe('verifyStreamSignature', () => {
  const body = JSON.stringify({ uid: UID, readyToStream: true })

  test('accepts what Stream signs', () => {
    const header = signStreamWebhook(body, SECRET, NOW_SECS)
    expect(verifyStreamSignature({ header, rawBody: body, secret: SECRET, nowSecs: NOW_SECS })).toBe(true)
  })

  test('refuses another body, another secret, or no header', () => {
    const header = signStreamWebhook(body, SECRET, NOW_SECS)
    expect(
      verifyStreamSignature({ header, rawBody: `${body} `, secret: SECRET, nowSecs: NOW_SECS })
    ).toBe(false)
    expect(
      verifyStreamSignature({ header, rawBody: body, secret: 'other', nowSecs: NOW_SECS })
    ).toBe(false)
    expect(
      verifyStreamSignature({ header: undefined, rawBody: body, secret: SECRET, nowSecs: NOW_SECS })
    ).toBe(false)
    expect(
      verifyStreamSignature({ header: 'time=1,sig1=zz', rawBody: body, secret: SECRET, nowSecs: NOW_SECS })
    ).toBe(false)
  })

  test('refuses a signature older than five minutes (a replay)', () => {
    const header = signStreamWebhook(body, SECRET, NOW_SECS - 301)
    expect(verifyStreamSignature({ header, rawBody: body, secret: SECRET, nowSecs: NOW_SECS })).toBe(false)
    const fresh = signStreamWebhook(body, SECRET, NOW_SECS - 299)
    expect(
      verifyStreamSignature({ header: fresh, rawBody: body, secret: SECRET, nowSecs: NOW_SECS })
    ).toBe(true)
  })
})

describe('buildAiPicturePrompt', () => {
  test('the style is always added', () => {
    expect(buildAiPicturePrompt('A clean dark-grey hatchback after a full wash')).toBe(
      `A clean dark-grey hatchback after a full wash. Style: ${AI_PICTURE_STYLE}.`
    )
  })

  test('phone numbers, emails and number plates never reach the model', () => {
    const prompt = buildAiPicturePrompt(
      'Swift TN 09 AB 1234 owned by ravi@example.com, call 98400 12345'
    )
    expect(prompt).not.toContain('1234')
    expect(prompt).not.toContain('@')
    expect(prompt).not.toContain('98400')
    expect(prompt.startsWith('Swift')).toBe(true)
  })
})

describe('keys', () => {
  test('a waiting AI picture belongs to its own service only', () => {
    expect(isAiTempKeyFor(`ai-temp/${SERVICE}/${FILE}.webp`, SERVICE)).toBe(true)
    expect(isAiTempKeyFor(`ai-temp/${VENDOR}/${FILE}.webp`, SERVICE)).toBe(false)
    expect(isAiTempKeyFor(`ai-temp/${SERVICE}/../x.webp`, SERVICE)).toBe(false)
  })

  test("a photo must sit in its own service's folder", () => {
    expect(isServicePhotoKey(`vendors/${VENDOR}/services/${SERVICE}/${FILE}.jpg`, VENDOR, SERVICE)).toBe(true)
    expect(isServicePhotoKey(`vendors/${VENDOR}/${FILE}.jpg`, VENDOR, SERVICE)).toBe(false)
    expect(isServicePhotoKey(`vendors/${SERVICE}/services/${SERVICE}/${FILE}.jpg`, VENDOR, SERVICE)).toBe(false)
  })
})
