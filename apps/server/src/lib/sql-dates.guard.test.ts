import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// A `Date` inside a Drizzle `sql` template reaches postgres.js unconverted
// and, with `prepare: false`, the query fails at run time (see sql-dates.ts).
// TypeScript cannot object to it (template values are `unknown`), and a unit
// test that mocks the database cannot see it, so this walks every `sql`
// template in src/ with the type checker and fails on any interpolation whose
// type is a Date (or a union / array containing one). Fix: `${tstz(date)}`.

type Hit = { file: string; line: number; text: string }

function isDate(checker: ts.TypeChecker, type: ts.Type, depth = 0): boolean {
  if (depth > 3) return false
  if (type.isUnion())
    return type.types.some((t) => isDate(checker, t, depth + 1))
  if (type.symbol?.name === 'Date') return true
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    return checker
      .getTypeArguments(type as ts.TypeReference)
      .some((t) => isDate(checker, t, depth + 1))
  }
  return false
}

function findDatesInSqlTemplates(
  program: ts.Program,
  include: (file: string) => boolean
): { hits: Hit[]; templates: number } {
  const checker = program.getTypeChecker()
  const hits: Hit[] = []
  let templates = 0
  for (const source of program.getSourceFiles()) {
    if (!include(source.fileName)) continue
    const visit = (node: ts.Node) => {
      if (
        ts.isTaggedTemplateExpression(node) &&
        ts.isIdentifier(node.tag) &&
        node.tag.text === 'sql' &&
        ts.isTemplateExpression(node.template)
      ) {
        templates++
        for (const span of node.template.templateSpans) {
          if (isDate(checker, checker.getTypeAtLocation(span.expression))) {
            const { line } = source.getLineAndCharacterOfPosition(
              span.expression.getStart()
            )
            hits.push({
              file: source.fileName,
              line: line + 1,
              text: span.expression.getText(),
            })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return { hits, templates }
}

describe('Dates in sql templates', () => {
  test('the scanner flags a raw Date and accepts the converted forms', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sql-dates-'))
    const file = path.join(dir, 'fixture.ts')
    writeFileSync(
      file,
      [
        'declare function sql(s: TemplateStringsArray, ...v: unknown[]): unknown',
        'declare function tstz(d: Date): unknown',
        'const d = new Date()',
        'const maybe: Date | null = null as Date | null',
        'sql`a ${d}`',
        'sql`b ${maybe}`',
        'sql`c ${[d]}`',
        'sql`d ${d.toISOString()}::timestamptz`',
        'sql`e ${tstz(d)}`',
        'sql`f ${d.getTime()}`',
      ].join('\n')
    )
    const program = ts.createProgram([file], {
      strict: true,
      noEmit: true,
      types: [],
    })
    const { hits } = findDatesInSqlTemplates(program, (f) => f === file)
    expect(hits.map((h) => h.line)).toEqual([5, 6, 7])
  })

  test('no sql template in src/ interpolates a Date', () => {
    const serverDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..'
    )
    const configPath = path.join(serverDir, 'tsconfig.json')
    const config = ts.getParsedCommandLineOfConfigFile(
      configPath,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => {
          throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'))
        },
      }
    )
    if (!config) throw new Error('could not read tsconfig.json')
    const program = ts.createProgram(config.fileNames, config.options)
    const srcDir = path.join(serverDir, 'src') + path.sep
    const { hits, templates } = findDatesInSqlTemplates(
      program,
      (f) => f.startsWith(srcDir) && !f.endsWith('.test.ts')
    )
    // Guards against the scan silently matching nothing (a changed tag name, a
    // tsconfig that stops including src/).
    expect(templates).toBeGreaterThan(300)
    expect(
      hits.map(
        (h) => `${path.relative(serverDir, h.file)}:${h.line}  \${${h.text}}`
      )
    ).toEqual([])
  }, 120_000)
})
