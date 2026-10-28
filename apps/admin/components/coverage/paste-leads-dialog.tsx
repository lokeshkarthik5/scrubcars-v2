'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import {
  previewPastedLeads,
  type CoverageZone,
  type PastePreview,
} from '@repo/core/api/admin-coverage'
import { useSavePastedLeads } from '@repo/core/api/hooks/use-admin-coverage'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { formatLeadPhone, MATCH_REASON_TEXT } from '@repo/core/leads'
import { cn } from '@repo/core/utils'
import { duplicateLine } from '@/lib/lead-form'
import { AssignSelect, ZoneSelect, type Assignee } from './lead-dialogs'

/**
 * Paste a list (mockup coverage-zones D8): "name, phone" lines from a sheet
 * or a chat become leads in one go, To target, in the zone picked. Preview
 * first: each line with its problem (it can't be kept) or the places it
 * looks like (unticked until the admin ticks it anyway). Nothing is saved
 * before "Save N leads".
 */
export function PasteLeadsDialog({
  zones,
  defaultZoneId,
  assignees,
  onClose,
}: {
  zones: CoverageZone[]
  defaultZoneId: string | null
  assignees: Assignee[]
  onClose: () => void
}) {
  const save = useSavePastedLeads()
  const [text, setText] = useState('')
  const [zoneId, setZoneId] = useState(defaultZoneId ?? '')
  const [assignee, setAssignee] = useState('')
  const [preview, setPreview] = useState<PastePreview | null>(null)
  const [kept, setKept] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const zoneName = zones.find((zone) => zone.id === zoneId)?.name ?? null
  const busy = loading || save.isPending

  const look = async () => {
    if (!text.trim() || busy) return
    setError('')
    setLoading(true)
    try {
      const result = await previewPastedLeads(text, zoneId || null)
      setPreview(result)
      // Lines without a problem or a lookalike start ticked.
      setKept(
        new Set(
          result.lines
            .filter((line) => !line.problem && line.duplicates.length === 0)
            .map((line) => line.line)
        )
      )
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t read the list. Try again.'))
    } finally {
      setLoading(false)
    }
  }

  const toggle = (line: number, on: boolean) =>
    setKept((current) => {
      const next = new Set(current)
      if (on) next.add(line)
      else next.delete(line)
      return next
    })

  const rows =
    preview?.lines.filter((line) => kept.has(line.line) && !line.problem) ?? []

  const submit = () => {
    if (rows.length === 0 || busy) return
    setError('')
    save.mutate(
      {
        zoneId: zoneId || null,
        assignedLoginId: assignee || null,
        rows: rows.map((line) => ({
          name: line.name,
          phone: line.phone,
          allowDuplicate: line.duplicates.length > 0,
        })),
      },
      {
        onSuccess: ({ added }) => {
          toast.success(
            `${added} ${added === 1 ? 'lead' : 'leads'} added${zoneName ? ` to ${zoneName}` : ''}`
          )
          onClose()
        },
        onError: (err) =>
          setError(errorMessage(err, 'Couldn’t save the list. Try again.')),
      }
    )
  }

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!busy}
      aria-label="Paste a list"
      className="max-w-[560px]"
    >
      <div className="flex flex-col gap-3.5">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            Paste a list
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            One garage a line: name and phone, as copied from a sheet or a chat.
            You see them before anything is saved.
          </p>
        </div>

        {!preview ? (
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault()
              void look()
            }}
          >
            <ScTextarea
              label="Names and phones, one a line"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={
                'Speed Wash, 98400 41230\nCar Spa Studio, 97900 10288'
              }
              autoFocus
            />
            <ZoneSelect value={zoneId} onChange={setZoneId} zones={zones} />
            <AssignSelect
              value={assignee}
              onChange={setAssignee}
              assignees={assignees}
            />
            {error && (
              <p role="alert" className="text-[12px] text-tone-attention-text">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <ScButton
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={busy}
                className="min-h-11"
              >
                Cancel
              </ScButton>
              <ScButton
                type="submit"
                variant="main"
                disabled={!text.trim() || busy}
                className="min-h-11"
              >
                {loading ? 'Reading…' : 'Preview'}
              </ScButton>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px] text-text-secondary">
              {preview.lines.length}{' '}
              {preview.lines.length === 1 ? 'line' : 'lines'} · to{' '}
              {zoneName ?? 'no zone'}
              {preview.tooMany && ` · only the first ${preview.max} are read`}
            </p>
            <ul
              aria-label="Pasted lines"
              className="flex max-h-[44vh] flex-col overflow-y-auto rounded-[12px] border border-border"
            >
              {preview.lines.map((line) => {
                const blocked = line.problem !== null
                return (
                  <li
                    key={line.line}
                    className="border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <label
                      className={cn(
                        'flex items-start gap-2.5',
                        blocked ? 'cursor-not-allowed' : 'cursor-pointer'
                      )}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Keep ${line.name || `line ${line.line}`}`}
                        checked={kept.has(line.line) && !blocked}
                        disabled={blocked}
                        onChange={(e) => toggle(line.line, e.target.checked)}
                        className="mt-1 size-4 shrink-0 accent-brand-white"
                      />
                      <span className="min-w-0 text-[12.5px]">
                        <span
                          className={cn(
                            'block',
                            blocked ? 'text-text-muted' : 'text-text-primary'
                          )}
                        >
                          {line.name || <em>No name</em>}
                          {line.phone && (
                            <span className="font-numeric text-text-secondary">
                              {' '}
                              · {formatLeadPhone(line.phone)}
                            </span>
                          )}
                        </span>
                        {line.problemText && (
                          <span className="block text-tone-attention-text">
                            Line {line.line}: {line.problemText}
                          </span>
                        )}
                        {line.duplicates.map((match) => (
                          <span
                            key={`${match.kind}:${match.id}`}
                            className="block text-tone-attention-text"
                          >
                            Looks like {duplicateLine(match)} (
                            {MATCH_REASON_TEXT[match.reason]}). Tick to save
                            anyway.
                          </span>
                        ))}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {error && (
              <p role="alert" className="text-[12px] text-tone-attention-text">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <ScButton
                type="button"
                variant="outline"
                onClick={() => setPreview(null)}
                disabled={busy}
                className="min-h-11"
              >
                Back
              </ScButton>
              <ScButton
                type="button"
                variant="main"
                onClick={submit}
                disabled={rows.length === 0 || busy}
                className="min-h-11"
              >
                {save.isPending
                  ? 'Saving…'
                  : `Save ${rows.length} ${rows.length === 1 ? 'lead' : 'leads'}`}
              </ScButton>
            </div>
          </div>
        )}
      </div>
    </ScModal>
  )
}
