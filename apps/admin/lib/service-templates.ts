/**
 * Settings → Service templates and the template sheet (0082, mockup
 * 3-templates): the list's groups and tabs, what a row says, the sheet's
 * form and what it sends. Pure, so it is tested here rather than in a page.
 */
import { CATEGORY_LABELS, PLAIN_CATEGORY_ORDER } from '@repo/core/categories'
import type { ServiceTemplate, ServiceTemplateShape } from '@repo/core/service-templates'
import { formatDay } from './format'
import {
  DURATION_PRESETS,
  PRICING_OPTIONS,
  durationLabel,
  rowDurationMins,
  type PlainCategory,
  type ServiceRow,
} from './service-editor'
import type { PricingType } from './service-rows'

export type TemplateTab = 'all' | 'on' | 'off'

export const TEMPLATE_TABS: Array<{ key: TemplateTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'on', label: 'On' },
  { key: 'off', label: 'Off' },
]

export function templateCounts(templates: readonly ServiceTemplate[]): Record<TemplateTab, number> {
  const on = templates.filter((template) => template.isOn).length
  return { all: templates.length, on, off: templates.length - on }
}

export function templatesForTab(templates: readonly ServiceTemplate[], tab: TemplateTab): ServiceTemplate[] {
  if (tab === 'all') return [...templates]
  return templates.filter((template) => template.isOn === (tab === 'on'))
}

/**
 * The list's headings: one per category that has templates, in the order
 * used everywhere (as the garage editor's), keeping the API's order within.
 */
export function templateGroups<T extends { category: PlainCategory }>(templates: readonly T[]) {
  return PLAIN_CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    templates: templates.filter((template) => template.category === category),
  })).filter((group) => group.templates.length > 0)
}

/** "By car type", "Same for all cars", "After inspection": the editor's words. */
export function pricedByLabel(pricingType: PricingType): string {
  return PRICING_OPTIONS.find((option) => option.value === pricingType)?.label ?? pricingType
}

/** The usual times the sheet offers: the editor's presets, then the longer jobs. */
export const TEMPLATE_DURATIONS: readonly number[] = [...DURATION_PRESETS, 180, 240, 1440]

/** The sheet's Usual time choices, with the template's own when it is none of them. */
export function durationChoices(current: number | null): Array<{ value: number; label: string }> {
  const values = current !== null && !TEMPLATE_DURATIONS.includes(current) ? [...TEMPLATE_DURATIONS, current] : TEMPLATE_DURATIONS
  return [...values].sort((a, b) => a - b).map((value) => ({ value, label: durationLabel(value) }))
}

/** "today", "yesterday" or "Tue 17 Nov", to sit inside a sentence. */
function dayInSentence(at: string, now: number): string {
  const day = formatDay(at, now)
  return day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
}

/**
 * Where a template came from and who last changed it, under the sheet's
 * switch: "Saved from Shine Auto Spa – Anna Nagar’s service by Priya, Tue
 * 17 Nov." Null for a built-in nobody has changed.
 */
export function templateHistory(template: ServiceTemplate, now: number = Date.now()): string | null {
  const parts: string[] = []
  if (template.builtIn) {
    // Nothing to say until someone changes it.
  } else if (template.sourceVendorId !== null || template.sourceVendorName !== null) {
    const from = template.sourceVendorName ? `${template.sourceVendorName}’s service` : 'a garage’s service'
    parts.push(`Saved from ${from}${template.createdByName ? ` by ${template.createdByName}` : ''}, ${dayInSentence(template.createdAt, now)}.`)
  } else {
    parts.push(`Added${template.createdByName ? ` by ${template.createdByName}` : ''}, ${dayInSentence(template.createdAt, now)}.`)
  }
  const changedLater = new Date(template.updatedAt).getTime() - new Date(template.createdAt).getTime() > 60_000
  if (changedLater && template.updatedByName) {
    parts.push(`Last changed by ${template.updatedByName}, ${dayInSentence(template.updatedAt, now)}.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}

// ─── The sheet ───────────────────────────────────────────────────────────────

/** The sheet's fields. `durationMins` null is "pick one" (a service with none set). */
export interface TemplateForm {
  name: string
  category: PlainCategory
  durationMins: number | null
  pricingType: PricingType
  description: string
  isOn: boolean
}

export const emptyTemplateForm = (): TemplateForm => ({
  name: '',
  category: 'car_wash',
  durationMins: 60,
  pricingType: 'per_vehicle',
  description: '',
  isOn: true,
})

export const templateFormOf = (template: ServiceTemplate): TemplateForm => ({
  name: template.name,
  category: template.category,
  durationMins: template.durationMins,
  pricingType: template.pricingType,
  description: template.description,
  isOn: template.isOn,
})

/**
 * Save as template: filled in from a garage's service, never its prices.
 * A service with no duration set leaves Usual time to pick.
 */
export function templateFormFromRow(row: ServiceRow): TemplateForm {
  return {
    name: row.name.trim(),
    category: row.category,
    durationMins: rowDurationMins(row) ?? null,
    pricingType: row.pricingType,
    description: row.description.trim(),
    isOn: true,
  }
}

/** What the sheet still needs before Save, or null. The words' rules are the API's. */
export function templateFormProblem(form: TemplateForm): string | null {
  if (!form.name.trim()) return 'Give the template a name.'
  if (form.durationMins === null) return 'Pick a usual time.'
  if (!form.description.trim()) return 'Write a description: what the service includes, in a sentence or two.'
  return null
}

/** The body Save sends. Never a price: a template has none. */
export function templatePayload(form: TemplateForm): ServiceTemplateShape & { isOn: boolean } {
  return {
    name: form.name.trim(),
    category: form.category,
    durationMins: form.durationMins ?? 60,
    pricingType: form.pricingType,
    description: form.description.trim(),
    isOn: form.isOn,
  }
}
