/**
 * A presigned GET link for one object in R2, made synchronously.
 *
 * The AWS SDK's getSignedUrl (lib/document-storage.ts) is async, which is
 * fine for a document opened one press at a time. Job photos are in every
 * booking payload, built by synchronous mappers (toJobPhotoView,
 * toExtraWorkView, …), so this signs the same link without a promise:
 * AWS Signature Version 4, query-string form, host header only, unsigned
 * payload, exactly as the SDK does for GetObject. `r2-presign.test.ts` pins
 * it to the SDK's own output, byte for byte, in both endpoint styles.
 *
 * No network, no SDK: HMAC-SHA256 over the request, keyed from the secret.
 */
import { createHash, createHmac } from 'node:crypto'

export interface PresignGetInput {
  /** `https://<account>.r2.cloudflarestorage.com`, or an override (MinIO). */
  endpoint: string
  /** True with an override endpoint: the bucket goes in the path, not the host. */
  pathStyle: boolean
  bucket: string
  key: string
  accessKeyId: string
  secretAccessKey: string
  /** When the link was signed; it works for `expiresInSeconds` from then. */
  signedAt: Date
  expiresInSeconds: number
  /** `response-*` overrides R2 applies to the answer (content type, caching). */
  response?: { contentType?: string; cacheControl?: string }
}

const REGION = 'auto'
const SERVICE = 's3'

/** RFC 3986 encoding, as SigV4 wants it; `/` kept in a path. */
function uriEncode(value: string, keepSlash: boolean): string {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return keepSlash ? encoded.replace(/%2F/g, '/') : encoded
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

/**
 * Whether the bucket can be a host name. The SDK puts any other bucket (too
 * short, capitals, dots — which break the TLS wildcard) in the path instead.
 */
function hostSafeBucket(bucket: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
}

export function presignGetUrl(input: PresignGetInput): string {
  const base = new URL(input.endpoint)
  const basePath = base.pathname.replace(/\/+$/, '')
  const pathStyle = input.pathStyle || !hostSafeBucket(input.bucket)
  const host = pathStyle ? base.host : `${input.bucket}.${base.host}`
  const path = `${basePath}${pathStyle ? `/${uriEncode(input.bucket, false)}` : ''}/${uriEncode(input.key, true)}`

  const stamp = amzDate(input.signedAt)
  const day = stamp.slice(0, 8)
  const scope = `${day}/${REGION}/${SERVICE}/aws4_request`

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(input.expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
    'x-id': 'GetObject',
  }
  if (input.response?.cacheControl) params['response-cache-control'] = input.response.cacheControl
  if (input.response?.contentType) params['response-content-type'] = input.response.contentType

  const query = (entries: Record<string, string>) =>
    Object.entries(entries)
      .map(([name, value]) => [uriEncode(name, false), uriEncode(value, false)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, value]) => `${name}=${value}`)
      .join('&')

  const canonicalRequest = ['GET', path, query(params), `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    stamp,
    scope,
    createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n')

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), REGION), SERVICE), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')

  return `${base.protocol}//${host}${path}?${query({ ...params, 'X-Amz-Signature': signature })}`
}
