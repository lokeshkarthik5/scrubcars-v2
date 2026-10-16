import { bannedPhraseIn } from './copy-rules.js'
import type { TextClient } from './ai.js'

/**
 * "Write with AI" for a service's description in the admin editor: what is
 * asked, and what is accepted back.
 *
 * The answer is only a draft for a form field — the admin reads it, edits it
 * and saves it with the rest of the garage, like typed text. But a draft that
 * promised "lifetime protection" or quoted a price would be one tap from a
 * customer's screen, so every answer is checked against the same rules a
 * person's copy is, plus a few that only a model needs telling. A failed
 * answer is asked for once more, then refused.
 *
 * Only facts about the service and the garage's business name are sent:
 * never a person's name, phone or address.
 */

/** What the model is told about the service. All of it is public on the garage page. */
export interface ServiceFacts {
  name: string
  /** The category's label ("Car wash"), not its key. */
  categoryLabel: string
  pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
  durationMins?: number
  garageName?: string
}

/** The longest description accepted: about two lines on the garage page. */
export const DESCRIPTION_MAX_CHARS = 200

/**
 * Claims a model reaches for that the brand rules forbid, on top of
 * copy-rules' list (which already has guaranteed, lifetime, verified…). Kept
 * here rather than in BANNED_COPY because "best" or "never" can be fair in a
 * notice a person writes; it is the model's habit of overselling that they
 * stop.
 */
const MODEL_OVERCLAIMS: readonly string[] = [
  'best',
  '100%',
  'permanent',
  'permanently',
  'forever',
  'perfect',
  'perfectly',
  'showroom',
  'like new',
  'brand new',
]

const PRICE_PATTERN = /₹|\brs\.?(?=\s|\d|$)|\brupees?\b|\binr\b|\/-|\bprice[ds]?\b|\bcosts?\b/i
const TIME_PATTERN =
  /\b\d+(\.\d+)?\s*(-\s*\d+\s*)?(min|mins|minutes?|hrs?|hours?|days?)\b|\b(minutes?|hours?)\b/i

/**
 * The model's answer as a field would hold it: one line, no wrapping quotes,
 * no "Description:" label.
 */
export function cleanDescription(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^description\s*:\s*/i, '')
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .trim()
}

/**
 * Why a description can't be used, as a sentence to put back to the model —
 * or null when it can. `durationGiven` allows a mention of time, since the
 * admin set one.
 */
export function descriptionProblem(text: string, durationGiven: boolean): string | null {
  if (!text) return 'It was empty.'
  if (text.length > DESCRIPTION_MAX_CHARS) {
    return `It was ${text.length} characters; the limit is ${DESCRIPTION_MAX_CHARS}.`
  }
  if (/[!?]/.test(text)) return 'It used an exclamation or question mark.'
  if (!text.endsWith('.')) return 'It did not end with a full stop.'

  const sentences = text.split(/(?<=\.)\s+/).filter(Boolean)
  if (sentences.length > 2) return 'It was more than two sentences.'

  const banned = bannedPhraseIn(text)
  if (banned) return `It said "${banned}", which Detlio does not claim.`

  const normalised = text.toLowerCase()
  for (const phrase of MODEL_OVERCLAIMS) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(normalised)) {
      return `It said "${phrase}", which Detlio does not claim.`
    }
  }

  if (PRICE_PATTERN.test(text)) return 'It mentioned a price or money.'
  if (!durationGiven && TIME_PATTERN.test(text)) return 'It mentioned how long the service takes.'

  return null
}

const PRICING_WORDS: Record<ServiceFacts['pricingType'], string> = {
  flat: 'one price for every car',
  per_vehicle: 'priced by car type (hatchback, sedan, SUV)',
  on_inspection: 'an inspection first; the work is quoted after',
}

/** Durations the way a person says them: "45 minutes", "2 hours", "1 day". */
function durationWords(mins: number): string {
  if (mins % 1440 === 0) return mins === 1440 ? '1 day' : `${mins / 1440} days`
  if (mins % 60 === 0) return mins === 60 ? '1 hour' : `${mins / 60} hours`
  return `${mins} minutes`
}

/** The standing rules, sent as the request's instructions. */
export function descriptionInstructions(durationGiven: boolean): string {
  return [
    'You write the short description a customer reads under a car-care service',
    'on Detlio, an app for booking car washes and detailing at garages in Chennai, India.',
    `Write one or two plain sentences in Indian English, at most ${DESCRIPTION_MAX_CHARS} characters in all,`,
    'saying in general terms what the service includes.',
    'Do not mention prices, money or offers.',
    durationGiven
      ? 'Mention how long it takes only if it helps, using the time given.'
      : 'Do not say how long it takes.',
    'Make no claims or promises: nothing like guaranteed, lifetime, best, 100%, permanent,',
    'certified or verified, and no comparison with other garages.',
    'No exclamation marks, no emojis, and do not use the garage name.',
    'Answer with the description only, without quotes or a label.',
  ].join(' ')
}

/** The facts, one per line, sent as the request's input. */
export function descriptionInput(facts: ServiceFacts): string {
  return [
    `Service: ${facts.name}`,
    `Category: ${facts.categoryLabel}`,
    `Pricing: ${PRICING_WORDS[facts.pricingType]}`,
    facts.durationMins ? `Takes about: ${durationWords(facts.durationMins)}` : null,
    facts.garageName ? `Garage: ${facts.garageName}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

// Room for a reasoning model's thinking as well as two sentences: the
// ceiling covers both, and an answer that hits it comes back empty.
const MAX_OUTPUT_TOKENS = 1000

export type DescriptionResult =
  | { ok: true; description: string }
  | { ok: false; problem: string }

/**
 * Asks for a description, checks it, and asks once more with the reason if
 * it breaks a rule. An AiUnavailableError from the client is not caught: the
 * caller turns it into "try again later".
 */
export async function writeServiceDescription(
  facts: ServiceFacts,
  client: TextClient
): Promise<DescriptionResult> {
  const durationGiven = Boolean(facts.durationMins)
  const instructions = descriptionInstructions(durationGiven)
  const input = descriptionInput(facts)

  let problem: string | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await client.complete({
      instructions,
      input: problem
        ? `${input}\n\nYour last answer could not be used. ${problem} Write it again.`
        : input,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    const description = cleanDescription(raw)
    problem = descriptionProblem(description, durationGiven)
    if (!problem) return { ok: true, description }
  }
  return { ok: false, problem: problem ?? 'It was empty.' }
}
