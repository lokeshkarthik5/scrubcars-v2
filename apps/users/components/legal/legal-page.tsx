import { Fragment } from 'react'
import Link from 'next/link'
import {
  type LegalBlock,
  type LegalDoc,
  isExternalHref,
  orTbc,
  parseInline,
  placeholderText,
} from '@/lib/legal/doc-format'
import { cn } from '@repo/core/utils'
import { BrandMark } from '@repo/ui/sc/brand-mark'
import { SiteFooter } from '@/components/marketing/sections'
import { EFFECTIVE_DATE, LAST_UPDATED, LEGAL_DRAFT } from '@/lib/legal/details'

/**
 * One legal page, rendered from its data (lib/legal/<page>.ts).
 *
 * A reading page rather than an app screen: a single ~70-character column
 * that is the same at 390px and on a laptop, generous line height, real
 * headings for the outline, and a print stylesheet (app/globals.css,
 * `.legal-doc`) that prints black on white, banner included, so a lawyer can
 * mark up a paper copy. Server-rendered and static; AppProvider lets these
 * routes through without waiting for the session.
 */

/**
 * Reviewer notes describe open gaps in the product (what is stored in plain
 * text, what a public endpoint still returns, what is not yet flagged), so
 * they are never part of a build: not production, and not a Vercel preview
 * either, which is a public URL too. They show only under `next dev`, for
 * whoever is editing the text; the lawyer reads them in the Markdown copy
 * (scripts/export-legal.ts), which always includes them.
 */
const SHOW_REVIEWER_NOTES = LEGAL_DRAFT && process.env.NODE_ENV === 'development'

const FOCUS_RING =
  'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-white'

const LINK_STYLE = cn(
  'font-medium text-text-primary underline decoration-white/30 underline-offset-[3px] transition-colors hover:decoration-white',
  FOCUS_RING
)

/** A string of inline markup as React nodes. */
function Inline({ text }: { text: string }) {
  return parseInline(text).map((node, index) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={index}>{node.text}</Fragment>
      case 'strong':
        return (
          <strong key={index} className="font-semibold text-text-primary">
            {node.text}
          </strong>
        )
      case 'tbc':
        return (
          <mark key={index} className="legal-tbc">
            {placeholderText(node.what)}
          </mark>
        )
      case 'link':
        if (node.href.startsWith('/')) {
          return (
            <Link key={index} href={node.href} className={LINK_STYLE}>
              {node.text}
            </Link>
          )
        }
        return isExternalHref(node.href) ? (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_STYLE}
          >
            {node.text}
          </a>
        ) : (
          // mailto: and tel: — the phone's own apps.
          <a key={index} href={node.href} className={LINK_STYLE}>
            {node.text}
          </a>
        )
    }
  })
}

/** A question for the lawyer: under `next dev` only, while LEGAL_DRAFT is true. */
export function ReviewerNote({ text }: { text: string }) {
  if (!SHOW_REVIEWER_NOTES) return null
  return (
    <aside
      aria-label="Reviewer note"
      data-reviewer-note
      className="legal-note my-5 rounded-lg border border-warning/40 bg-warning-muted px-4 py-3 text-[14px] leading-relaxed text-text-primary"
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-warning">
        Reviewer note
      </p>
      <p>
        <Inline text={text} />
      </p>
    </aside>
  )
}

function Table({ block }: { block: Extract<LegalBlock, { kind: 'table' }> }) {
  // Explicit roles: on a phone the CSS turns each row into a stacked card
  // (display: block), which drops a table's built-in semantics in some
  // browsers. The roles keep it a table for screen readers either way.
  return (
    <div className="my-6">
      <table role="table" className="legal-table w-full border-collapse text-left text-[14px] leading-relaxed">
        <caption className="mb-2 text-left text-[13px] font-medium text-text-muted">
          <Inline text={block.caption} />
        </caption>
        <thead role="rowgroup">
          <tr role="row">
            {block.head.map((head) => (
              <th
                key={head}
                role="columnheader"
                scope="col"
                className="border-b border-border px-3 py-2 align-bottom text-[12px] font-semibold uppercase tracking-[0.06em] text-text-muted"
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {block.rows.map((row, r) => (
            <tr key={r} role="row" className="border-b border-border">
              {row.map((value, c) => (
                <td
                  key={c}
                  role="cell"
                  data-label={block.head[c]}
                  className="px-3 py-3 align-top text-text-secondary"
                >
                  <Inline text={value} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case 'p':
      return (
        <p className="my-4">
          <Inline text={block.text} />
        </p>
      )
    case 'callout':
      return (
        <p className="legal-callout my-6 rounded-xl border border-border bg-surface px-4 py-4 text-text-primary">
          <Inline text={block.text} />
        </p>
      )
    case 'note':
      return <ReviewerNote text={block.text} />
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul'
      return (
        <List
          className={cn(
            'my-4 space-y-2.5 pl-5 marker:text-text-muted',
            block.ordered ? 'list-[lower-roman]' : 'list-disc'
          )}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              <Inline text={item} />
            </li>
          ))}
        </List>
      )
    }
    case 'table':
      return <Table block={block} />
  }
}

function DraftBanner() {
  return (
    <div
      role="note"
      data-legal-draft
      className="legal-draft border-b border-warning/40 bg-warning-muted px-4 py-3 text-center text-[13px] font-semibold text-warning"
    >
      Draft for legal review — not yet in force
    </div>
  )
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const effective = orTbc(EFFECTIVE_DATE, 'date this takes effect')

  return (
    <div className="legal-doc flex min-h-dvh flex-col bg-brand-black">
      {LEGAL_DRAFT && <DraftBanner />}

      <header className="legal-chrome border-b border-white/[0.06]">
        <div className="mx-auto flex h-16 w-full max-w-[70ch] items-center justify-between gap-4 px-4 lg:max-w-[1440px] lg:px-16 xl:px-20">
          <Link href="/" aria-label="Detlio home" className={FOCUS_RING}>
            <BrandMark height={26} priority />
          </Link>
          <Link
            href="/home"
            className={cn(
              'inline-flex h-10 items-center whitespace-nowrap rounded-lg border border-white/20 px-4 text-[14px] font-medium text-brand-white transition-colors hover:bg-white/[0.06]',
              FOCUS_RING
            )}
          >
            Book a service
          </Link>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-[70ch] flex-1 px-4 pt-10 pb-16 text-[15px] leading-[1.75] text-text-secondary sm:text-[16px]"
      >
        <h1 className="text-balance text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-text-primary sm:text-[40px]">
          {doc.title}
        </h1>
        <p className="mt-3 text-[13px] text-text-muted">
          Last updated: {LAST_UPDATED}
          {/* A separator on one line, a line break on a phone — never both,
              which would leave a "·" hanging at the end of the first line. */}
          <span aria-hidden className="hidden sm:inline">
            {' · '}
          </span>
          <br className="sm:hidden" />
          In force from: <Inline text={effective} />
        </p>

        {doc.intro.map((block, index) => (
          <Block key={index} block={block} />
        ))}

        {doc.toc && (
          <nav
            aria-label="On this page"
            className="legal-toc my-8 rounded-xl border border-border px-4 py-4"
          >
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              On this page
            </p>
            <ul className="space-y-1.5 text-[14px]">
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={LINK_STYLE}>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {doc.sections.map((section) => (
          <section key={section.id} aria-labelledby={section.id}>
            <h2
              id={section.id}
              className="mt-12 scroll-mt-6 text-[20px] font-semibold leading-snug tracking-[-0.01em] text-text-primary sm:text-[22px]"
            >
              {section.heading}
            </h2>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
            {section.subsections?.map((sub) => (
              <section key={sub.id} aria-labelledby={sub.id}>
                <h3
                  id={sub.id}
                  className="mt-8 scroll-mt-6 text-[17px] font-semibold text-text-primary"
                >
                  {sub.heading}
                </h3>
                {sub.blocks.map((block, index) => (
                  <Block key={index} block={block} />
                ))}
              </section>
            ))}
          </section>
        ))}
      </main>

      <div className="legal-chrome">
        <SiteFooter />
      </div>
    </div>
  )
}
