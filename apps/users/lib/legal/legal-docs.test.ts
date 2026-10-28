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
import { BOOKING_DRAFT_KEY } from '@repo/core/booking-draft'
import { cardClosesKey } from '@repo/core/area-signups'
import { CLIENT_EVENTS } from '@repo/core/analytics-events'
import { META_EVENT_NAMES, metaEventFor, pixelExcluded } from '../meta-pixel'
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

describe('medals (0063)', () => {
  const terms = LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.terms)!

  test('the Terms say what Bronze, Silver and Gold mean, and that garages cannot pay for one', () => {
    const text = markdownOf(terms)
    expect(text).toContain('Bronze, Silver or Gold medal')
    expect(text).toContain('accepted Detlio\'s garage agreement')
    expect(text).toContain('garages cannot pay for one')
    expect(text).toContain('"Silver & above" filter only narrows the list')
  })

  test('no public text names the badges the medals replaced', () => {
    for (const doc of LEGAL_DOCS) {
      const text = markdownOf(doc).toLowerCase()
      expect(text).not.toContain('documents verified')
      expect(text).not.toContain('detlio certified')
      expect(text).not.toContain('certified only')
    }
  })
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
    if (BUSINESS.printProprietorName && BUSINESS.proprietorName == null) {
      expect(placeholdersIn(contact)).toContain("the proprietor's full name")
    }
    if (!BUSINESS.printProprietorName) {
      // Not printed by the owner's choice: no name and no placeholder for it.
      expect(placeholdersIn(contact)).not.toContain("the proprietor's full name")
      expect(markdownOf(contact)).toContain('a sole proprietorship')
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
    expect(text).toContain(BOOKING_DRAFT_KEY)
    // The free-wash card's × (customer reach, part 2), per area.
    expect(text).toContain(cardClosesKey('<area>'))
  })

  // Customer reach, part 2 (0062): what a request, a sign-up and a
  // recommendation keep, and how long, are in the policy.
  test('requests, free-wash sign-ups and recommendations are declared', () => {
    const text = privacy()
    expect(text).toContain('Requests to a garage just outside its area')
    expect(text).toContain('Free-wash sign-ups')
    expect(text).toContain('Garages you recommend')
    expect(text).toContain('We do not send WhatsApp messages yet')
  })

  // A guest's booking kept on the phone (0062) holds their address: the
  // policy says it goes at log out, and both ways of logging out do it.
  test('the booking kept on the phone is removed at log out, as the policy says', () => {
    const read = (path: string) => readFileSync(join(import.meta.dir, path), 'utf8')
    expect(privacy()).toContain('Deleted when you book, tap × on it or log out')
    for (const path of ['../../app/profile/page.tsx', '../../components/providers/app-provider.tsx']) {
      expect(read(path)).toContain('clearBookingDraft()')
    }
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
  const read = (path: string) => readFileSync(join(import.meta.dir, path), 'utf8')
  const layout = read('../../app/layout.tsx')
  const component = read('../../components/meta-pixel.tsx')
  const lib = read('../meta-pixel.ts')
  const privacy = () => markdownOf(LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.privacy)!)
  const metaSection = () => {
    const sharing = LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.privacy)!.sections.find(
      (section) => section.id === 'sharing'
    )!
    return sharing.subsections!.find((sub) => sub.id === 'meta')!
  }

  /** The Meta event names section 4 lists: "**Name**: …" items. */
  const listedEvents = () =>
    metaSection()
      .blocks.flatMap((block) => (block.kind === 'list' ? block.items : []))
      .flatMap((item) => {
        const match = /^\*\*([A-Za-z]+)\*\*:/.exec(item)
        return match ? [match[1]] : []
      })

  /** Every event name the code can send: the mapping, and each direct call. */
  const sentEvents = () => {
    const mapped = CLIENT_EVENTS.flatMap((name) => {
      const meta = metaEventFor({
        name,
        props: { vendorId: 'v', category: 'detailing', serviceCount: 1, source: 'typed' },
      })
      return meta ? [meta.name] : []
    })
    const direct = [...`${component}\n${lib}`.matchAll(/sendToMeta\(\s*'track(?:Custom)?',\s*'(\w+)'/g)].map(
      (match) => match[1]
    )
    return new Set([...mapped, ...direct])
  }

  // If the code starts (or stops) sending an event, section 4 has to change
  // with it: this fails until it does.
  test('the events the code can send are exactly the ones the policy lists', () => {
    const listed = listedEvents()
    expect(listed.length).toBeGreaterThan(5)
    expect(new Set(listed).size).toBe(listed.length)
    expect(sentEvents()).toEqual(new Set(listed))
    expect(new Set<string>(META_EVENT_NAMES)).toEqual(new Set(listed))
  })

  test('every event goes through the one consent-gated sender', () => {
    // No fbq call outside lib/meta-pixel.ts's installPixel and sendToMeta.
    expect(component).not.toMatch(/fbq\??\.?\(/)
    expect(component).not.toMatch(/<noscript[ >]/)
    const sends = [...lib.matchAll(/fbq\(\s*(method|'(?:track|trackCustom|init|set)')/g)].map((m) => m[1])
    expect(new Set(sends)).toEqual(new Set(['method', "'set'", "'init'"]))
    const sender = lib.slice(lib.indexOf('export function sendToMeta('))
    expect(sender.replace(/\s+/g, ' ')).toContain(
      "{ try { if ( typeof window === 'undefined' || !marketingAllowed() || currentPageExcluded() ) return"
    )
    // The Pixel only starts once consent allows marketing (Allow, or the
    // first banner's marketing yes).
    expect(component).toContain('allowsMarketing(')
    expect(layout).toContain('<MetaPixel />')
    expect(layout).toContain('<ConsentBanner />')
  })

  test('the policy says it is consent-gated and how to change the choice', () => {
    const text = privacy()
    expect(text).toContain('### Meta (Facebook and Instagram), for our ads')
    expect(text).toContain('**The pixel runs only if you allow marketing cookies.**')
    expect(text).toContain('Until you choose Allow, Meta\'s code is not loaded and nothing is sent to Meta.')
    expect(text).toContain('Global Privacy Control turned on, we treat that as "Only essential"')
    expect(text).toContain('**Changing your choice.** Tap **Cookie settings**')
    expect(text).toContain('| detlio_consent (cookie) |')
    expect(text).toContain('including moving from screen to screen inside the app')
    expect(text).toContain('on its servers outside India')
    expect(text).not.toContain('Every page of detlio.com loads the **Meta Pixel**')
  })

  test('the Conversions API report of a paid booking is declared', () => {
    const text = privacy()
    expect(text).toContain('**A paid booking is also sent from our server.**')
    expect(text).toContain('through Meta\'s Conversions API')
    expect(text).toContain('your IP address, details of your browser, and the _fbp and _fbc cookies. Never your name, mobile number or address.')
  })

  test('the cookies it sets are declared', () => {
    const text = privacy()
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
  // lib/meta-request-shield.ts cuts every address Meta gets to origin +
  // path (0061); the policy must say the query string is not sent.
  test('what the page address carries is spelled out: never what comes after "?"', () => {
    const text = privacy()
    expect(text).toContain('the web address (URL) of the page, without anything after "?" or "#"')
    expect(text).toContain('but not the services you picked, a promo code or your address')
    expect(text).toContain('the address of the page you came from, likewise without anything after "?" or "#"')
    expect(text).toContain('We have not set it up to send your name, mobile number, address or car')
    expect(text).not.toContain('can include a promo code')
    expect(lib).toContain('shieldMetaRequests(window')
    expect(text).not.toContain('or what you booked')
    // The booking page's parameters no longer reach Meta (0061), and the
    // note says so.
    expect(text).toContain('?celebrate=1')
    expect(text).toContain('?rate=N')
    expect(text).not.toContain('On a booking\'s pages it carries the booking\'s reference number')
  })

  // pixelExcluded keeps the Pixel off pages whose address holds a booking's
  // or a car's id or an invite code (0061); the policy must say so.
  test('the pages it stays off are named, booking and car pages included', () => {
    const text = privacy()
    expect(text).toContain('nor on a booking\'s pages or a car\'s pages in your account')
    expect(text).toContain('a friend\'s invite')
    expect(pixelExcluded('/bookings/2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10', null)).toBe(true)
    expect(pixelExcluded('/invite/RAVI2026', null)).toBe(true)
  })

  test('the Purchase event id is said to be hashed, and the code hashes it', () => {
    const text = privacy()
    expect(text).toContain('an event ID made from a scrambled (hashed) form of the booking\'s ID, which does not reveal it')
    expect(text).not.toContain('an event ID made from the booking\'s ID, so that')
    expect(lib).toContain('eventID = await purchaseEventId(input.bookingId)')
  })

  test("the lawyer's questions are on the page while it is a draft", () => {
    const text = privacy()
    expect(text).toContain('**Consent (DPDP).**')
    expect(text).toContain('**Which pages the pixel runs on.**')
    expect(text).toContain('**Meta requires this notice.**')
    expect(text).toContain('**Settings in Meta\'s Events Manager.**')
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

describe('Microsoft Clarity', () => {
  const read = (path: string) => readFileSync(join(import.meta.dir, path), 'utf8')
  const layout = read('../../app/layout.tsx')
  const component = read('../../components/clarity.tsx')
  const banner = read('../../components/consent/consent-banner.tsx')
  const privacy = () => markdownOf(LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.privacy)!)

  test('it loads only with a project id and Allow, and is mounted', () => {
    expect(layout).toContain('<Clarity />')
    expect(component).toContain('const active = projectId !== null && allowed && !hidden')
    expect(component).toContain('allowsAnalytics(')
    expect(component).toContain('pixelExcluded(')
  })

  test('the banner asks one question for analytics and marketing, and its Allow says so', () => {
    expect(banner).toContain('Allow analytics and')
    expect(banner).toContain("saveConsent('all')")
    expect(banner).not.toContain("saveConsent('marketing')")
  })

  test('the policy has a Clarity section: consent, what is hidden, cookies, where', () => {
    const text = privacy()
    expect(text).toContain('### Microsoft Clarity, to see how our website is used')
    expect(text).toContain('**Clarity runs only if you allow analytics and marketing cookies**')
    expect(text).toContain('Clarity does not record what you type into any box')
    expect(text).toContain('your mobile number and sign-in code, your name, your saved addresses, your car\'s number plate')
    expect(text).toContain('| _clck (cookie, set by Microsoft Clarity) |')
    expect(text).toContain('| _clsk (cookie, set by Microsoft Clarity) |')
    expect(text).toContain('Microsoft and Meta receive what Clarity and the pixel send (section 4) on their servers outside India')
    expect(text).toContain('**Microsoft Clarity (new, 0061).**')
  })

  // The policy promises these are hidden; each place that shows or takes
  // one carries Clarity's mask attribute.
  test('the fields and areas the policy says are hidden carry data-clarity-mask', () => {
    const MASK = 'data-clarity-mask="true"'
    for (const path of [
      '../../../../packages/ui/src/sc/phone-input.tsx',
      '../../../../packages/ui/src/sc/otp-input.tsx',
      '../../app/profile-setup/page.tsx',
      '../../app/profile/page.tsx',
      '../../components/add-address-sheet.tsx',
      '../../app/book/[vendorId]/page.tsx',
      '../../components/checkout/checkout-sign-in.tsx',
      // Customer reach, part 2: the request's car and address, and a
      // recommended garage's link, phone and note.
      '../../components/reach/request-sheet.tsx',
      '../../components/reach/free-wash.tsx',
      '../../components/coupons/coupon-code-box.tsx',
      '../../components/gifts/redeem-code-box.tsx',
      '../../app/profile/gifts/new/page.tsx',
      '../../components/complaints/raise-complaint-sheet.tsx',
      '../../components/bypass/report-bypass-sheet.tsx',
    ]) {
      expect(`${path}: ${read(path).includes(MASK)}`).toBe(`${path}: true`)
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
    '/privacy#12': 'garage-staff',
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

// Add garage's "Import from a form or poster" sends a garage's onboarding
// documents to OpenAI (apps/server/src/lib/ai.ts, DocumentClient). The
// policy says so where garage partners read it, and names the provider.
describe('garage onboarding documents', () => {
  const ai = readFileSync(new URL('../../../server/src/lib/ai.ts', import.meta.url), 'utf8')
  const privacy = () => markdownOf(LEGAL_DOCS.find((doc) => doc.path === LEGAL_PATHS.privacy)!)

  test('may be read by an AI provider outside India, kept by Detlio nowhere, as the import does', () => {
    expect(ai).toContain('export function openAiDocumentClient')
    const text = privacy()
    expect(text).toContain(
      'these documents may be processed by our service providers, including an AI provider outside India (OpenAI, section 4)'
    )
    // Detlio keeps nothing, but OpenAI may hold inputs a while for abuse
    // monitoring even with store: false, so the policy must not say the
    // files are stored nowhere.
    expect(text).toContain(
      'Detlio does not keep the files. Our AI provider may keep them for a short period under its own terms, and does not use them to train its models.'
    )
    expect(text).not.toContain('read once and not stored')
    expect(text).toContain('Sentry, Telegram and OpenAI) may process data on servers outside India')
    expect(ai.match(/store: false/g)?.length).toBe(2)
    expect(text).toContain('| OpenAI |')
  })

  test("the lawyer's question is on the page while it is a draft", () => {
    expect(privacy()).toContain('**Garage documents read by AI.**')
  })
})
