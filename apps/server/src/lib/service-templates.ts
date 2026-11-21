/**
 * Service templates (0082): the rules a template's words keep, and when one
 * counts as new.
 *
 * A template is what every garage's row starts from, so its words reach
 * customers' screens once a garage adds it. They keep the same rules as
 * every service description (lib/service-description.ts, the rules the AI
 * writer's answers are held to): no prices, no times (the usual time is its
 * own field), no claims Detlio does not make, and never "ask the garage"
 * (a customer has no way to reach a garage before booking). The save refuses
 * a description that breaks them, with the reason in plain words.
 *
 * Twin: packages/core/src/service-templates.ts holds serviceNameKey and
 * TEMPLATE_NEW_DAYS for the panel (service-templates.parity.test.ts). Pure.
 */
import { bannedPhraseIn } from './copy-rules.js'
import { hasPoints } from './list-text.js'
import { PRICE_PATTERN, descriptionProblem, pointsProblem } from './service-description.js'

/** The longest template name: about a chip's width. */
export const TEMPLATE_NAME_MAX_CHARS = 80

/** A template the team added this long ago or less is marked "New" in the editor. */
export const TEMPLATE_NEW_DAYS = 14

/** The usual time, in minutes: up to a week. */
export const TEMPLATE_MAX_DURATION_MINS = 7 * 1440

/** A name as two services are compared: case, spacing and punctuation aside. */
export function serviceNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Whether two template names are the same one: by serviceNameKey, or, where
 * that leaves nothing (a name in Tamil, say: it keeps only a–z and 0–9), by
 * the database's own rule, lower case and trimmed. Without this every
 * non-English name read as the same, and the second was refused.
 */
export function sameTemplateName(a: string, b: string): boolean {
  const keyA = serviceNameKey(a)
  const keyB = serviceNameKey(b)
  if (keyA || keyB) return keyA === keyB
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Words that send a customer to the garage before booking, which they can't do. */
const ASK_THE_GARAGE = /\b(ask|contact|call)\b/i

/** "It mentioned a price" → "it mentioned a price", to follow a colon. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/**
 * Why a template's description can't be saved, as a sentence for the
 * admin, or null when it can. A paragraph of one or two sentences, or an
 * intro and 3 to 6 "- " points, as the editor's two modes write them.
 */
export function templateDescriptionProblem(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return 'Write a description: what the service includes, in a sentence or two.'
  const problem = hasPoints(trimmed) ? pointsProblem(trimmed, false) : descriptionProblem(trimmed, false)
  if (problem) return `The description can’t be saved: ${lowerFirst(problem)}`
  if (ASK_THE_GARAGE.test(trimmed)) {
    return 'The description can’t be saved: it tells customers to ask, call or contact the garage, and they can’t reach a garage before booking.'
  }
  return null
}

/** Why a template's name can't be saved, or null when it can. */
export function templateNameProblem(name: string): string | null {
  const trimmed = name.trim()
  // Punctuation alone is no name. Any script's letters count: a Tamil name is one.
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return 'Give the template a name.'
  if (trimmed.length > TEMPLATE_NAME_MAX_CHARS) {
    return `The name is ${trimmed.length} characters; the limit is ${TEMPLATE_NAME_MAX_CHARS}.`
  }
  const banned = bannedPhraseIn(trimmed)
  if (banned) return `The name can’t be saved: it says “${banned}”, which Detlio does not claim.`
  // The name becomes each garage's service name: never a price, as the
  // description never has one.
  if (PRICE_PATTERN.test(trimmed)) return 'The name can’t be saved: it mentions a price or money. Every garage sets its own.'
  return null
}

/**
 * Marked "New" in the editor: one the team added in the last 14 days. The
 * built-ins never are, though they were all created the day 0082 ran.
 */
export function templateIsNew(template: { builtIn: boolean; createdAt: Date }, now: Date = new Date()): boolean {
  if (template.builtIn) return false
  return now.getTime() - template.createdAt.getTime() < TEMPLATE_NEW_DAYS * 86_400_000
}
