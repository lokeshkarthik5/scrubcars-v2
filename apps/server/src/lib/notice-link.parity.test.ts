import { describe, expect, test } from 'bun:test'
import { isAllowedNoticeLink, NOTICE_LINK_PATTERN } from './notices.js'

// The admin form's twin lives in packages/core, which the server does not
// depend on. Loaded by path at run time, as copy-rules.parity.test.ts does.
const coreUrl = new URL('../../../../packages/core/src/notice-link.ts', import.meta.url).href

describe('notice link rule', () => {
  test('the server and the admin form agree on every link', async () => {
    const core = (await import(coreUrl)) as {
      NOTICE_LINK_PATTERN: RegExp
      isAllowedNoticeLink: (url: string) => boolean
    }
    expect(core.NOTICE_LINK_PATTERN.source).toBe(NOTICE_LINK_PATTERN.source)
    for (const url of [
      'https://detlio.com/help',
      'https://wa.me/919000000000',
      '/bookings',
      '/',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      'http://detlio.com',
      'javascript:alert(1)',
      'bookings',
      'https:///evil.com',
    ]) {
      expect(core.isAllowedNoticeLink(url)).toBe(isAllowedNoticeLink(url))
    }
  })
})
