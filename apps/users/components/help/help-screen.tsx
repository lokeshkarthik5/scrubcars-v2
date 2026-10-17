'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconChevronDown, IconMessageReport, IconSearch } from '@tabler/icons-react'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { TopBar } from '@repo/ui/sc/top-bar'
import { SUPPORT_TEL_HREF, supportWhatsAppHref } from '@repo/core/support'
import { useDebounced } from '@repo/core/hooks/use-debounced'
import { CustomerShell } from '@/components/customer-shell'
import { countQuestions, searchHelp } from '@/lib/help-search'
import {
  HELP_DRAFT,
  HELP_GROUPS,
  HELP_INTRO,
  HELP_STILL_NEED,
  type HelpQuestion,
} from './content'

/**
 * The Help centre: the questions customers ask most, grouped, with a search
 * box, and a way to a person at the end. All the words are in ./content.ts.
 *
 * Each question is a native <details>, so it opens with a tap, a keyboard or
 * a screen reader without any script, and /help#<id> opens that one. While a
 * search is typed every match is shown open, since the answer is what was
 * looked for. No red here: nothing on this screen is the one main action.
 */
export function HelpScreen() {
  const [query, setQuery] = useState('')
  const searched = useDebounced(query, 150)
  const searching = searched.trim().length > 0
  const groups = searchHelp(HELP_GROUPS, searched)
  const found = countQuestions(groups)

  // /help#cancel opens that answer, once after the first paint (the hash is
  // not known on the server). The <details> is opened in place, as a tap
  // would, so React's state never has to know.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    const target = id ? document.getElementById(id) : null
    if (!(target instanceof HTMLDetailsElement)) return
    target.open = true
    target.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <CustomerShell showNav className="gap-4 py-4">
      <TopBar showBack title={HELP_INTRO.title} />

      {HELP_DRAFT && (
        <p
          role="note"
          data-help-draft
          className="rounded-[10px] border border-warning/40 bg-warning-muted px-3 py-2 text-[12px] font-medium text-warning"
        >
          Draft: these answers are waiting for sign-off.
        </p>
      )}

      <p className="text-[13px] leading-relaxed text-text-secondary">{HELP_INTRO.body}</p>

      <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5">
        <IconSearch size={18} aria-hidden="true" className="shrink-0 text-text-muted" />
        <input
          type="search"
          placeholder={HELP_INTRO.searchPlaceholder}
          aria-label={HELP_INTRO.searchLabel}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-6 flex-1 bg-transparent text-[13px] text-text-primary outline-none"
        />
      </div>

      {/* Said aloud as the list changes; seen only when nothing matched. */}
      <p aria-live="polite" className={found === 0 ? 'text-[13px] text-text-secondary' : 'sr-only'}>
        {!searching ? '' : found === 0 ? HELP_INTRO.noResults : `${found} answer${found === 1 ? '' : 's'} found`}
      </p>

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`help-${group.id}`}>
          <h2 id={`help-${group.id}`} className="mb-2 text-sm font-semibold text-text-primary">
            {group.title}
          </h2>
          <ScCard className="px-0 py-0">
            <ul className="divide-y divide-border">
              {group.questions.map((question) => (
                <li key={question.id}>
                  <Question
                    // Remounted when a search starts or ends, so each answer
                    // takes its open state from there, then the customer's taps.
                    key={`${question.id}:${searching}`}
                    question={question}
                    open={searching}
                  />
                </li>
              ))}
            </ul>
          </ScCard>
        </section>
      ))}

      <ScCard className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">{HELP_STILL_NEED.title}</h2>
          <p className="mt-1 text-[13px] text-text-secondary">{HELP_STILL_NEED.body}</p>
        </div>
        <ContactButtons
          who="Detlio support"
          callHref={SUPPORT_TEL_HREF}
          whatsAppHref={supportWhatsAppHref('Hi Detlio, I have a question.')}
        />
        {/* Stacked on a phone, so neither label wraps inside its button. */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <ScButtonLink variant="secondary" href={HELP_STILL_NEED.contact.href} className="flex-1">
            {HELP_STILL_NEED.contact.label}
          </ScButtonLink>
          <ScButtonLink variant="secondary" href={HELP_STILL_NEED.complaint.href} className="flex-1">
            <IconMessageReport size={18} aria-hidden />
            {HELP_STILL_NEED.complaint.label}
          </ScButtonLink>
        </div>
      </ScCard>
    </CustomerShell>
  )
}

function Question({ question, open }: { question: HelpQuestion; open: boolean }) {
  return (
    <details id={question.id} open={open} className="group scroll-mt-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[14px] font-medium text-text-primary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{question.q}</span>
        <IconChevronDown
          size={18}
          aria-hidden
          className="shrink-0 text-text-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-2 px-3.5 pb-3.5 text-[13px] leading-relaxed text-text-secondary">
        {question.a.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        {question.links && question.links.length > 0 && (
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {question.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-medium text-text-primary underline decoration-white/30 underline-offset-[3px] hover:decoration-white"
              >
                {link.label}
              </Link>
            ))}
          </p>
        )}
      </div>
    </details>
  )
}
