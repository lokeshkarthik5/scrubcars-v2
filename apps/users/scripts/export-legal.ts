/**
 * Writes the five legal pages into one Markdown file for the lawyer.
 *
 *   bun apps/users/scripts/export-legal.ts [out.md]
 *
 * The same data the pages render (lib/legal/*), so the copy can never say
 * something the site does not: placeholders print as
 * **[to be confirmed: …]**, reviewer notes as quoted "Reviewer note" blocks
 * (they are always included here, whatever LEGAL_DRAFT says — this copy is
 * for review), and site links as absolute detlio.com URLs. Up front: every
 * placeholder and every reviewer note, gathered per page, so the open
 * questions can be answered in one sitting.
 *
 * Without an argument it prints to stdout.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  inlineToMarkdown,
  legalDocToMarkdown,
  notesIn,
  orTbc,
  placeholderText,
  placeholdersIn,
} from '../lib/legal/doc-format'
import {
  EFFECTIVE_DATE,
  LAST_UPDATED,
  LEGAL_DRAFT,
  SITE_ORIGIN,
} from '../lib/legal/details'
import { LEGAL_DOCS } from '../lib/legal/index'

/** The same words as the pages' header (components/legal/legal-page.tsx). */
const inForceFrom = orTbc(EFFECTIVE_DATE, 'date this takes effect')

const options = { origin: SITE_ORIGIN, draft: true, lastUpdated: LAST_UPDATED, inForceFrom }

const lines: string[] = [
  '# Detlio legal pages: drafts for legal review',
  '',
  `Exported from the code on ${new Date().toISOString().slice(0, 10)}. Text last updated: ${LAST_UPDATED}. ` +
    `Draft mode on the site: ${LEGAL_DRAFT ? 'on (banner and noindex; reviewer notes only in local development, never on a deployed site)' : 'off'}.`,
  '',
  'Placeholders appear as **[to be confirmed: …]**. Reviewer notes are questions for you; they are never shown on the deployed site. ' +
    'To change the text, mark up this copy; the developer applies the edits to `apps/users/lib/legal/<page>.ts` (business details: `details.ts`).',
  '',
  '## Contents',
  '',
  ...LEGAL_DOCS.map((doc, i) => `${i + 1}. ${doc.title} (${SITE_ORIGIN}${doc.path})`),
  '',
  '## Open items',
  '',
  '### Every page',
  '',
  `In force from: ${inlineToMarkdown(inForceFrom, SITE_ORIGIN)} (one date for all five pages, in \`details.ts\` EFFECTIVE_DATE).`,
  '',
]

for (const doc of LEGAL_DOCS) {
  const placeholders = placeholdersIn(doc)
  const notes = notesIn(doc)
  lines.push(`### ${doc.title}`, '')
  lines.push(
    placeholders.length
      ? `Placeholders: ${placeholders.map((p) => `**${placeholderText(p)}**`).join(', ')}`
      : 'Placeholders: none'
  )
  lines.push('')
  if (notes.length) {
    lines.push('Reviewer notes:', '')
    for (const note of notes) {
      lines.push(`- *${note.where}:* ${inlineToMarkdown(note.text, SITE_ORIGIN)}`)
    }
  } else {
    lines.push('Reviewer notes: none')
  }
  lines.push('')
}

for (const doc of LEGAL_DOCS) {
  lines.push('---', '', legalDocToMarkdown(doc, options, 2))
}

const markdown = `${lines.join('\n').trimEnd()}\n`
const out = process.argv[2]

if (out) {
  writeFileSync(resolve(out), markdown)
  console.log(`Wrote ${LEGAL_DOCS.length} pages to ${resolve(out)}`)
} else {
  process.stdout.write(markdown)
}
