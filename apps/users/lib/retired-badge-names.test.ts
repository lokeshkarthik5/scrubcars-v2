import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Bronze / Silver / Gold (0063) replaced the "Documents verified" shield and
 * the "Detlio Certified" seal, and "Show to customers" replaced "Verified by
 * Detlio". No customer screen (the customer app and the shared UI) may
 * still say the old names (code comments may, to say where something came
 * from).
 */
const RETIRED = [/detlio\s+certified/i, /documents\s+verified/i, /verified\s+by\s+detlio/i, /certified\s+only/i]

const ROOT = join(import.meta.dir, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** The file without its comments: block comments, JSX comments and `//` line comments. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('the retired badge names (0063)', () => {
  test('no customer screen says them', () => {
    const folders = ['app', 'components', 'lib', '../../packages/ui/src']
    const offenders = folders.flatMap((folder) =>
      sourceFiles(join(ROOT, folder)).flatMap((path) => {
        const text = withoutComments(readFileSync(path, 'utf8'))
        return RETIRED.filter((name) => name.test(text)).map((name) => `${path}: ${name}`)
      })
    )
    expect(offenders).toEqual([])
  })
})
