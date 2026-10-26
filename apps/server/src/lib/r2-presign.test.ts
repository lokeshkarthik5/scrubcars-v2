import { describe, expect, test } from 'bun:test'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { presignGetUrl } from './r2-presign.js'

/**
 * The hand-made link must be the SDK's link, byte for byte: then R2 (and the
 * E2E MinIO) accept it exactly as they accept the documents' links.
 */
const signedAt = new Date('2026-10-19T10:05:00Z')
const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }

async function sdkUrl(endpoint: string, pathStyle: boolean, bucket: string, key: string, response?: { contentType?: string; cacheControl?: string }) {
  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: pathStyle,
    credentials,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(response?.contentType && { ResponseContentType: response.contentType }),
      ...(response?.cacheControl && { ResponseCacheControl: response.cacheControl }),
    }),
    { expiresIn: 900, signingDate: signedAt }
  )
}

const KEYS = [
  'vendors/e2e00000-0000-4000-8000-000000003801/job-photos/e2e00000-0000-4000-8000-000000003820/0b4f6c1e-2d3a-4c5b-8e9f-0a1b2c3d4e5f.jpg',
  'vendors/a b/job-photos/x+y/customer/ü (1)*!.png',
]

describe('presignGetUrl matches the AWS SDK', () => {
  for (const [label, endpoint, pathStyle] of [
    ['R2 (virtual-hosted)', 'https://acct123.r2.cloudflarestorage.com', false],
    ['MinIO override (path style)', 'http://localhost:9000', true],
  ] as const) {
    for (const key of KEYS) {
      test(`${label}: ${key.slice(-24)}`, async () => {
        const response = { contentType: 'image/jpeg', cacheControl: 'private, max-age=600' }
        const ours = presignGetUrl({
          endpoint,
          pathStyle,
          bucket: 'detlio-private',
          key,
          ...credentials,
          signedAt,
          expiresInSeconds: 900,
          response,
        })
        expect(ours).toBe(await sdkUrl(endpoint, pathStyle, 'detlio-private', key, response))
      })
    }
  }

  // A bucket that cannot be a host name goes in the path, as the SDK does.
  for (const bucket of ['detlio-docs', 'b', 'detlio.docs']) {
    test(`without response overrides, bucket ${bucket}`, async () => {
      const ours = presignGetUrl({
        endpoint: 'https://acct123.r2.cloudflarestorage.com',
        pathStyle: false,
        bucket,
        key: KEYS[0]!,
        ...credentials,
        signedAt,
        expiresInSeconds: 900,
      })
      expect(ours).toBe(await sdkUrl('https://acct123.r2.cloudflarestorage.com', false, bucket, KEYS[0]!))
    })
  }
})
