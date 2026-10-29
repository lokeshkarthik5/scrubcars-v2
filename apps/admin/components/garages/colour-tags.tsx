'use client'

import { useId, useState } from 'react'
import { IconCheck, IconPalette } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdminVendor } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useGarageBoardSettings,
  useSetColourNames,
  useSetColourTags,
} from '@repo/core/api/hooks/use-admin-garage-board'
import {
  COLOUR_HINTS,
  COLOUR_NAME_MAX,
  COLOUR_TAGS,
  DEFAULT_COLOUR_NAMES,
  type ColourNames,
  type ColourTag,
} from '@repo/core/garage-target'
import { cn } from '@repo/core/utils'
import { AnchoredPopover } from '@/components/marks/anchored-popover'
import { MarksOverlay } from '@/components/marks/mark-popover'
import {
  COLOUR_FILTERS,
  COLOUR_STYLES,
  colourOf,
  colourSetLine,
  colourText,
  istToday,
  type ColourFilter,
} from '@/lib/garage-colours'

/** The team's colour names: as renamed, or the defaults until the API has them. */
export function useColourNames(): ColourNames {
  const { data } = useGarageBoardSettings()
  if (!data) return DEFAULT_COLOUR_NAMES
  const { green, amber, red, blue } = data.colourNames
  return { green, amber, red, blue }
}

function Dot({ tag }: { tag: ColourTag | null }) {
  return tag ? (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full', COLOUR_STYLES[tag].dot)}
    />
  ) : (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full border border-dashed border-text-muted"
    />
  )
}

/**
 * The chips above the table: each colour with its count, and "No colour"
 * (mockup garages-list A3). A second press clears the filter.
 */
export function ColourChips({
  counts,
  value,
  onChange,
}: {
  counts: Record<ColourFilter, number>
  value: ColourFilter | null
  onChange: (next: ColourFilter | null) => void
}) {
  const names = useColourNames()
  return (
    <div
      role="group"
      aria-label="Colour"
      className="flex items-center gap-2 md:flex-wrap"
    >
      <span className="shrink-0 text-[12px] text-text-secondary">Colour</span>
      {COLOUR_FILTERS.map((filter) => {
        const tag = filter === 'none' ? null : filter
        const active = value === filter
        const label = filter === 'none' ? 'No colour' : names[filter]
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : filter)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors md:min-h-9',
              active
                ? cn(
                    'bg-surface-elevated text-text-primary',
                    tag ? COLOUR_STYLES[tag].chip : 'border-text-primary'
                  )
                : 'border-border text-text-secondary hover:text-text-primary'
            )}
          >
            <Dot tag={tag} />
            {label}
            <span className="font-numeric text-text-muted">
              {counts[filter]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Pick a colour for one garage or several (mockup garages-list B): each
 * colour with its line, Call back with an optional day, No colour, who set
 * it last, and Rename colours.
 */
export function ColourPicker({
  vendors,
  anchor,
  onClose,
  now,
}: {
  vendors: AdminVendor[]
  anchor: HTMLElement | null
  onClose: () => void
  now: number
}) {
  const names = useColourNames()
  const id = useId()
  const set = useSetColourTags()
  const one = vendors.length === 1 ? vendors[0] : null
  const current = one ? colourOf(one) : null
  const [callOn, setCallOn] = useState(one?.colourTagCallOn ?? '')
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState(false)

  const choose = (tag: ColourTag | null) => {
    setError('')
    set.mutate(
      {
        vendorIds: vendors.map((v) => v.id),
        tag,
        ...(tag === 'blue' ? { callOn: callOn || null } : {}),
      },
      {
        onSuccess: () => {
          if (!one) {
            toast.success(
              tag
                ? `${vendors.length} garages coloured “${names[tag]}”`
                : `Colour taken off ${vendors.length} garages`
            )
          }
          onClose()
        },
        onError: (err) =>
          setError(errorMessage(err, "Couldn't set the colour. Try again.")),
      }
    )
  }

  const setLine = one ? colourSetLine(one, now) : null
  const title = one
    ? `Colour for ${one.businessName}`
    : `Colour for ${vendors.length} garages`

  // Renaming takes the picker's place, and gives it back when done.
  if (renaming) {
    return (
      <MarksOverlay>
        <RenameColoursDialog
          onClose={() => setRenaming(false)}
          // Saved: done with colours for now; the list shows the new names.
          onSaved={onClose}
        />
      </MarksOverlay>
    )
  }

  return (
    <MarksOverlay>
      <AnchoredPopover
        anchor={anchor}
        onClose={onClose}
        dismissible={!set.isPending}
        aria-label={title}
      >
        <div className="flex flex-col gap-1">
          <p className="pb-1 text-[12px] text-text-secondary">{title}</p>
          <ul className="flex flex-col">
            {COLOUR_TAGS.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  disabled={set.isPending}
                  onClick={() => choose(tag)}
                  aria-pressed={current === tag}
                  className={cn(
                    'flex min-h-11 w-full items-start gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors hover:bg-surface disabled:opacity-60',
                    current === tag && 'bg-surface'
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2.5 shrink-0 rounded-full',
                      COLOUR_STYLES[tag].dot
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-text-primary">
                      {names[tag]}
                    </span>
                    <span className="block text-[12px] text-text-secondary">
                      {tag === 'blue'
                        ? 'Add a day below: “Call back Thu”'
                        : COLOUR_HINTS[tag]}
                    </span>
                  </span>
                  {current === tag && (
                    <IconCheck
                      size={16}
                      aria-hidden
                      className="mt-1 shrink-0"
                    />
                  )}
                </button>
              </li>
            ))}
            <li className="px-2.5 pb-1 pl-8">
              <label
                htmlFor={`${id}-day`}
                className="text-[11px] font-medium text-text-secondary"
              >
                {names.blue} on (optional)
              </label>
              <input
                id={`${id}-day`}
                type="date"
                min={istToday(now)}
                value={callOn}
                onChange={(e) => setCallOn(e.target.value)}
                className="mt-1 min-h-10 w-full rounded-[10px] border border-border bg-surface px-3 font-numeric text-[13px] text-text-primary outline-none focus:border-text-secondary"
              />
            </li>
            <li>
              <button
                type="button"
                disabled={set.isPending}
                onClick={() => choose(null)}
                aria-pressed={one ? current === null : undefined}
                className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-2.5 text-left text-[14px] text-text-primary transition-colors hover:bg-surface disabled:opacity-60"
              >
                <Dot tag={null} />
                No colour
              </button>
            </li>
          </ul>
          {error && (
            <p role="alert" className="text-[12px] text-tone-attention-text">
              {error}
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-line pt-2 text-[12px] text-text-secondary">
            <span>
              {setLine ??
                (one
                  ? 'No colour yet'
                  : 'Every ticked garage gets the same colour')}
            </span>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="min-h-9 font-medium text-text-primary underline underline-offset-4"
            >
              Rename colours
            </button>
          </div>
        </div>
      </AnchoredPopover>
    </MarksOverlay>
  )
}

/** The Colour column: the tag (or "Set colour"), which opens the picker. */
export function ColourCell({
  vendor,
  now,
}: {
  vendor: AdminVendor
  now: number
}) {
  const names = useColourNames()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const tag = colourOf(vendor)
  const text = colourText(vendor, names, now)
  return (
    <>
      <button
        type="button"
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-label={`Colour for ${vendor.businessName}: ${text ?? 'none'}. Change`}
        className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-1 text-[12.5px] font-medium text-text-primary hover:underline"
      >
        <Dot tag={tag} />
        {text ?? <span className="text-text-muted">Set colour</span>}
      </button>
      {anchor && (
        <ColourPicker
          vendors={[vendor]}
          anchor={anchor}
          now={now}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  )
}

/** "Set colour" in the bulk bar: one colour on every ticked garage. */
export function BulkColourButton({
  vendors,
  now,
}: {
  vendors: AdminVendor[]
  now: number
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <button
        type="button"
        disabled={vendors.length === 0}
        onClick={(event) => setAnchor(event.currentTarget)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[13px] font-medium text-text-primary hover:bg-surface disabled:border-border disabled:text-text-muted"
      >
        <IconPalette size={14} aria-hidden />
        Set colour
      </button>
      {anchor && (
        <ColourPicker
          vendors={vendors}
          anchor={anchor}
          now={now}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  )
}

/**
 * Rename the colours once, for the whole team (mockup garages-list D6):
 * "Verified on call" instead of "All confirmed".
 */
export function RenameColoursDialog({
  onClose,
  onSaved = onClose,
}: {
  /** Cancel or Escape. */
  onClose: () => void
  /** After the names are saved; by default the same as closing. */
  onSaved?: () => void
}) {
  const current = useColourNames()
  const rename = useSetColourNames()
  const [names, setNames] = useState<ColourNames>(current)
  const [error, setError] = useState('')
  const blank = COLOUR_TAGS.some((tag) => !names[tag].trim())

  const save = () => {
    if (blank || rename.isPending) return
    setError('')
    rename.mutate(
      {
        green: names.green.trim(),
        amber: names.amber.trim(),
        red: names.red.trim(),
        blue: names.blue.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Colours renamed for the whole team')
          onSaved()
        },
        onError: (err) =>
          setError(
            errorMessage(err, "Couldn't rename the colours. Try again.")
          ),
      }
    )
  }

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!rename.isPending}
      aria-label="Rename colours"
      className="max-w-[420px]"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            Rename colours
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Everyone on the team sees the new names.
          </p>
        </div>
        {COLOUR_TAGS.map((tag) => (
          <div key={tag} className="flex items-center gap-2.5">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                COLOUR_STYLES[tag].dot
              )}
              aria-hidden
            />
            <ScInput
              aria-label={`Name for ${DEFAULT_COLOUR_NAMES[tag]}`}
              value={names[tag]}
              maxLength={COLOUR_NAME_MAX}
              onChange={(e) =>
                setNames((prev) => ({ ...prev, [tag]: e.target.value }))
              }
              className="min-h-11 flex-1"
            />
          </div>
        ))}
        {error && (
          <p role="alert" className="text-[12px] text-tone-attention-text">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <ScButton
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={onClose}
            className="min-h-11 px-4"
          >
            Cancel
          </ScButton>
          <ScButton
            type="submit"
            fullWidth={false}
            disabled={blank || rename.isPending}
            disabledReason={blank ? 'Give each colour a name' : undefined}
            className="min-h-11 px-4"
          >
            {rename.isPending ? 'Saving…' : 'Save names'}
          </ScButton>
        </div>
      </form>
    </ScModal>
  )
}
