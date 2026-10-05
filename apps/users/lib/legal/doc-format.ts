/**
 * The shape of a public legal page (Terms, Privacy Policy, Refund Policy…)
 * and the pure helpers that read it.
 *
 * A page is plain data — sections of paragraphs, lists and tables whose text
 * carries a tiny inline markup — so that one source feeds both the web page
 * and the Markdown copy a lawyer reviews, and a lawyer's edit is a change to
 * a string rather than to JSX. In the customer app because only it has legal
 * pages today (AGENTS.md: packages/* is for code two apps use); move it to
 * @repo/core when the garage portal's Partner Terms need the same format.
 *
 * Inline markup, deliberately small (no nesting):
 *
 *   **bold**             strong text
 *   [label](href)        a link; href is a site path ("/privacy"), an
 *                        absolute URL, or a mailto:/tel: link
 *   {{tbc:what}}         a detail nobody has confirmed yet, shown as a visible
 *                        "[to be confirmed: what]" marker — see `orTbc`
 *
 * Reviewer notes are blocks of their own (`kind: 'note'`): questions for the
 * lawyer. They are always in the Markdown copy (scripts/export-legal.ts); a
 * web page shows them only under `next dev` while the pages are drafts, never
 * in a build (components/legal/legal-page.tsx), because they describe open
 * gaps in the product.
 */

export type LegalBlock =
  /** A paragraph. */
  | { kind: 'p'; text: string }
  /** A bulleted (or numbered) list. */
  | { kind: 'list'; items: string[]; ordered?: boolean }
  /** A table. Every row has as many cells as `head`. */
  | { kind: 'table'; caption: string; head: string[]; rows: string[][] }
  /** A short highlighted statement — the one line a reader must not miss. */
  | { kind: 'callout'; text: string }
  /** A question for the lawyer. On a page only in development, in draft mode. */
  | { kind: 'note'; text: string }

export interface LegalSubsection {
  /** The anchor id, unique within the page. */
  id: string
  heading: string
  blocks: LegalBlock[]
}

export interface LegalSection {
  /** The anchor id, unique within the page. */
  id: string
  heading: string
  blocks: LegalBlock[]
  subsections?: LegalSubsection[]
}

export interface LegalDoc {
  /** The site path, e.g. "/terms". */
  path: string
  /** The page's h1. */
  title: string
  /** The meta description: one plain sentence, no markup. */
  description: string
  /** The opening paragraphs under the title. */
  intro: LegalBlock[]
  sections: LegalSection[]
  /** Show an "On this page" list. For the long pages. */
  toc: boolean
}

// ─── Placeholders ────────────────────────────────────────────────────────────

/** The inline token for a detail that is not confirmed yet. */
export function tbc(what: string): string {
  // A "}" would end the token early; nothing that needs one is a placeholder.
  return `{{tbc:${what.replace(/[{}]/g, '')}}}`
}

/** The value when it is known, otherwise a visible placeholder naming it. */
export function orTbc(value: string | null | undefined, what: string): string {
  return value == null || value.trim() === '' ? tbc(what) : value
}

/** How a placeholder reads on the page and in the Markdown copy. */
export function placeholderText(what: string): string {
  return `[to be confirmed: ${what}]`
}

// ─── Inline markup ───────────────────────────────────────────────────────────

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'tbc'; what: string }

// One alternation, tried left to right at each position, so the earliest
// match wins and nothing is matched twice.
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\{\{tbc:([^}]+)\}\}/g

/**
 * Splits a string of inline markup into nodes. Anything that is not a
 * complete token stays text, so a stray "*" or "[" prints as itself.
 */
export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let last = 0
  for (const match of source.matchAll(INLINE)) {
    const at = match.index ?? 0
    if (at > last) nodes.push({ type: 'text', text: source.slice(last, at) })
    if (match[1] !== undefined) nodes.push({ type: 'strong', text: match[1] })
    else if (match[2] !== undefined)
      nodes.push({ type: 'link', text: match[2], href: match[3] })
    else nodes.push({ type: 'tbc', what: match[4] })
    last = at + match[0].length
  }
  if (last < source.length) nodes.push({ type: 'text', text: source.slice(last) })
  return nodes
}

/** The text a reader sees, markup removed — for meta tags and plain copies. */
export function inlineToPlain(source: string): string {
  return parseInline(source)
    .map((node) => (node.type === 'tbc' ? placeholderText(node.what) : node.text))
    .join('')
}

/** True for a link that leaves the site (opened in a new tab). */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//.test(href)
}

// ─── Reading a document ──────────────────────────────────────────────────────

/** Every string of inline text in the document, in reading order. */
function textsOf(blocks: LegalBlock[]): string[] {
  return blocks.flatMap((block) => {
    switch (block.kind) {
      case 'p':
      case 'callout':
      case 'note':
        return [block.text]
      case 'list':
        return block.items
      case 'table':
        return [block.caption, ...block.head, ...block.rows.flat()]
    }
  })
}

function allBlocks(doc: LegalDoc): LegalBlock[] {
  return [
    ...doc.intro,
    ...doc.sections.flatMap((section) => [
      ...section.blocks,
      ...(section.subsections ?? []).flatMap((sub) => sub.blocks),
    ]),
  ]
}

/** Each distinct unconfirmed detail the document mentions, first use first. */
export function placeholdersIn(doc: LegalDoc): string[] {
  const seen = new Set<string>()
  for (const text of [doc.title, ...textsOf(allBlocks(doc))]) {
    for (const node of parseInline(text)) {
      if (node.type === 'tbc') seen.add(node.what)
    }
  }
  return [...seen]
}

/** The reviewer notes, with the heading of the section each sits in. */
export function notesIn(doc: LegalDoc): Array<{ where: string; text: string }> {
  const notes: Array<{ where: string; text: string }> = []
  const collect = (where: string, blocks: LegalBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'note') notes.push({ where, text: block.text })
    }
  }
  collect('Introduction', doc.intro)
  for (const section of doc.sections) {
    collect(section.heading, section.blocks)
    for (const sub of section.subsections ?? []) {
      collect(`${section.heading} › ${sub.heading}`, sub.blocks)
    }
  }
  return notes
}

/** Anchor ids that appear more than once — each must be unique on its page. */
export function duplicateIds(doc: LegalDoc): string[] {
  const ids = doc.sections.flatMap((section) => [
    section.id,
    ...(section.subsections ?? []).map((sub) => sub.id),
  ])
  return ids.filter((id, index) => ids.indexOf(id) !== index)
}

/** Table rows whose cell count differs from the header's, as "caption #row". */
export function malformedTables(doc: LegalDoc): string[] {
  return allBlocks(doc).flatMap((block) =>
    block.kind === 'table'
      ? block.rows.flatMap((row, index) =>
          row.length === block.head.length ? [] : [`${block.caption} #${index + 1}`]
        )
      : []
  )
}

// ─── Markdown ────────────────────────────────────────────────────────────────

export interface MarkdownOptions {
  /** Prefix for site paths, so links work outside the site. */
  origin: string
  /** Include reviewer notes. */
  draft: boolean
  /** The "Last updated" line. */
  lastUpdated: string
  /**
   * When the text takes effect, as inline markup — a date, or a placeholder
   * while it is not set. Left out, the line is not printed.
   */
  inForceFrom?: string
}

function absolute(href: string, origin: string): string {
  return href.startsWith('/') ? `${origin}${href}` : href
}

/** Inline markup as Markdown: same bold and links, placeholders in bold. */
export function inlineToMarkdown(source: string, origin: string): string {
  return parseInline(source)
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.text
        case 'strong':
          return `**${node.text}**`
        case 'link':
          return `[${node.text}](${absolute(node.href, origin)})`
        case 'tbc':
          return `**${placeholderText(node.what)}**`
      }
    })
    .join('')
}

/**
 * 1 → "i", 4 → "iv", 11 → "xi": numbered lists are lower-roman on the page
 * (legal-page.tsx), because the content rules mirror IT Rules 3(1)(b)(i)–(xi)
 * and are cited by item, so the lawyer's copy must number them the same way.
 */
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`No roman numeral for ${n}`)
  const numerals: Array<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ]
  let rest = n
  let out = ''
  for (const [value, numeral] of numerals) {
    while (rest >= value) {
      out += numeral
      rest -= value
    }
  }
  return out
}

function cell(source: string, origin: string): string {
  return inlineToMarkdown(source, origin).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function blockToMarkdown(block: LegalBlock, options: MarkdownOptions): string | null {
  const md = (text: string) => inlineToMarkdown(text, options.origin)
  switch (block.kind) {
    case 'p':
      return md(block.text)
    case 'callout':
      return `> ${md(block.text)}`
    case 'note':
      return options.draft ? `> **Reviewer note:** ${md(block.text)}` : null
    case 'list':
      return block.items
        // Ordered items as "- (iv) …": a Markdown "1." list would renumber
        // them in decimals, unlike the page.
        .map((item, index) => `- ${block.ordered ? `(${toRoman(index + 1)}) ` : ''}${md(item)}`)
        .join('\n')
    case 'table': {
      const row = (cells: string[]) =>
        `| ${cells.map((c) => cell(c, options.origin)).join(' | ')} |`
      return [
        `*${md(block.caption)}*`,
        '',
        row(block.head),
        `| ${block.head.map(() => '---').join(' | ')} |`,
        ...block.rows.map(row),
      ].join('\n')
    }
  }
}

function blocksToMarkdown(blocks: LegalBlock[], options: MarkdownOptions): string[] {
  return blocks
    .map((block) => blockToMarkdown(block, options))
    .filter((text): text is string => text !== null)
}

/**
 * The document as Markdown, headings one level down from `level` — so
 * several documents can sit under one title in a single file.
 */
export function legalDocToMarkdown(
  doc: LegalDoc,
  options: MarkdownOptions,
  level = 1
): string {
  const h = (depth: number) => '#'.repeat(Math.min(6, level + depth))
  const parts: string[] = [
    `${h(0)} ${inlineToMarkdown(doc.title, options.origin)}`,
    `*${absolute(doc.path, options.origin)} · Last updated: ${options.lastUpdated}${
      options.inForceFrom === undefined
        ? ''
        : ` · In force from: ${inlineToMarkdown(options.inForceFrom, options.origin)}`
    }*`,
    ...blocksToMarkdown(doc.intro, options),
  ]
  for (const section of doc.sections) {
    parts.push(`${h(1)} ${section.heading}`, ...blocksToMarkdown(section.blocks, options))
    for (const sub of section.subsections ?? []) {
      parts.push(`${h(2)} ${sub.heading}`, ...blocksToMarkdown(sub.blocks, options))
    }
  }
  return `${parts.join('\n\n')}\n`
}
