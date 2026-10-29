import { describe, expect, test } from 'bun:test'
import * as server from './ratings.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). A drift would
// let the iOS app offer a tag the API refuses.
const coreUrl = new URL(
  '../../../../packages/core/src/ratings.ts',
  import.meta.url
).href

describe('ratings parity (0065)', () => {
  test('the tags, their words and the numbers are the same', async () => {
    const core = (await import(coreUrl)) as typeof server & {
      NEW_GARAGE_LABEL: string
    }
    expect([...core.POSITIVE_REVIEW_TAGS]).toEqual([
      ...server.POSITIVE_REVIEW_TAGS,
    ])
    expect([...core.NEGATIVE_REVIEW_TAGS]).toEqual([
      ...server.NEGATIVE_REVIEW_TAGS,
    ])
    expect(core.REVIEW_TAG_LABELS).toEqual(server.REVIEW_TAG_LABELS)
    expect(core.RATING_RULES).toEqual(server.RATING_RULES)
    for (const stars of [1, 2, 3, 4, 5])
      expect(core.tagsForRating(stars)).toEqual(server.tagsForRating(stars))
    expect(core.NEW_GARAGE_LABEL).toBe('New on Detlio')
  })
})
