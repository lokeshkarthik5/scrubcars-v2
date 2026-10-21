import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('./env.js')
const {
  JOB_PHOTO_LINK_TTL_SECONDS,
  JOB_PHOTO_LINK_WINDOW_SECONDS,
  isPublicPhotoUrl,
  jobPhotoLink,
  privateJobPhotosOn,
  storedJobPhotoUrl,
} = await import('./job-photo-storage.js')

const KEYS = ['r2AccountId', 'r2AccessKeyId', 'r2SecretAccessKey', 'r2Bucket', 'r2PublicBaseUrl', 'r2Endpoint', 'r2DocsBucket'] as const
const values = env as unknown as Record<string, string | undefined>
const saved = Object.fromEntries(KEYS.map((key) => [key, values[key]]))

const KEY = 'vendors/e2e00000-0000-4000-8000-000000003801/job-photos/e2e00000-0000-4000-8000-000000003820/0b4f6c1e-2d3a-4c5b-8e9f-0a1b2c3d4e5f.webp'
const WINDOW_MS = JOB_PHOTO_LINK_WINDOW_SECONDS * 1000
const START = Date.UTC(2026, 9, 19, 10, 5, 0) // on a window boundary

function setPrivate(on: boolean) {
  values.r2AccountId = 'test-account'
  values.r2AccessKeyId = 'test-key'
  values.r2SecretAccessKey = 'test-secret'
  values.r2Bucket = 'detlio-public-test'
  values.r2PublicBaseUrl = 'https://photos.test'
  values.r2Endpoint = undefined
  values.r2DocsBucket = on ? 'detlio-private-test' : undefined
}

beforeEach(() => setPrivate(true))
afterAll(() => Object.assign(values, saved))

describe('where a new photo is recorded', () => {
  test('private: the key itself, so no address is ever stored', () => {
    expect(privateJobPhotosOn()).toBe(true)
    expect(storedJobPhotoUrl(KEY)).toBe(KEY)
  })

  test('private bucket unset: the public address, as before', () => {
    setPrivate(false)
    expect(privateJobPhotosOn()).toBe(false)
    expect(storedJobPhotoUrl(KEY)).toBe(`https://photos.test/${KEY}`)
  })
})

describe('jobPhotoLink', () => {
  test('a public row (older photos, or the bucket unset) is passed through as it is', () => {
    const old = `https://photos.test/${KEY}`
    expect(isPublicPhotoUrl(old)).toBe(true)
    expect(jobPhotoLink(old, START)).toBe(old)
    setPrivate(false)
    expect(jobPhotoLink(old, START)).toBe(old)
  })

  test('a private photo: a link into the private bucket, served as an image, for 15 minutes', () => {
    const link = new URL(jobPhotoLink(KEY, START))
    expect(link.host).toBe('detlio-private-test.test-account.r2.cloudflarestorage.com')
    expect(link.pathname).toBe(`/${KEY}`)
    expect(link.searchParams.get('X-Amz-Expires')).toBe(String(JOB_PHOTO_LINK_TTL_SECONDS))
    expect(link.searchParams.get('response-content-type')).toBe('image/webp')
    expect(link.searchParams.get('response-cache-control')).toBe('private, max-age=600')
  })

  test('the same link all through a window (the browser keeps its copy), a new one after; 10–15 minutes always left', () => {
    const first = jobPhotoLink(KEY, START)
    expect(jobPhotoLink(KEY, START + WINDOW_MS - 1)).toBe(first)
    const next = jobPhotoLink(KEY, START + WINDOW_MS)
    expect(next).not.toBe(first)
    const signedAt = (url: string) => new URL(url).searchParams.get('X-Amz-Date')
    expect(signedAt(first)).toBe('20261019T100500Z')
    expect(signedAt(jobPhotoLink(KEY, START + WINDOW_MS - 1))).toBe('20261019T100500Z')
    // Worst case: asked at the end of a window, the link still has TTL − window.
    expect(JOB_PHOTO_LINK_TTL_SECONDS - JOB_PHOTO_LINK_WINDOW_SECONDS).toBe(10 * 60)
  })

  test('never signs anything outside a job-photos folder: garage documents share the bucket', () => {
    expect(jobPhotoLink('vendors/v1/documents/owner_id/a.jpg', START)).toBe('')
    expect(jobPhotoLink('users/u1/avatar/a.jpg', START)).toBe('')
    expect(jobPhotoLink('../vendors/v1/job-photos/b/a.jpg', START)).toBe('')
  })

  test('a private photo with the bucket since unset shows nothing, never its key', () => {
    setPrivate(false)
    expect(jobPhotoLink(KEY, START)).toBe('')
  })
})
