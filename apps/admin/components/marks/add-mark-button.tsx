'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { IconFlag } from '@tabler/icons-react'
import type { AdminVendor } from '@repo/core/api/admin'
import { useCreateMark } from '@repo/core/api/hooks/use-admin-marks'
import { markLabel } from '@repo/core/onboarding-marks'
import { cn } from '@repo/core/utils'
import { ScModal } from '@repo/ui/sc/modal'
import {
  MarkForm,
  MarksOverlay,
  isMarkExists,
  markErrorText,
  type MarkDraft,
} from './mark-popover'

const plural = (n: number) => `${n} garage${n === 1 ? '' : 's'}`

/** "Glossy Doorstep, Point to Point Doorstep and 2 more". */
function namesLine(vendors: AdminVendor[]): string {
  const names = vendors.map((vendor) => vendor.businessName)
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

/**
 * The bulk bar's "Add mark": one form, and the same mark made on each ticked
 * garage. A garage that already has an open mark of that missing key keeps
 * its own (409 MARK_EXISTS), and the toast says how many did.
 */
export function AddMarkButton({ vendors }: { vendors: AdminVendor[] }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Garages this form has already added the mark to: a retry after a
  // partial failure sends it to the rest only, never a second copy.
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set())
  const create = useCreateMark()

  const submit = async (draft: MarkDraft) => {
    setBusy(true)
    setError(null)
    const todo = vendors.filter((vendor) => !doneIds.has(vendor.id))
    const results = await Promise.allSettled(
      todo.map((vendor) =>
        create.mutateAsync({
          vendorId: vendor.id,
          input: {
            kind: draft.kind,
            label: draft.label,
            note: draft.note || null,
            status: draft.status,
          },
        })
      )
    )
    setBusy(false)
    const done = new Set(doneIds)
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' || isMarkExists(result.reason))
        done.add(todo[index].id)
    })
    setDoneIds(done)
    const made =
      results.filter((result) => result.status === 'fulfilled').length +
      (vendors.length - todo.length)
    const had = results.filter(
      (result) => result.status === 'rejected' && isMarkExists(result.reason)
    ).length
    const failed = results.filter(
      (result) => result.status === 'rejected' && !isMarkExists(result.reason)
    ).length
    if (failed > 0) {
      const first = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected' && !isMarkExists(result.reason)
      )
      setError(
        `${made > 0 ? `Added to ${plural(made)}. ` : ''}Couldn’t add it to ${plural(failed)}: ${markErrorText(first?.reason)}`
      )
      return
    }
    const name = markLabel(draft.kind, draft.label)
    toast.success(
      had > 0
        ? `“${name}” added to ${plural(made)}. ${plural(had)} already had one.`
        : `“${name}” added to ${plural(made)}.`
    )
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        disabled={vendors.length === 0}
        onClick={() => {
          setError(null)
          setDoneIds(new Set())
          setOpen(true)
        }}
        className={cn(
          'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[13px] font-medium text-text-primary hover:bg-surface',
          'disabled:border-border disabled:text-text-muted'
        )}
      >
        <IconFlag size={14} aria-hidden />
        Add mark
      </button>
      {open && (
        <MarksOverlay>
          <ScModal
            open
            onClose={() => !busy && setOpen(false)}
            dismissible={!busy}
            aria-label="Add a mark"
            className="max-w-[420px]"
          >
            <MarkForm
              title={`Add a mark · ${plural(vendors.length)}`}
              subtitle={namesLine(vendors)}
              editing={false}
              busy={busy}
              error={error}
              submitLabel={
                vendors.length === 1
                  ? 'Add mark'
                  : `Add to ${plural(vendors.length)}`
              }
              onSubmit={(draft) => void submit(draft)}
              onCancel={() => !busy && setOpen(false)}
            />
          </ScModal>
        </MarksOverlay>
      )}
    </>
  )
}
