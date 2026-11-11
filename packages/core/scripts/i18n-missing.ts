#!/usr/bin/env bun
/**
 * Which English has no Tamil yet: a static scan of the customer and garage
 * apps, packages/ui, packages/native-ui and core's helpers for t('…'),
 * tn(n, '…', '…'), msg('…'), translate(lang, '…') and
 * translatePlural(lang, n, '…', '…'), checked against the merged Tamil
 * (src/i18n/dictionary.ts). Dev only; nothing imports it.
 *
 *   bun packages/core/scripts/i18n-missing.ts            missing keys, by the file each belongs in
 *   bun packages/core/scripts/i18n-missing.ts users-app  only paths containing "users-app"
 *   bun packages/core/scripts/i18n-missing.ts --unused   also Tamil no scanned code asks for
 *
 * It also flags a t() given a template literal with ${…} in it, which can
 * never match a key: write the placeholder as {name} and pass it in vars.
 *
 * Exits 1 when anything is missing, so it can gate a branch.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { TA, TA_FILES, type TaFile } from '../src/i18n/dictionary'

const ROOT = join(import.meta.dir, '..', '..', '..')

/** What is scanned. Marketing and legal pages stay English this phase. */
const SCAN = [
  'apps/users',
  'apps/users-app',
  'apps/vendors',
  'apps/vendors-app',
  'packages/ui/src',
  'packages/native-ui/src',
  'packages/core/src',
]
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.expo',
  '.turbo',
  'dist',
  'build',
  'public',
  'assets',
  'ios',
  'android',
])
const SKIP_PATHS = [
  'apps/users/components/marketing/',
  'apps/users/lib/legal/',
  'packages/core/src/i18n/',
]
const SOURCE = /\.(ts|tsx)$/
const TEST = /\.(test|spec)\.(ts|tsx)$/

/** Which ta/ file a key found in this path belongs in. */
function fileFor(path: string): TaFile {
  if (path.startsWith('apps/users-app/')) return 'customer-app'
  if (path.startsWith('apps/users/')) return 'customer-web'
  if (path.startsWith('apps/vendors-app/')) return 'garage-app'
  if (path.startsWith('apps/vendors/')) return 'garage-web'
  return 'common'
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE.test(name) && !TEST.test(name) && !name.endsWith('.d.ts'))
      out.push(full)
  }
}

/** A string literal whose quote is capture group `n` and its body group n + 1. */
const string = (n: number) => `(['"\\x60])((?:\\\\.|(?!\\${n})[^\\\\])*)\\${n}`
// A call's name, not a property or a longer identifier: t( but not .t( or set(.
const START = String.raw`(?<![\w$.])`
const ONE = new RegExp(`${START}(?:t|msg)\\(\\s*${string(1)}\\s*[,)]`, 'g')
const TRANSLATE = new RegExp(
  `${START}translate\\([^,()]+,\\s*${string(1)}\\s*[,)]`,
  'g'
)
// The count may be any expression without a quote in it: tn(list.length, '…', '…').
const PLURAL = new RegExp(
  `${START}(?:tn\\(|translatePlural\\([^,()]+,)[^'"\\x60;]*?,\\s*${string(1)}\\s*,\\s*${string(3)}`,
  'g'
)

/**
 * Comments blanked out, newlines kept so line numbers hold: a doc comment's
 * example t('…') is not a key. Block comments, and lines that are only a
 * line comment (a // inside a string, as in a URL, is left alone).
 */
function withoutComments(text: string): string {
  return (
    text
      // Only a /* that starts a comment: not the one in accept="video/*".
      .replace(
        /(^|[\s{(,;])(\/\*[\s\S]*?\*\/)/g,
        (_, before: string, comment: string) =>
          before + comment.replace(/[^\n]/g, ' ')
      )
      .replace(/^\s*\/\/.*$/gm, '')
  )
}

function unescape(raw: string): string {
  return raw.replace(/\\(.)/g, (_, char: string) =>
    char === 'n' ? '\n' : char
  )
}

interface Found {
  key: string
  path: string
  line: number
}

const used = new Map<string, Found>()
const templates: Found[] = []

function lineOf(text: string, index: number) {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

function add(
  raw: string,
  quote: string,
  path: string,
  text: string,
  index: number
) {
  const found = { key: unescape(raw), path, line: lineOf(text, index) }
  if (quote === '`' && raw.includes('${')) {
    templates.push(found)
    return
  }
  if (!used.has(found.key)) used.set(found.key, found)
}

const filter = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const showUnused = process.argv.includes('--unused')

const files: string[] = []
for (const dir of SCAN) walk(join(ROOT, dir), files)

for (const full of files) {
  const path = relative(ROOT, full).split(sep).join('/')
  if (SKIP_PATHS.some((skip) => path.startsWith(skip))) continue
  const text = withoutComments(readFileSync(full, 'utf8'))
  for (const match of text.matchAll(ONE))
    add(match[2]!, match[1]!, path, text, match.index!)
  for (const match of text.matchAll(TRANSLATE))
    add(match[2]!, match[1]!, path, text, match.index!)
  for (const match of text.matchAll(PLURAL)) {
    add(match[2]!, match[1]!, path, text, match.index!)
    add(match[4]!, match[3]!, path, text, match.index!)
  }
}

const missing = [...used.values()].filter(
  (found) =>
    !Object.prototype.hasOwnProperty.call(TA, found.key) &&
    (!filter || found.path.includes(filter))
)
const byFile = new Map<TaFile, Found[]>()
for (const found of missing) {
  const file = fileFor(found.path)
  byFile.set(file, [...(byFile.get(file) ?? []), found])
}

for (const [file, list] of byFile) {
  console.log(`\nta/${file}.ts — ${list.length} missing`)
  for (const found of list.sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line
  )) {
    console.log(`  ${JSON.stringify(found.key)}  (${found.path}:${found.line})`)
  }
}

const shownTemplates = templates.filter(
  (found) => !filter || found.path.includes(filter)
)
if (shownTemplates.length > 0) {
  console.log(
    `\n${shownTemplates.length} t() calls given a \${…} template, which never match a key (use {name} and vars):`
  )
  for (const found of shownTemplates)
    console.log(`  ${found.path}:${found.line}  ${JSON.stringify(found.key)}`)
}

if (showUnused) {
  for (const [file, entries] of Object.entries(TA_FILES)) {
    const unused = Object.keys(entries).filter((key) => !used.has(key))
    if (unused.length === 0) continue
    console.log(
      `\nta/${file}.ts — ${unused.length} not asked for by scanned code (dynamic keys are fine; check before deleting)`
    )
    for (const key of unused) console.log(`  ${JSON.stringify(key)}`)
  }
}

console.log(
  `\n${used.size} keys in use, ${Object.keys(TA).length} Tamil entries, ${missing.length} missing${filter ? ` under "${filter}"` : ''}.`
)
process.exit(missing.length > 0 || shownTemplates.length > 0 ? 1 : 0)
