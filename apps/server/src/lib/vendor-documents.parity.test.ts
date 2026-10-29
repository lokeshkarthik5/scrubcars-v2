import { describe, expect, test } from 'bun:test'
import * as server from './vendor-documents.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The garage
// portal checks a file against the core numbers before asking for a link,
// and every app names the documents in the core words.
const coreUrl = (file: string) =>
  new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

describe('garage documents parity', () => {
  test('the types, the required three, the retired one, the names and the limits are the same', async () => {
    const core = (await import(coreUrl('vendor-documents.ts'))) as {
      DOCUMENT_TYPES: readonly string[]
      REQUIRED_DOCUMENT_TYPES: readonly string[]
      RETIRED_DOCUMENT_TYPES: readonly string[]
      DOCUMENT_LABELS: Record<string, string>
      DOCUMENT_CONTENT_TYPES: readonly string[]
      MAX_DOCUMENT_BYTES: number
      MAX_FILES_PER_DOCUMENT: number
      DOCUMENT_LINK_TTL_SECONDS: number
      progressLine: (summary: { approvedRequired: number; required: number }) => string
    }
    expect([...core.DOCUMENT_TYPES]).toEqual([...server.DOCUMENT_TYPES])
    expect([...core.REQUIRED_DOCUMENT_TYPES]).toEqual([...server.REQUIRED_DOCUMENT_TYPES])
    expect([...core.RETIRED_DOCUMENT_TYPES]).toEqual([...server.RETIRED_DOCUMENT_TYPES])
    expect(core.DOCUMENT_LABELS).toEqual(server.DOCUMENT_LABELS)
    expect([...core.DOCUMENT_CONTENT_TYPES]).toEqual(Object.keys(server.DOCUMENT_CONTENT_TYPES))
    expect(core.MAX_DOCUMENT_BYTES).toBe(server.MAX_DOCUMENT_BYTES)
    expect(core.MAX_FILES_PER_DOCUMENT).toBe(server.MAX_FILES_PER_DOCUMENT)
    expect(core.DOCUMENT_LINK_TTL_SECONDS).toBe(server.DOCUMENT_LINK_TTL_SECONDS)
    expect(core.progressLine({ approvedRequired: 3, required: 4 })).toBe(
      server.progressLine({ approvedRequired: 3, required: 4 })
    )
  })

  test('who may remove a document is the same rule (0065)', async () => {
    const core = (await import(coreUrl('vendor-documents.ts'))) as {
      garageCanRemove: (doc: { type: string; status: string; uploadedByDetlio: boolean }) => boolean
      adminCanRemove: (doc: { type: string; status: string }) => boolean
    }
    for (const type of server.DOCUMENT_TYPES) {
      for (const status of server.DOCUMENT_STATUSES) {
        for (const uploadedBy of ['garage', 'Mathew']) {
          const doc = { type, status, uploadedBy }
          expect(core.garageCanRemove({ type, status, uploadedByDetlio: uploadedBy !== 'garage' })).toBe(
            server.removalRefusal(doc, 'garage') === null
          )
          // The panel offers Remove for everything the API takes once warned.
          expect(core.adminCanRemove({ type, status })).toBe(server.removalRefusal(doc, 'admin', true) === null)
        }
      }
    }
  })
})
