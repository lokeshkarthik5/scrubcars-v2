import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Production has one database connection (index.ts). Reads sent together
// with Promise.all are pipelined down it through Supabase's pooler, and on
// 13-14 Nov that hung the garage list and garage page until the 60 s limit,
// then failed the next requests on the same instance. Every read is awaited
// on its own: `[await a(), await b()]`, never `await Promise.all([a(), b()])`.
//
// These files use Promise.all for calls that never touch the database
// (map lookups, Razorpay, push services, file storage). A new entry here
// needs the same check.
const NOT_THE_DATABASE = new Set([
  'lib/places/ola.ts',
  'modules/places/places.service.ts',
  'modules/data-reset/data-reset.service.ts',
  'modules/push/push.rules.ts',
  'modules/push/push.device-rules.ts',
  'modules/service-media/service-media.service.ts',
])

const root = join(import.meta.dir, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : []
  })
}

describe('one database read at a time', () => {
  test('no Promise.all outside the files that never read the database', () => {
    const offenders = sourceFiles(root)
      .map((path) => relative(root, path))
      .filter((file) => !NOT_THE_DATABASE.has(file))
      .filter((file) =>
        readFileSync(join(root, file), 'utf8')
          .split('\n')
          .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
          .some((line) => /Promise\.(all|allSettled)\(/.test(line))
      )
    expect(offenders).toEqual([])
  })
})
