import { describe, expect, test } from 'bun:test'
import * as server from './service-history-certificate.js'

// The customer app's twin lives in packages/core, which the server does not
// depend on. Loaded by path at run time (a computed specifier, so the
// server's TypeScript build never tries to compile a file outside src/). The
// app's expiry choices and its token check must say what the API decides.
const coreUrl = new URL('../../../../packages/core/src/service-history-certificate.ts', import.meta.url).href

type Core = {
  CERTIFICATE_TOKEN_PATTERN: RegExp
  SHARE_EXPIRY_OPTIONS: ReadonlyArray<{ days: number | null }>
  isCertificateTokenShaped: (token: string) => boolean
}

describe('service history certificate parity', () => {
  test('the token shape and the expiry choices are the same', async () => {
    const core = (await import(coreUrl)) as Core
    expect(core.CERTIFICATE_TOKEN_PATTERN.source).toBe(server.CERTIFICATE_TOKEN_PATTERN.source)
    expect(core.SHARE_EXPIRY_OPTIONS.map((option) => option.days)).toEqual([null, ...server.SHARE_EXPIRY_DAYS])

    const token = server.linkToken(server.deriveCertificateKey('parity'), '00000000-0000-4000-8000-000000003399')
    expect(core.isCertificateTokenShaped(token)).toBe(true)
  })
})
