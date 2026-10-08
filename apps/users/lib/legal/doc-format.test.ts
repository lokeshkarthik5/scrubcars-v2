import { describe, expect, test } from 'bun:test'
import {
  duplicateIds,
  inlineToMarkdown,
  inlineToPlain,
  isExternalHref,
  type LegalDoc,
  legalDocToMarkdown,
  malformedTables,
  notesIn,
  orTbc,
  parseInline,
  placeholdersIn,
  tbc,
  toRoman,
} from './doc-format'

describe('placeholders', () => {
  test('a missing value becomes a named placeholder', () => {
    expect(orTbc(null, 'proprietor name')).toBe('{{tbc:proprietor name}}')
    expect(orTbc('  ', 'support hours')).toBe('{{tbc:support hours}}')
    expect(orTbc('ScrubCars', 'trade name')).toBe('ScrubCars')
  })

  test('braces cannot end the token early', () => {
    expect(parseInline(tbc('a}b'))).toEqual([{ type: 'tbc', what: 'ab' }])
  })
})

describe('parseInline', () => {
  test('text, bold, links and placeholders, in order', () => {
    expect(
      parseInline(`See **this**, the [Privacy Policy](/privacy) and ${tbc('court')}.`)
    ).toEqual([
      { type: 'text', text: 'See ' },
      { type: 'strong', text: 'this' },
      { type: 'text', text: ', the ' },
      { type: 'link', text: 'Privacy Policy', href: '/privacy' },
      { type: 'text', text: ' and ' },
      { type: 'tbc', what: 'court' },
      { type: 'text', text: '.' },
    ])
  })

  test('incomplete markup stays as text', () => {
    expect(parseInline('5 * 3 [not a link] **open')).toEqual([
      { type: 'text', text: '5 * 3 [not a link] **open' },
    ])
  })

  test('plain text and markdown copies', () => {
    const source = `Write to [us](mailto:a@b.in) by **${'today'}** at ${tbc('hours')}`
    expect(inlineToPlain(source)).toBe(
      'Write to us by today at [to be confirmed: hours]'
    )
    expect(inlineToMarkdown('[Terms](/terms)', 'https://detlio.com')).toBe(
      '[Terms](https://detlio.com/terms)'
    )
    expect(inlineToMarkdown(tbc('hours'), 'https://x')).toBe(
      '**[to be confirmed: hours]**'
    )
  })

  test('only http(s) links leave the site', () => {
    expect(isExternalHref('https://razorpay.com')).toBe(true)
    expect(isExternalHref('/terms')).toBe(false)
    expect(isExternalHref('mailto:a@b.in')).toBe(false)
  })
})

const DOC: LegalDoc = {
  path: '/x',
  title: 'Example',
  description: 'An example.',
  toc: true,
  intro: [{ kind: 'p', text: `Run by ${tbc('proprietor name')}.` }],
  sections: [
    {
      id: 'one',
      heading: 'One',
      blocks: [
        { kind: 'note', text: 'Decide this.' },
        {
          kind: 'table',
          caption: 'Cases',
          head: ['Who', 'What'],
          rows: [
            ['You | me', `**Full** refund at ${tbc('court')}`],
            ['Odd row'],
          ],
        },
      ],
      subsections: [
        {
          id: 'one',
          heading: 'Sub',
          blocks: [
            { kind: 'list', items: ['a', tbc('proprietor name')], ordered: true },
            { kind: 'note', text: 'And this.' },
          ],
        },
      ],
    },
  ],
}

describe('reading a document', () => {
  test('placeholders are listed once each, in reading order', () => {
    expect(placeholdersIn(DOC)).toEqual(['proprietor name', 'court'])
  })

  test('notes say where they are', () => {
    expect(notesIn(DOC)).toEqual([
      { where: 'One', text: 'Decide this.' },
      { where: 'One › Sub', text: 'And this.' },
    ])
  })

  test('duplicate anchors and ragged tables are caught', () => {
    expect(duplicateIds(DOC)).toEqual(['one'])
    expect(malformedTables(DOC)).toEqual(['Cases #2'])
  })
})

describe('toRoman', () => {
  test('the numerals a content-rules list needs', () => {
    expect([1, 2, 3, 4, 5, 9, 10, 11, 14, 40, 90].map(toRoman)).toEqual([
      'i', 'ii', 'iii', 'iv', 'v', 'ix', 'x', 'xi', 'xiv', 'xl', 'xc',
    ])
  })

  test('nothing for zero, negatives or fractions', () => {
    expect(() => toRoman(0)).toThrow()
    expect(() => toRoman(-1)).toThrow()
    expect(() => toRoman(1.5)).toThrow()
  })
})

describe('legalDocToMarkdown', () => {
  const options = { origin: 'https://detlio.com', lastUpdated: '5 October 2026' }

  test('draft copy carries notes, placeholders and escaped table cells', () => {
    const md = legalDocToMarkdown(DOC, { ...options, draft: true }, 2)
    expect(md).toContain('## Example')
    expect(md).toContain('*https://detlio.com/x · Last updated: 5 October 2026*')
    expect(md).toContain('### One')
    expect(md).toContain('#### Sub')
    expect(md).toContain('> **Reviewer note:** Decide this.')
    expect(md).toContain('| You \\| me | **Full** refund at **[to be confirmed: court]** |')
    expect(md).toContain('| --- | --- |')
    // Numbered as the page numbers them (lower-roman), not 1. 2. 3.
    expect(md).toContain('- (i) a\n- (ii) **[to be confirmed: proprietor name]**')
  })

  test('the in-force date prints when given, as a placeholder until set', () => {
    const md = legalDocToMarkdown(DOC, {
      ...options,
      draft: true,
      inForceFrom: orTbc(null, 'date this takes effect'),
    })
    expect(md).toContain(
      '*https://detlio.com/x · Last updated: 5 October 2026 · In force from: **[to be confirmed: date this takes effect]***'
    )
  })

  test('final copy leaves the notes out', () => {
    const md = legalDocToMarkdown(DOC, { ...options, draft: false })
    expect(md).not.toContain('Reviewer note')
    expect(md.startsWith('# Example')).toBe(true)
  })
})
