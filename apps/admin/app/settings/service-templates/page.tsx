'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconPencil, IconPlus } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { ScSwitch } from '@repo/ui/sc/switch'
import type { ServiceTemplate } from '@repo/core/api/admin-service-templates'
import {
  useAdminServiceTemplates,
  useSetServiceTemplateOn,
} from '@repo/core/api/hooks/use-admin-service-templates'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { cn } from '@repo/core/utils'
import { CategoryIcon } from '@/components/category-icon'
import { ServiceTemplateSheet, type TemplateSheetMode } from '@/components/service-template-sheet'
import { durationLabel } from '@/lib/service-editor'
import {
  TEMPLATE_TABS,
  pricedByLabel,
  templateCounts,
  templateGroups,
  templatesForTab,
  type TemplateTab,
} from '@/lib/service-templates'

/** Template, Usual time, Priced by, On, Edit: one line from md, stacked on a phone. */
const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1fr)_96px_140px_56px_88px]'

/**
 * Settings → Service templates (0082, mockup 3-templates screen 1): every
 * ready-made service the team can add to a garage, grouped by kind of work,
 * with its usual time, how it is priced and its description. The built-in
 * ones are here too ("Built in") and are edited, switched off or deleted
 * like the rest. The switch saves at once; Edit opens the template sheet.
 */
export default function ServiceTemplatesPage() {
  const router = useRouter()
  const { data, error, isPending, refetch } = useAdminServiceTemplates()
  const switchOn = useSetServiceTemplateOn()
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const [tab, setTab] = useState<TemplateTab>('all')
  const [sheet, setSheet] = useState<TemplateSheetMode | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')

  const templates = data ?? []
  const counts = templateCounts(templates)
  const groups = templateGroups(templatesForTab(templates, tab))

  const toggle = async (template: ServiceTemplate, on: boolean) => {
    setBusyId(template.id)
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[template.id]
      return next
    })
    try {
      await switchOn.mutateAsync({ id: template.id, on })
      setNote(on ? `“${template.name}” is on.` : `“${template.name}” is off. It no longer shows in “Add from template”.`)
    } catch (err) {
      if (isAuthError(err)) return router.replace('/login')
      setRowErrors((prev) => ({ ...prev, [template.id]: errorMessage(err, 'Couldn’t save that. Try again.') }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Service templates"
        subtitle="Ready-made services the team adds to a garage in one tap. No prices: every garage sets its own."
        backHref="/settings"
        actions={
          <ScButton
            type="button"
            variant="main"
            fullWidth={false}
            onClick={() => setSheet({ kind: 'add' })}
            className="h-11 px-4 text-[13px]"
          >
            <IconPlus size={17} stroke={1.8} aria-hidden="true" /> Add template
          </ScButton>
        }
      />

      {/* Always mounted, so each switch, save and delete is announced. */}
      <p role="status" className="sr-only">
        {note}
      </p>

      {isPending ? (
        <SkeletonList count={6} itemClassName="h-16" />
      ) : error ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load the service templates')}
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_TABS.map((t) => (
                <FilterChip
                  key={t.key}
                  label={t.label}
                  count={counts[t.key]}
                  active={tab === t.key}
                  onClick={() => setTab(t.key)}
                />
              ))}
            </div>
            <p className="text-[12.5px] text-text-muted">Off hides it from “Add from template” without deleting it.</p>
          </div>

          <section
            aria-label={`${TEMPLATE_TABS.find((t) => t.key === tab)!.label} templates`}
            className="overflow-hidden rounded-[16px] border border-border bg-surface"
          >
            {groups.length === 0 ? (
              <EmptyState
                title={tab === 'off' ? 'None switched off' : tab === 'on' ? 'None switched on' : 'No templates yet'}
                subtitle={
                  tab === 'all'
                    ? 'Add one here, or use Save as template on any garage’s service.'
                    : 'Switch one with its On switch.'
                }
              />
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className={cn(ROW_GRID, 'hidden border-b border-border px-4 py-3 text-[12px] font-medium text-text-muted md:grid')}
                >
                  <span>Template</span>
                  <span>Usual time</span>
                  <span>Priced by</span>
                  <span>On</span>
                  <span />
                </div>
                {groups.map((group) => (
                  <div key={group.category} role="group" aria-labelledby={`templates-${group.category}`}>
                    <h2
                      id={`templates-${group.category}`}
                      className="flex items-center gap-2 border-b border-border bg-white/[0.022] px-4 py-2.5 text-[13.5px] font-medium text-text-primary"
                    >
                      <CategoryIcon category={group.category} size={15} className="shrink-0 text-text-secondary" />
                      {group.label}
                      <span className="font-numeric text-[12.5px] font-normal text-text-muted">{group.templates.length}</span>
                    </h2>
                    <ul>
                      {group.templates.map((template) => (
                        <TemplateRow
                          key={template.id}
                          template={template}
                          busy={busyId === template.id}
                          error={rowErrors[template.id]}
                          onToggle={(on) => void toggle(template, on)}
                          onEdit={() => setSheet({ kind: 'edit', template })}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </section>
        </>
      )}

      <ServiceTemplateSheet
        mode={sheet}
        onClose={() => setSheet(null)}
        onSaved={(text) => setNote(text)}
        onAuthError={() => router.replace('/login')}
      />
    </div>
  )
}

function TemplateRow({
  template,
  busy,
  error,
  onToggle,
  onEdit,
}: {
  template: ServiceTemplate
  busy: boolean
  error?: string
  onToggle: (on: boolean) => void
  onEdit: () => void
}) {
  const off = !template.isOn
  return (
    <li aria-label={template.name} className="border-b border-line px-4 py-3 last:border-b-0">
      <div className={ROW_GRID}>
        <div className={cn('min-w-0', off && 'opacity-55')}>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14.5px] font-medium text-text-primary">{template.name}</span>
            {template.builtIn && (
              <span className="rounded-[6px] bg-white/[0.07] px-1.5 py-0.5 text-[11px] font-medium text-text-secondary">
                Built in
              </span>
            )}
            {template.isNew && (
              <span className="rounded-[6px] bg-tone-attention-tint px-1.5 py-0.5 text-[11px] font-medium text-tone-attention-text">
                New
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[12.5px] text-text-secondary" title={template.description}>
            {template.description}
          </p>
          {/* On a phone the time and pricing sit under the description. */}
          <p className="mt-0.5 text-[12.5px] text-text-muted md:hidden">
            <span className="font-numeric">{durationLabel(template.durationMins)}</span> · {pricedByLabel(template.pricingType)}
          </p>
        </div>
        <span className={cn('hidden font-numeric text-[13.5px] font-medium text-text-primary md:block', off && 'opacity-55')}>
          {durationLabel(template.durationMins)}
        </span>
        <span className={cn('hidden text-[13.5px] text-text-secondary md:block', off && 'opacity-55')}>
          {pricedByLabel(template.pricingType)}
        </span>
        <div className="col-start-2 row-start-1 flex items-center gap-1 md:col-start-auto md:row-start-auto md:contents">
          <ScSwitch
            label={`${template.name} on`}
            checked={template.isOn}
            disabled={busy}
            onChange={onToggle}
            className="md:-ml-1.5"
          />
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${template.name}`}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-elevated"
          >
            <IconPencil size={15} stroke={1.5} aria-hidden="true" />
            <span className="hidden sm:inline">Edit</span>
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[12.5px] text-error">
          {error}
        </p>
      )}
    </li>
  )
}
