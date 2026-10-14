/**
 * The five legal pages, checked as data: well-formed, linked to each other
 * correctly, and saying what the code enforces. The renderer and the
 * Markdown export are tested in packages/core/src/legal-doc.test.ts; the
 * pages in a browser in apps/e2e/specs/users/legal-pages.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
import { PENDING_CHECKOUT_STORAGE_KEY } from '@repo/core/stores/pending-checkout-store'
import { TIP_HIDDEN_KEY } from '../home-hub'
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

describe('what the Home hub keeps', () => {
  const privacy = () => markdownOf(LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.privacy)!)

  test('the read state and the dismissals are declared, and go with the account', () => {
    const text = privacy()
    expect(text).toContain('When you last opened Updates')
    expect(text).toContain('"Rate your wash"')
    expect(text).toContain('deleted with your account')
    expect(text).toContain('How often you want each car washed')
  })

  test('the storage table names the keys the app writes', () => {
    const text = privacy()
    expect(text).toContain(PENDING_CHECKOUT_STORAGE_KEY)
    expect(text).toContain(TIP_HIDDEN_KEY)
  })

  // Matching is declared ahead of the switch: the policy says what it would
  // use, and that it starts only when this text takes effect. The release
  // that turns HOME_OFFER_TARGETING on publishes this text.
  test('matched offers: every audience the server knows is declared, and when it starts', () => {
    const text = privacy()
    expect(text).toContain('### Offers on Home')
    // One line per audience in apps/server/src/lib/offers.ts (HOME_AUDIENCE_LABELS).
    expect(text).toContain('have not paid for a booking on Detlio yet') // new_customers
    expect(text).toContain('have paid for a booking with that garage before') // booked_this_garage
    expect(text).toContain('are near the garage') // near_this_garage
    expect(text).toContain('have a wash due within the next 2 days, or overdue') // wash_due
    expect(text).toContain('own a particular size of car') // car_type
    // Home sends a rounded location and keeps none of it.
    expect(text).toContain('Home does not save it')
    // What it is for, and what it is not.
    expect(text).toContain('This only decides which offers you see on Home')
    expect(text).toContain('**Matching starts only when this version of the policy takes effect.**')
    // Without a car, garages' codes stay hidden whatever the switch says.
    expect(text).toContain('Offers from a single garage are hidden until you save a car')
    // How to ask for general offers only; there is no setting in the app.
    expect(text).toContain('If you would rather see only the offers shown to everyone, tell us (section 9).')
    expect(text).toContain('There is no setting for this in the app.')
    // Even with matching off, offers are not the same for everyone: no car,
    // closed with ×, or used up all hide one (offerSkipReason).
    expect(text).not.toContain('every signed-in customer sees the same offers')
    expect(text).toContain('apart from garages\' offers until you save a car, and any you have closed or used up')
  })

  // The ranking is a disclosure under the E-Commerce Rules, so both pages
  // name the whole order offerTier uses, Detlio's own codes included.
  test('both pages give the whole matched order, with Detlio\'s own offers in their place', () => {
    const order =
      'offers from garages you have booked, then from garages near you, then Detlio\'s own offers, then other garages\' offers'
    expect(privacy()).toContain(order)
    expect(markdownOf(LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.terms)!)).toContain(order)
  })
})

describe('the Meta Pixel', () => {
  const layout = readFileSync(join(import.meta.dir, '../../app/layout.tsx'), 'utf8')
  const pixel = readFileSync(join(import.meta.dir, '../../components/meta-pixel.tsx'), 'utf8')
  const privacy = () => markdownOf(LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.privacy)!)

  // If the pixel is ever moved off some pages, or removed, the policy's
  // section 4 has to change with it: this fails until it does.
  test('is mounted on every customer page and sends only page views, as the policy says', () => {
    expect(layout).toContain('<MetaPixel />')
    const events = [...pixel.matchAll(/fbq\??\.?\(\s*'track',\s*'(\w+)'/g)].map((match) => match[1])
    expect(new Set(events)).toEqual(new Set(['PageView']))
    const text = privacy()
    expect(text).toContain('### Meta (Facebook and Instagram), for our ads')
    expect(text).toContain('Every page of detlio.com loads the **Meta Pixel**')
    expect(text).toContain('including moving from screen to screen inside the app')
    expect(text).toContain('on its servers outside India')
  })

  test('the pages it sends and the cookies it sets are declared', () => {
    const text = privacy()
    expect(text).toContain('The pages you open on detlio.com, with your IP address')
    expect(text).toContain('| _fbp (cookie, set by Meta\'s pixel) |')
    expect(text).toContain('| _fbc (cookie, set by Meta\'s pixel) |')
    // Meta adds its click ID to most links out of Facebook and Instagram,
    // not only to ads, so the row cannot say "only our ads".
    expect(text).toContain('set when you arrive from a link on Facebook or Instagram (including our ads)')
    expect(text).not.toContain('set only when you arrive by tapping one of our ads')
    expect(text).toContain('_fbp, and _fbc if it is set')
  })

  // The address Meta gets is the whole URL, query included. These are the
  // parameters the app itself puts there (garage page and book-again for
  // checkout; the booking page reads then, rate and celebrate).
  test('what the page address carries is spelled out, and nothing says booking details stay out', () => {
    const text = privacy()
    expect(text).toContain('the services you picked (by reference number) and whether the visit is at your door')
    expect(text).toContain('that you have just paid for it, that you have a bill to pay, or the star rating you tapped on Home')
    expect(text).toContain('Apart from what the page address shows, we have not set it up to send your name, mobile number or car.')
    expect(text).not.toContain('or what you booked')
    expect(text).toContain('?celebrate=1')
    expect(text).toContain('?rate=N')
  })

  test("the lawyer's questions are on the page while it is a draft", () => {
    const text = privacy()
    expect(text).toContain('**Consent before the pixel loads (DPDP).**')
    expect(text).toContain('**Which pages the pixel runs on.**')
    expect(text).toContain('**Meta requires this notice.**')
  })

  test('nothing says Detlio does no tracking, advertising or analytics', () => {
    for (const doc of LEGAL_DOCS) {
      const text = inlineToPlain(markdownOf(doc)).toLowerCase()
      expect(text).not.toMatch(/\bno (advertising|analytics|tracking)\b/)
      expect(text).not.toMatch(/\b(do|does) not (use )?(advertising|analytics|track)/)
      expect(text).not.toMatch(/track you across/)
      expect(text).not.toMatch(/nothing is used for marketing/)
    }
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
    '/privacy#5': 'storage',
    '/privacy#7': 'retention',
    '/privacy#8': 'security',
    '/privacy#9': 'rights',
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
