'use client'

import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconInfoCircle, IconSparkles, IconTrash } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScSelect } from '@repo/ui/sc/select'
import { ScSwitch } from '@repo/ui/sc/switch'
import { describeAdminService, getAdminAiConfig } from '@repo/core/api/admin'
import type { ServiceTemplate } from '@repo/core/api/admin-service-templates'
import {
  useCreateServiceTemplate,
  useDeleteServiceTemplate,
  useUpdateServiceTemplate,
} from '@repo/core/api/hooks/use-admin-service-templates'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { SERVICE_CATEGORY_OPTIONS } from '@repo/core/categories'
import { AutoGrowTextarea } from '@/components/auto-grow-textarea'
import { SignedAs } from '@/components/signed-as'
import { PRICING_OPTIONS, type PlainCategory } from '@/lib/service-editor'
import type { PricingType } from '@/lib/service-rows'
import {
  durationChoices,
  emptyTemplateForm,
  templateFormOf,
  templateFormProblem,
  templateHistory,
  templatePayload,
  type TemplateForm,
} from '@/lib/service-templates'

const FIELD =
  'min-h-11 w-full min-w-0 rounded-[10px] border border-border bg-surface px-3 text-[14px] text-text-primary outline-none transition-colors focus:border-text-secondary placeholder:text-text-muted'

/**
 * What the sheet is for: Add template (empty), Edit template (with On, its
 * history and Delete), or Save as template from a garage's service (filled
 * in from it, never its prices).
 */
export type TemplateSheetMode =
  | { kind: 'add' }
  | { kind: 'edit'; template: ServiceTemplate }
  | {
      kind: 'from-service'
      form: TemplateForm
      garageName: string
      serviceName: string
      /** The garage's id once it is saved; Add garage has none yet. */
      vendorId?: string
    }

/**
 * The template sheet (0082, mockup 3-templates screens 2 and 4): Name,
 * Category, Usual time, Priced by and Description with "Write with AI",
 * under the same rules as every description. The API refuses a description
 * that breaks them, with the reason, shown here. `mode` null is closed.
 */
export function ServiceTemplateSheet({
  mode,
  onClose,
  onSaved,
  onAuthError,
}: {
  mode: TemplateSheetMode | null
  onClose: () => void
  /** Told after a save or a delete, with what to announce. */
  onSaved?: (note: string, template: ServiceTemplate | null) => void
  onAuthError: () => void
}) {
  return (
    <ScSheet
      open={mode !== null}
      onClose={onClose}
      aria-label={mode?.kind === 'edit' ? 'Edit template' : mode?.kind === 'from-service' ? 'Save as template' : 'Add template'}
      className="max-w-[520px] px-5 pt-1"
    >
      {/* Keyed, so each opening starts from its own template's fields. */}
      {mode && (
        <SheetBody
          key={mode.kind === 'edit' ? mode.template.id : mode.kind}
          mode={mode}
          onClose={onClose}
          onSaved={onSaved}
          onAuthError={onAuthError}
        />
      )}
    </ScSheet>
  )
}

function SheetBody({
  mode,
  onClose,
  onSaved,
  onAuthError,
}: {
  mode: TemplateSheetMode
  onClose: () => void
  onSaved?: (note: string, template: ServiceTemplate | null) => void
  onAuthError: () => void
}) {
  const id = useId()
  const [form, setForm] = useState<TemplateForm>(() =>
    mode.kind === 'edit' ? templateFormOf(mode.template) : mode.kind === 'from-service' ? mode.form : emptyTemplateForm()
  )
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const create = useCreateServiceTemplate()
  const update = useUpdateServiceTemplate()
  const remove = useDeleteServiceTemplate()
  const busy = create.isPending || update.isPending || remove.isPending

  // Off unless the API says on, as in the editor: no key, no AI button.
  const { data: aiConfig } = useQuery({
    queryKey: ['admin', 'ai-config'],
    queryFn: getAdminAiConfig,
    staleTime: Infinity,
    retry: false,
  })
  const aiOn = aiConfig?.describe === true

  const set = (patch: Partial<TemplateForm>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setError(null)
  }

  const fail = (err: unknown, fallback: string) => {
    if (isAuthError(err)) return onAuthError()
    setError(errorMessage(err, fallback))
  }

  /** "Write with AI": the editor's own describer, under the same rules. */
  const write = async () => {
    setWriting(true)
    setAiError(null)
    try {
      const { description } = await describeAdminService({
        name: form.name.trim(),
        category: form.category,
        pricingType: form.pricingType,
        durationMins: form.durationMins ?? undefined,
      })
      set({ description })
    } catch (err) {
      if (isAuthError(err)) return onAuthError()
      setAiError(errorMessage(err, 'Couldn’t write a description.'))
    } finally {
      setWriting(false)
    }
  }

  const problem = templateFormProblem(form)

  const save = async () => {
    if (problem) return setError(problem)
    const payload = templatePayload(form)
    try {
      if (mode.kind === 'edit') {
        const saved = await update.mutateAsync({ id: mode.template.id, ...payload })
        onSaved?.(`“${saved.name}” saved.`, saved)
      } else {
        const saved = await create.mutateAsync(
          mode.kind === 'from-service'
            ? { ...payload, isOn: true, ...(mode.vendorId && { fromVendorId: mode.vendorId }) }
            : payload
        )
        onSaved?.(
          mode.kind === 'from-service'
            ? `“${saved.name}” saved as a template. Every garage can add it from “Add from template”.`
            : `“${saved.name}” added.`,
          saved
        )
      }
      onClose()
    } catch (err) {
      fail(err, 'Couldn’t save the template. Try again.')
    }
  }

  const deleteTemplate = async () => {
    if (mode.kind !== 'edit') return
    try {
      await remove.mutateAsync(mode.template.id)
      onSaved?.(`“${mode.template.name}” deleted.`, null)
      onClose()
    } catch (err) {
      fail(err, 'Couldn’t delete the template. Try again.')
    }
  }

  const title = mode.kind === 'edit' ? 'Edit template' : mode.kind === 'from-service' ? 'Save as template' : 'Add template'
  const sub =
    mode.kind === 'edit'
      ? 'Changes reach services added from now on. Garages that already added it keep their own copy.'
      : mode.kind === 'from-service'
        ? `From ${mode.garageName.trim() || 'this garage'}’s “${mode.serviceName}”. Check the words, then every garage can add it in one tap.`
        : 'A ready-made service the team adds to a garage in one tap. No prices: every garage sets its own.'
  const history = mode.kind === 'edit' ? templateHistory(mode.template) : null
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{sub}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-[12px] font-medium text-text-secondary">
          Name
        </label>
        <input
          id={`${id}-name`}
          value={form.name}
          maxLength={80}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Monsoon underbody wash"
          className={FIELD}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ScSelect
          label="Category"
          value={form.category}
          onChange={(e) => set({ category: e.target.value as PlainCategory })}
          className="min-h-11 text-[14px]"
        >
          {SERVICE_CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </ScSelect>
        <ScSelect
          label="Usual time"
          value={form.durationMins === null ? '' : String(form.durationMins)}
          onChange={(e) => set({ durationMins: e.target.value ? Number(e.target.value) : null })}
          className="min-h-11 text-[14px]"
        >
          {form.durationMins === null && <option value="">Pick one</option>}
          {durationChoices(form.durationMins).map((choice) => (
            <option key={choice.value} value={String(choice.value)}>
              {choice.label}
            </option>
          ))}
        </ScSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={`${id}-priced`} className="text-[12px] font-medium text-text-secondary">
          Priced by
        </span>
        <ScSegmented<PricingType>
          aria-label="Priced by"
          value={form.pricingType}
          onChange={(pricingType) => set({ pricingType })}
          options={PRICING_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex min-h-6 items-center justify-between gap-3">
          <label htmlFor={`${id}-description`} className="text-[12px] font-medium text-text-secondary">
            Description
          </label>
          {aiOn && (
            <button
              type="button"
              disabled={!form.name.trim() || writing || busy}
              title={form.name.trim() ? undefined : 'Name the template first'}
              onClick={() => void write()}
              className="-my-2.5 -mr-2 inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
            >
              <IconSparkles size={15} stroke={1.5} aria-hidden="true" />
              {writing ? 'Writing…' : 'Write with AI'}
            </button>
          )}
        </div>
        <AutoGrowTextarea
          id={`${id}-description`}
          rows={3}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          aria-describedby={hintId}
          className="text-[14px]"
        />
        <p id={hintId} className="text-[12px] text-text-muted">
          No prices or promises. Every garage sets its own price.
        </p>
        {aiError && (
          <p role="alert" className="text-[12.5px] text-error">
            {aiError}
          </p>
        )}
      </div>

      {mode.kind === 'from-service' ? (
        <p className="flex gap-2.5 rounded-[12px] bg-white/[0.05] px-3.5 py-3 text-[13px] leading-relaxed text-text-secondary">
          <IconInfoCircle size={17} stroke={1.5} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium text-text-primary">Prices are not saved.</span> Each garage sets its own.{' '}
            {mode.garageName.trim() || 'This garage'}’s service stays as it is.
          </span>
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3.5">
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] text-text-primary">On</span>
            <span className="text-[12.5px] text-text-secondary">Shows in “Add from template” for every garage</span>
          </span>
          <ScSwitch label="On" checked={form.isOn} onChange={(isOn) => set({ isOn })} disabled={busy} />
        </div>
      )}

      {history && <p className="text-[12.5px] text-text-secondary">{history}</p>}
      <SignedAs />

      {error && (
        <p id={errorId} role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}

      {confirmDelete && mode.kind === 'edit' ? (
        <div role="group" aria-label="Delete template" className="flex flex-col gap-3 rounded-[12px] border border-border p-3.5">
          <p className="text-[13.5px] text-text-primary">
            Delete “{mode.template.name}”? It goes from “Add from template”. Services garages already added from it stay as they are.
          </p>
          <div className="flex justify-end gap-2">
            <ScButton type="button" variant="outline" fullWidth={false} onClick={() => setConfirmDelete(false)} disabled={busy} className="min-h-11 px-5">
              Keep it
            </ScButton>
            <ScButton type="button" variant="main" fullWidth={false} onClick={() => void deleteTemplate()} disabled={busy} className="min-h-11 px-5">
              {remove.isPending ? 'Deleting…' : 'Delete template'}
            </ScButton>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {mode.kind === 'edit' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-[13.5px] font-medium text-text-secondary transition-colors hover:text-error disabled:opacity-50"
            >
              <IconTrash size={16} stroke={1.5} aria-hidden="true" />
              Delete
            </button>
          )}
          <span className="flex-1" />
          <ScButton type="button" variant="outline" fullWidth={false} onClick={onClose} disabled={busy} className="min-h-11 px-5">
            Cancel
          </ScButton>
          <ScButton
            type="submit"
            variant="main"
            fullWidth={false}
            disabled={busy || writing}
            aria-describedby={error ? errorId : undefined}
            className="min-h-11 px-6"
          >
            {create.isPending || update.isPending
              ? 'Saving…'
              : mode.kind === 'from-service'
                ? 'Save template'
                : 'Save'}
          </ScButton>
        </div>
      )}
    </form>
  )
}
