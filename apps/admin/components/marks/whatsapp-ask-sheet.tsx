'use client'

import { useState } from 'react'
import {
  IconCheck,
  IconExternalLink,
  IconBrandWhatsapp,
  IconX,
} from '@tabler/icons-react'
import { useAdminMe } from '@repo/core/api/hooks/use-admin-logins'
import {
  useDeleteMark,
  useMarkAsked,
  useUpdateMark,
} from '@repo/core/api/hooks/use-admin-marks'
import {
  MISSING_KEYS,
  MISSING_LABELS,
  type MissingKey,
} from '@repo/core/onboarding-marks'
import { cn } from '@repo/core/utils'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScSheet } from '@repo/ui/sc/modal'
import { scButtonClass } from '@repo/ui/sc/button'
import {
  askHref,
  askMessage,
  askPhone,
  askedUndoSteps,
  displayPhone,
  ownerFirstName,
  thingsCount,
  type AskVendor,
  type UndoStep,
} from '@/lib/onboarding-marks'
import { MarksOverlay, markErrorText } from './mark-popover'

interface CardState {
  /** The missing things this message asks for (ticked). */
  keys: MissingKey[]
  /** The admin's own words, once they change the message. */
  edited: string | null
  markAsked: boolean
  /** Opened in WhatsApp (or confirmed as asked without it). */
  opened: boolean
  /** Marked Asked: how many marks, and how to take that back. */
  marked: { count: number; undo: UndoStep[] } | null
  working: boolean
  error: string | null
}

const initialCard = (vendor: AskVendor): CardState => ({
  keys: MISSING_KEYS.filter((key) => vendor.missing?.includes(key)),
  edited: null,
  markAsked: true,
  opened: false,
  marked: null,
  working: false,
  error: null,
})

/**
 * "Ask on WhatsApp" for the ticked garages: one card per garage with the
 * owner's number, what to ask for (ticked from what it misses) and the
 * message, which the admin can change. Each card has its own "Open in
 * WhatsApp" link, since a browser blocks all but one pop-up per click; the
 * footer's "Open next" is the same link for the next card. With "Mark these
 * as Asked today" ticked, opening the link (or confirming, for a garage with
 * no WhatsApp number) marks them; nothing is marked before that, and Undo
 * puts the marks back.
 */
export function WhatsAppAskSheet({
  open,
  vendors,
  onClose,
}: {
  open: boolean
  vendors: AskVendor[]
  onClose: () => void
}) {
  return (
    <MarksOverlay>
      <ScSheet
        open={open}
        onClose={onClose}
        aria-label={`Ask on WhatsApp · ${vendors.length} garage${vendors.length === 1 ? '' : 's'}`}
        className={cn(
          // A phone: a bottom sheet. A laptop: a panel down the right side
          // (mockup 06, panel 3), the table still in view beside it.
          'flex max-w-[640px] flex-col overflow-hidden pb-0',
          'md:ml-auto md:h-dvh md:max-h-none md:w-[560px] md:max-w-[560px] md:self-stretch md:rounded-bl-[22px] md:rounded-tr-none md:border-l md:border-t-0',
          'md:[&.sheet-in]:animate-[motion-fade-in_var(--motion-base)_ease-out_both]'
        )}
        showHandle={false}
      >
        <AskCards vendors={vendors} onClose={onClose} />
      </ScSheet>
    </MarksOverlay>
  )
}

function AskCards({
  vendors,
  onClose,
}: {
  vendors: AskVendor[]
  onClose: () => void
}) {
  const { data: me } = useAdminMe()
  const signedAs = me?.name ?? ''
  const markAsked = useMarkAsked()
  const removeMark = useDeleteMark()
  const updateMark = useUpdateMark()
  const [cards, setCards] = useState<Record<string, CardState>>(() =>
    Object.fromEntries(
      vendors.map((vendor) => [vendor.id, initialCard(vendor)])
    )
  )

  const cardOf = (vendor: AskVendor) => cards[vendor.id] ?? initialCard(vendor)
  const patch = (id: string, change: Partial<CardState>) =>
    setCards((all) => ({
      ...all,
      [id]: { ...(all[id] as CardState), ...change },
    }))
  const messageOf = (vendor: AskVendor) =>
    cardOf(vendor).edited ?? askMessage(vendor, cardOf(vendor).keys, signedAs)
  const hrefOf = (vendor: AskVendor) => askHref(vendor, messageOf(vendor))

  /** Opened, or confirmed: mark the ticked things Asked when the tick says so. */
  const asked = (vendor: AskVendor) => {
    const card = cardOf(vendor)
    if (card.opened) return
    if (!card.markAsked || card.keys.length === 0) {
      patch(vendor.id, { opened: true, marked: null, error: null })
      return
    }
    patch(vendor.id, { opened: true, working: true, error: null })
    markAsked
      .mutateAsync({ garages: [{ vendorId: vendor.id, kinds: card.keys }] })
      .then((result) =>
        patch(vendor.id, {
          working: false,
          marked: {
            count: result.marks.length,
            undo: askedUndoSteps(vendor.openMarks, result.marks),
          },
        })
      )
      .catch((error: unknown) =>
        patch(vendor.id, {
          working: false,
          marked: null,
          error: `Opened, but not marked as Asked: ${markErrorText(error)}`,
        })
      )
  }

  const undo = async (vendor: AskVendor) => {
    const card = cardOf(vendor)
    const steps = card.marked?.undo ?? []
    let done = 0
    patch(vendor.id, { working: true, error: null })
    try {
      for (const step of steps) {
        if (step.action === 'delete') {
          await removeMark.mutateAsync({
            vendorId: vendor.id,
            markId: step.markId,
          })
        } else {
          await updateMark.mutateAsync({
            vendorId: vendor.id,
            markId: step.markId,
            input: { status: step.status },
          })
        }
        done += 1
      }
      patch(vendor.id, { working: false, opened: false, marked: null })
    } catch (error) {
      // Only what is left is tried again.
      patch(vendor.id, {
        working: false,
        marked: card.marked && {
          ...card.marked,
          undo: steps.slice(done),
        },
        error: `Couldn’t undo: ${markErrorText(error)}`,
      })
    }
  }

  const next = vendors.find(
    (vendor) => !cardOf(vendor).opened && hrefOf(vendor)
  )

  return (
    // Header and footer stay put; only the cards scroll, and they end above
    // the footer rather than showing through under it.
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold text-text-primary">
            Ask on WhatsApp · {vendors.length} garage
            {vendors.length === 1 ? '' : 's'}
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Each message lists only what that garage is missing. Change the
            words if you like.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface"
        >
          <IconX size={18} aria-hidden />
        </button>
      </header>

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-5 py-4">
        {vendors.map((vendor) => (
          <li key={vendor.id}>
            <AskCard
              vendor={vendor}
              card={cardOf(vendor)}
              isNext={next?.id === vendor.id}
              message={messageOf(vendor)}
              href={hrefOf(vendor)}
              onChange={(change) => patch(vendor.id, change)}
              onOpened={() => asked(vendor)}
              onUndo={() => void undo(vendor)}
            />
          </li>
        ))}
      </ul>

      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-brand-black px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <p className="min-w-0 flex-1 text-[12px] text-text-muted">
          Opens WhatsApp on this phone or computer with the text filled in. You
          press Send. No paid account, no cost.
        </p>
        {next ? (
          <a
            href={hrefOf(next) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => asked(next)}
            className={scButtonClass({
              variant: 'main',
              fullWidth: false,
              className: 'h-11 px-5 text-[14px]',
            })}
          >
            <IconBrandWhatsapp size={16} aria-hidden />
            Open next: {next.businessName}
          </a>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className={scButtonClass({
              variant: 'outline',
              fullWidth: false,
              className: 'h-11 px-5 text-[14px]',
            })}
          >
            Done
          </button>
        )}
      </footer>
    </div>
  )
}

function AskCard({
  vendor,
  card,
  isNext,
  message,
  href,
  onChange,
  onOpened,
  onUndo,
}: {
  vendor: AskVendor
  card: CardState
  isNext: boolean
  message: string
  href: string | null
  onChange: (change: Partial<CardState>) => void
  onOpened: () => void
  onUndo: () => void
}) {
  const phone = askPhone(vendor)
  const name = vendor.businessName
  const who = ownerFirstName(vendor.owner) ?? name
  const missing = MISSING_KEYS.filter((key) => vendor.missing?.includes(key))

  if (card.opened) {
    return (
      <section
        aria-label={name}
        className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tone-done-tint text-tone-done-text">
          <IconCheck size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-text-primary">
            {name}
          </p>
          <p role="status" className="text-[12px] text-text-secondary">
            {href ? 'Opened in WhatsApp' : 'Asked'}
            {card.working
              ? ' · marking…'
              : card.marked
                ? ` · ${thingsCount(card.marked.count)} marked Asked today`
                : ''}
          </p>
          {card.error && (
            <p className="text-[12px] text-tone-attention-text">{card.error}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onUndo}
          disabled={card.working}
          aria-label={`Undo, ${name}`}
          className="min-h-9 shrink-0 rounded-full border border-border px-3 text-[12px] font-medium text-text-primary hover:bg-surface-elevated disabled:text-text-muted"
        >
          Undo
        </button>
      </section>
    )
  }

  return (
    <section
      aria-label={name}
      className={cn(
        'flex flex-col gap-3 rounded-[14px] border bg-surface px-4 py-3',
        isNext ? 'border-white/25' : 'border-border'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-[13px] font-semibold text-text-primary"
        >
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-text-primary">
            {name}
          </h3>
          <p className="truncate text-[12px] text-text-secondary">
            {[
              vendor.owner?.name,
              phone ? `WhatsApp ${displayPhone(phone)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {isNext && (
          <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-text-secondary">
            Next
          </span>
        )}
      </div>

      {missing.length > 0 ? (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Asks for, {name}</legend>
          <span aria-hidden className="text-[12px] text-text-muted">
            Asks for
          </span>
          {missing.map((key) => {
            const ticked = card.keys.includes(key)
            return (
              <label
                key={key}
                className={cn(
                  'inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px]',
                  ticked
                    ? 'border-white/25 text-text-primary'
                    : 'border-border text-text-muted line-through'
                )}
              >
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={(event) =>
                    onChange({
                      keys: event.target.checked
                        ? MISSING_KEYS.filter(
                            (k) => k === key || card.keys.includes(k)
                          )
                        : card.keys.filter((k) => k !== key),
                    })
                  }
                  className="size-3.5 accent-brand-white"
                />
                {MISSING_LABELS[key]}
              </label>
            )
          })}
        </fieldset>
      ) : (
        <p className="text-[12px] text-text-muted">
          Nothing missing on its page.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`ask-${vendor.id}`} className="sr-only">
          Message to {who}
        </label>
        <textarea
          id={`ask-${vendor.id}`}
          rows={4}
          value={message}
          onChange={(event) => onChange({ edited: event.target.value })}
          className="w-full resize-y rounded-[10px] border border-border bg-brand-black px-3 py-2.5 text-[13px] leading-relaxed text-text-primary outline-none focus:border-text-secondary"
        />
        {card.edited !== null && (
          <button
            type="button"
            onClick={() => onChange({ edited: null })}
            className="self-start text-[12px] text-text-secondary underline underline-offset-4 hover:text-text-primary"
          >
            Write it again from the ticks
          </button>
        )}
      </div>

      {card.error && (
        <p role="alert" className="text-[12px] text-tone-attention-text">
          {card.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ScCheckbox
          label="Mark these as Asked today"
          checked={card.markAsked && card.keys.length > 0}
          disabled={card.keys.length === 0}
          onChange={(checked) => onChange({ markAsked: checked })}
        />
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onOpened}
            aria-label={`Open in WhatsApp, ${name}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/25 px-4 text-[13px] font-medium text-text-primary hover:bg-surface-elevated"
          >
            <IconBrandWhatsapp size={15} aria-hidden />
            Open in WhatsApp
            <IconExternalLink
              size={13}
              aria-hidden
              className="text-text-muted"
            />
          </a>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <p className="text-[12px] text-tone-attention-text">
              No WhatsApp number: its numbers are missing or landlines.
            </p>
            {card.markAsked && card.keys.length > 0 && (
              <button
                type="button"
                onClick={onOpened}
                className="min-h-9 text-[12px] font-medium text-text-primary underline underline-offset-4"
              >
                Asked another way? Mark as Asked today
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
