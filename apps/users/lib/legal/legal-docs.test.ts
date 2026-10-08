/**
 * The five legal pages, checked as data: well-formed, linked to each other
 * correctly, and saying what the code enforces. The renderer and the
 * Markdown export are tested in packages/core/src/legal-doc.test.ts; the
 * pages in a browser in apps/e2e/specs/users/legal-pages.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import {
  duplicateIds,
  inlineToPlain,
  type LegalBlock,
  type LegalDoc,
  legalDocToMarkdown,
  malformedTables,
  parseInline,
  placeholdersIn,
} from './doc-format'
import { customerRefundLine } from '@repo/core/refunds'
import { SUPPORT_PHONE_DISPLAY } from '@repo/core/support'
import { RULES } from './common'
import { BUSINESS, LEGAL_DRAFT } from './details'
import { LEGAL_DOCS } from './index'
import { LEGAL_LINKS, LEGAL_PATHS, LEGAL_ROUTES } from './routes'

const markdownOf = (doc: (typeof LEGAL_DOCS)[number]) =>
  legalDocToMarkdown(doc, { origin: '', draft: true, lastUpdated: 'x' })

/** Every link target in a document, from its Markdown (origin left empty). */
const hrefsIn = (doc: (typeof LEGAL_DOCS)[number]) =>
  markdownOf(doc)
    .split('\n')
    .flatMap((line) => parseInline(line))
    .flatMap((node) => (node.type === 'link' ? [node.href] : []))

describe('the five pages', () => {
  test('one per legal path, in footer order', () => {
    expect(LEGAL_DOCS.map((doc) => doc.path)).toEqual(LEGAL_LINKS.map((l) => l.href))
    expect([...LEGAL_ROUTES].sort()).toEqual(Object.values(LEGAL_PATHS).sort())
  })

  for (const doc of LEGAL_DOCS) {
    describe(doc.path, () => {
      test('anchor ids are unique and every table row is complete', () => {
        expect(duplicateIds(doc)).toEqual([])
        expect(malformedTables(doc)).toEqual([])
      })

      test('a plain meta description', () => {
        expect(doc.description.length).toBeGreaterThan(40)
        expect(doc.description.length).toBeLessThanOrEqual(170)
        expect(doc.description).not.toMatch(/\*\*|\[|\{\{/)
      })

      test('links go to another legal page, the home page, or off the site', () => {
        const internal = hrefsIn(doc).filter((href) => href.startsWith('/'))
        for (const href of internal) {
          expect(['/', ...LEGAL_ROUTES]).toContain(href)
        }
      })

      test('never mentions internal-only tooling', () => {
        const text = markdownOf(doc).toLowerCase()
        expect(text).not.toContain('bypass')
        expect(text).not.toContain('test number')
        expect(text).not.toContain('cron-job')
      })

      test('no promise the product cannot back', () => {
        const text = markdownOf(doc).toLowerCase()
        // Saying Detlio gives no guarantee is fine (Refund Policy section 9);
        // promising one is not.
        expect(text).not.toMatch(/\bwe guarantee|\bguaranteed\b|\bcertified|\bverified garage/)
        expect(text).not.toMatch(/automatically (cancel|refund)/)
      })
    })
  }
})

describe('business details', () => {
  const contact = LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.contact)!

  test('the Contact page carries the address, phone, email and grievance officer', () => {
    const text = markdownOf(contact)
    expect(text).toContain(BUSINESS.address)
    expect(text).toContain(BUSINESS.email)
    expect(text).toContain(SUPPORT_PHONE_DISPLAY)
    expect(text).toContain('Grievance Officer')
  })

  test('an unconfirmed detail is a visible placeholder, never left blank', () => {
    if (BUSINESS.proprietorName == null) {
      expect(placeholdersIn(contact)).toContain("the proprietor's full name")
    }
    if (BUSINESS.supportHours == null) {
      expect(placeholdersIn(contact)).toContain('support hours')
    }
  })

  test('draft notes are present while the pages are drafts', () => {
    if (!LEGAL_DRAFT) return
    const notes = LEGAL_DOCS.flatMap((doc) =>
      markdownOf(doc).split('\n').filter((line) => line.startsWith('> **Reviewer note:**'))
    )
    expect(notes.length).toBeGreaterThan(10)
  })
})

describe('booking rules read from the code', () => {
  test('the figures the pages print', () => {
    expect(RULES.noticeAtGarage).toBe('1 hour')
    expect(RULES.noticeDoorstep).toBe('3 hours')
    expect(RULES.changeCutoff).toBe('2 hours')
    expect(RULES.refundDays).toBe('5–7 working days')
    expect(RULES.receiptLine).toBe('This is a payment receipt, not a tax invoice.')
    expect(RULES.maxReschedules).toBe(2)
    expect(RULES.daysAhead).toBe(7)
    expect(RULES.photosPerStage).toBe(6)
    expect(RULES.photosFrozenAfterDays).toBe(7)
    expect(RULES.finalBillWindowDays).toBe(3)
    expect(RULES.checkoutMinutes).toBe(30)
  })

  test('the refund policy quotes the booking page word for word', () => {
    const refunds = markdownOf(LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.refunds)!)
    const owed = customerRefundLine({ status: 'owed', amount: 0, amountRefunded: 0 })
    expect(owed).toStartWith('Our team will refund your payment')
    expect(refunds).toContain(`"${owed}"`)
  })

  test('the refund policy covers the customer no-show and the cutoff', () => {
    const refunds = markdownOf(LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.refunds)!)
    expect(refunds).toContain('**You do not turn up**')
    expect(refunds).toContain('**No refund**')
    expect(refunds).toContain(`at least ${RULES.changeCutoff} before the slot`)
    expect(refunds).toContain(RULES.refundDays)
  })
})

/**
 * "section N" in the text, wherever it points: a bare "section N" is the
 * same page; "section N of our <link>" and "Terms section N" another page.
 * Each must reach the section it was written about, so renumbering a page
 * fails here rather than leaving a reference pointing at the wrong heading.
 * A new reference is added to EXPECTED with the section it means.
 */
describe('section references', () => {
  const EXPECTED: Record<string, string> = {
    '/terms#7': 'inspection',
    '/terms#10': 'garage-work',
    '/terms#11': 'problems',
    '/terms#12': 'job-photos',
    '/terms#14': 'content-rules',
    '/terms#15': 'suspension',
    '/terms#6': 'cancellations',
    '/privacy#2': 'what-we-collect',
    '/privacy#3': 'what-we-dont',
    '/privacy#4': 'sharing',
    '/privacy#7': 'retention',
    '/privacy#8': 'security',
    '/privacy#13': 'changes',
    '/privacy#14': 'contact',
    '/refund-policy#1': 'every-case',
    '/refund-policy#6': 'payment-problems',
    '/refund-policy#8': 'deficient',
  }

  const titleToPath = new Map(LEGAL_DOCS.map((doc) => [doc.title, doc.path]))

  const textsOf = (blocks: LegalBlock[]): string[] =>
    blocks.flatMap((block) => {
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

  const allTexts = (doc: LegalDoc) => [
    ...textsOf(doc.intro),
    ...doc.sections.flatMap((section) => [
      ...textsOf(section.blocks),
      ...(section.subsections ?? []).flatMap((sub) => textsOf(sub.blocks)),
    ]),
  ]

  const REF = /\b(Terms )?section (\d+)(?: of our ([A-Z][A-Za-z &]+?(?:Use|Policy)))?\b/g

  const refs = LEGAL_DOCS.flatMap((doc) =>
    allTexts(doc).flatMap((text) =>
      [...inlineToPlain(text).matchAll(REF)].map((match) => {
        const target = match[3]
          ? titleToPath.get(match[3])
          : match[1]
            ? LEGAL_PATHS.terms
            : doc.path
        return { from: doc.path, key: `${target}#${match[2]}`, quote: match[0] }
      })
    )
  )

  test('there are references to check', () => {
    expect(refs.length).toBeGreaterThan(10)
  })

  for (const ref of refs) {
    test(`${ref.from}: "${ref.quote}" → ${ref.key}`, () => {
      const expected = EXPECTED[ref.key]
      expect(expected, `add ${ref.key} to EXPECTED with the section it means`).toBeDefined()
      const [path, n] = ref.key.split('#')
      const doc = LEGAL_DOCS.find((d) => d.path === path)!
      const section = doc.sections.find((s) => s.heading.startsWith(`${n}. `))
      expect(section?.id).toBe(expected)
    })
  }
})
