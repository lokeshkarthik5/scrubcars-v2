'use client'

import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconArrowRight, IconPlus } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import {
  previewBranchServices,
  type AdminBranches,
  type BranchPlanItem,
  type BranchServicesChange,
  type BranchServicesPlan,
} from '@repo/core/api/admin-branches'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { cn } from '@repo/core/utils'
import {
  ALL_BRANCHES_NOTE,
  addedAtAll,
  allBranchesLabel,
  deleteLineText,
  lineFigures,
  lineNote,
  listOf,
  planNewText,
} from '@/lib/branch-groups'

type Choice = 'this' | 'all'

/**
 * The server's preview of "All N branches", read when that choice is picked
 * and again for every new change, never kept: it is what the save will be
 * checked against.
 */
function usePreview(vendorId: string, change: BranchServicesChange | null, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-branches', vendorId, 'preview', change],
    queryFn: () => previewBranchServices(vendorId, change!),
    enabled: enabled && change !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

function ChoiceCard({
  name,
  value,
  checked,
  onPick,
  title,
  sub,
  children,
}: {
  name: string
  value: Choice
  checked: boolean
  onPick: (value: Choice) => void
  title: string
  sub: string
  children?: React.ReactNode
}) {
  const subId = useId()
  return (
    <div
      className={cn(
        'rounded-[12px] border px-3.5 py-3 transition-colors',
        checked ? 'border-text-primary/70 bg-white/[0.03]' : 'border-border'
      )}
    >
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={() => onPick(value)}
          aria-describedby={subId}
          className="mt-1 size-4 shrink-0 accent-brand-white"
        />
        <span className="min-w-0">
          <span className="block text-[14px] text-text-primary">{title}</span>
          <span id={subId} className="block text-[12.5px] text-text-secondary">
            {sub}
          </span>
        </span>
      </label>
      {children}
    </div>
  )
}

/** One service's lines in the preview (mockup 3): before → after per branch, or "Added at all N". */
function PlanItemView({ item, count }: { item: BranchPlanItem; count: number }) {
  const heading =
    item.kind === 'new'
      ? `${item.name} (new)`
      : item.previousName
        ? `${item.name} (was “${item.previousName}”)`
        : item.name
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12.5px] text-text-secondary">{heading}</p>
      {item.kind === 'new' && addedAtAll(item.lines) ? (
        <p className="flex items-center gap-2 text-[13.5px] text-text-primary">
          <IconPlus size={14} aria-hidden="true" className="text-success" />
          <span>
            Added at all <span className="font-numeric">{count}</span>:{' '}
            <span className="font-numeric font-semibold">{planNewText(item.lines[0]!.after!)}</span>
          </span>
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {item.lines.map((line) => {
            const note = lineNote(line, item.kind)
            if (item.kind === 'delete') {
              return (
                <li key={line.vendorId} className="grid grid-cols-[minmax(88px,auto)_1fr] gap-x-3 text-[13.5px]">
                  <span className="text-text-primary">{line.branch}</span>
                  <span className={line.action === 'skip' ? 'text-text-muted' : 'text-text-primary'}>
                    {deleteLineText(line)}
                    {note && <span className="ml-1.5 text-warning">{note}</span>}
                  </span>
                </li>
              )
            }
            const figures = lineFigures(line)
            return (
              <li key={line.vendorId} className="grid grid-cols-[minmax(88px,auto)_1fr] gap-x-3 text-[13.5px]">
                <span className="text-text-primary">{line.branch}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 font-numeric">
                  {figures.before && (
                    <>
                      <s className="text-text-muted">{figures.before}</s>
                      <IconArrowRight size={13} aria-label="to" className="text-text-muted" />
                    </>
                  )}
                  <span className="font-semibold text-text-primary">{figures.after}</span>
                  {note && <span className="font-sans text-warning">{note}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function PreviewBody({ plan, count }: { plan: BranchServicesPlan; count: number }) {
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3 pl-7">
      {plan.items.map((item, index) => (
        <PlanItemView key={`${item.kind}-${item.name}-${index}`} item={item} count={count} />
      ))}
    </div>
  )
}

function PreviewState({ query }: { query: ReturnType<typeof usePreview> }) {
  if (query.isError) {
    return (
      <p role="alert" className="mt-2 pl-7 text-[12.5px] text-warning">
        {errorMessage(query.error, 'Couldn’t work out the changes for every branch.')}
      </p>
    )
  }
  return (
    <p role="status" className="mt-2 pl-7 text-[12.5px] text-text-muted">
      Working out what changes where…
    </p>
  )
}

/**
 * Save changes for a garage in a group (0081, mockup 2-branches-4): "This
 * branch only" saves as before; "All N branches" lists what changes where
 * (the server's preview, the same rules as the save) and saves every branch
 * at once. Hours, photos, team and bank never go to the others.
 */
export function SaveForSheet({
  open,
  onClose,
  vendorId,
  branches,
  change,
  saving,
  onSave,
}: {
  open: boolean
  onClose: () => void
  vendorId: string
  branches: AdminBranches
  change: BranchServicesChange | null
  saving: boolean
  /** null: this branch only; else the previewed plan's key. */
  onSave: (allBranchesKey: string | null) => Promise<boolean>
}) {
  const name = useId()
  const [choice, setChoice] = useState<Choice>('this')
  const preview = usePreview(vendorId, change, open && choice === 'all')
  const count = branches.group?.count ?? branches.branches.length
  const here = branches.branches.find((branch) => branch.isCurrent)
  const close = () => {
    if (saving) return
    setChoice('this')
    onClose()
  }
  const save = async () => {
    const key = choice === 'all' ? (preview.data?.key ?? null) : null
    if (choice === 'all' && !key) return
    if (await onSave(key)) {
      setChoice('this')
      onClose()
    }
  }

  return (
    <ScSheet open={open} onClose={close} dismissible={!saving} aria-label="Save for" className="flex flex-col gap-3 px-4 pt-2">
      <h2 className="text-[16px] font-semibold text-text-primary">Save for</h2>
      <div role="radiogroup" aria-label="Save for" className="flex flex-col gap-2">
        <ChoiceCard
          name={name}
          value="this"
          checked={choice === 'this'}
          onPick={setChoice}
          title="This branch only"
          sub={here?.label ?? 'This garage'}
        />
        <ChoiceCard
          name={name}
          value="all"
          checked={choice === 'all'}
          onPick={setChoice}
          title={allBranchesLabel(count)}
          sub={listOf(branches.branches.map((branch) => branch.label))}
        >
          {choice === 'all' &&
            (preview.data ? <PreviewBody plan={preview.data} count={count} /> : <PreviewState query={preview} />)}
        </ChoiceCard>
      </div>
      <p className="text-[12px] text-text-muted">{ALL_BRANCHES_NOTE}</p>
      <div className="flex justify-end gap-2">
        <ScButton type="button" variant="outline" fullWidth={false} onClick={close} disabled={saving} className="min-h-11 px-5">
          Cancel
        </ScButton>
        <ScButton
          type="button"
          variant="main"
          fullWidth={false}
          onClick={() => void save()}
          disabled={saving || (choice === 'all' && !preview.data)}
          className="min-h-11 px-5"
        >
          {saving ? 'Saving…' : choice === 'all' ? `Save for all ${count} branches` : 'Save for this branch'}
        </ScButton>
      </div>
    </ScSheet>
  )
}

/**
 * Delete for a garage in a group (0081, mockup 2-branches-4, left): this
 * branch only, or all of them; a branch without the service is skipped,
 * and the preview says so. Past bookings keep it either way.
 */
export function BranchDeleteSheet({
  target,
  onClose,
  vendorId,
  branches,
  error,
  onDelete,
}: {
  target: { id: string; name: string } | null
  onClose: () => void
  vendorId: string
  branches: AdminBranches
  error?: string
  onDelete: (allBranchesKey: string | null) => Promise<boolean>
}) {
  const name = useId()
  const [choice, setChoice] = useState<Choice>('this')
  const [busy, setBusy] = useState(false)
  const change: BranchServicesChange | null = target ? { kind: 'delete', serviceId: target.id } : null
  const preview = usePreview(vendorId, change, target !== null && choice === 'all')
  const count = branches.group?.count ?? branches.branches.length
  const here = branches.branches.find((branch) => branch.isCurrent)
  const close = () => {
    if (busy) return
    setChoice('this')
    onClose()
  }
  const run = async () => {
    const key = choice === 'all' ? (preview.data?.key ?? null) : null
    if (choice === 'all' && !key) return
    setBusy(true)
    const done = await onDelete(key)
    setBusy(false)
    if (done) setChoice('this')
  }

  return (
    <ScSheet
      open={target !== null}
      onClose={close}
      dismissible={!busy}
      aria-label={target ? `Delete ${target.name}?` : 'Delete this service?'}
      className="flex flex-col gap-3 px-4 pt-2"
    >
      <h2 className="text-[16px] font-semibold text-text-primary">
        {target ? `Delete ${target.name}?` : 'Delete this service?'}
      </h2>
      <div role="radiogroup" aria-label="Delete at" className="flex flex-col gap-2">
        <ChoiceCard
          name={name}
          value="this"
          checked={choice === 'this'}
          onPick={setChoice}
          title="This branch only"
          sub={here?.label ?? 'This garage'}
        />
        <ChoiceCard
          name={name}
          value="all"
          checked={choice === 'all'}
          onPick={setChoice}
          title={allBranchesLabel(count)}
          sub={listOf(branches.branches.map((branch) => branch.label))}
        >
          {choice === 'all' &&
            (preview.data ? <PreviewBody plan={preview.data} count={count} /> : <PreviewState query={preview} />)}
        </ChoiceCard>
      </div>
      <p className="text-[12px] text-text-muted">Past bookings keep it.</p>
      {error && (
        <p role="alert" className="text-[12.5px] text-warning">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <ScButton type="button" variant="outline" fullWidth={false} onClick={close} disabled={busy} className="min-h-11 px-5">
          Cancel
        </ScButton>
        <ScButton
          type="button"
          variant="danger-outline"
          fullWidth={false}
          onClick={() => void run()}
          disabled={busy || (choice === 'all' && !preview.data)}
          className="min-h-11 px-5"
        >
          {busy ? 'Deleting…' : 'Delete'}
        </ScButton>
      </div>
    </ScSheet>
  )
}
