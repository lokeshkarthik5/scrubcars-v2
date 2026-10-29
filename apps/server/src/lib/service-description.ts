import { bannedPhraseIn } from './copy-rules.js'
import type { TextClient } from './ai.js'
import { joinListText, splitListText } from './list-text.js'

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

/**
 * The shape asked for: `paragraph` (one or two sentences, as before) or
 * `points` (0064: the admin editor's Points mode): an optional one-line
 * intro, then 3 to 6 short "- " points, stored as plain text the way the
 * editor writes it (lib/list-text.ts), so the points survive the AI.
 */
export type DescriptionFormat = 'paragraph' | 'points'

/** Points mode: how many, and how long each part may be. */
export const POINTS_RULES = {
  min: 3,
  max: 6,
  pointMaxChars: 60,
  introMaxChars: 120,
  /** The whole text, intro and "- " lines together. */
  maxChars: 500,
} as const

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

  return claimProblem(text, durationGiven)
}

/**
 * The rules every description keeps whatever its shape: no claim Detlio
 * does not make, no price, and no time unless the admin gave one.
 */
function claimProblem(text: string, durationGiven: boolean): string | null {
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

/**
 * The model's points answer as the editor stores it: an optional intro
 * line, then "- " points, each trimmed of a closing full stop. Quotes, a
 * "Description:" label and stray blank lines are dropped.
 */
export function cleanPoints(raw: string): string {
  const text = raw
    .trim()
    .replace(/^description\s*:\s*/i, '')
    .replace(/^["'“‘]+|["'”’]+$/g, '')
  const { intro, points } = splitListText(text)
  return joinListText(
    intro.replace(/\s+/g, ' ').trim(),
    points.map((point) => point.replace(/\.+$/, '').trim())
  )
}

/**
 * Why a points description can't be used, or null when it can: 3 to 6
 * short points, an intro of one sentence at most, and the same claim, price
 * and time rules as a paragraph.
 */
export function pointsProblem(text: string, durationGiven: boolean): string | null {
  if (!text) return 'It was empty.'
  if (text.length > POINTS_RULES.maxChars) {
    return `It was ${text.length} characters; the limit is ${POINTS_RULES.maxChars}.`
  }
  const { intro, points } = splitListText(text)
  if (points.length < POINTS_RULES.min || points.length > POINTS_RULES.max) {
    return `It had ${points.length} points; write ${POINTS_RULES.min} to ${POINTS_RULES.max}, each on a line starting "- ".`
  }
  if (/[!?]/.test(text)) return 'It used an exclamation or question mark.'
  if (intro.includes('\n')) return 'The line before the points was more than one line.'
  if (intro.length > POINTS_RULES.introMaxChars) {
    return `The line before the points was ${intro.length} characters; the limit is ${POINTS_RULES.introMaxChars}.`
  }
  if (intro && intro.split(/(?<=\.)\s+/).filter(Boolean).length > 1) {
    return 'The line before the points was more than one sentence.'
  }
  const long = points.find((point) => point.length > POINTS_RULES.pointMaxChars)
  if (long) return `A point was ${long.length} characters; keep each under ${POINTS_RULES.pointMaxChars}.`
  return claimProblem(text, durationGiven)
}

/** The rules for a points answer, sent as the request's instructions. */
export function pointsInstructions(durationGiven: boolean): string {
  return [
    'You write the list a customer reads under a car-care service',
    'on Detlio, an app for booking car washes and detailing at garages in Chennai, India.',
    'Answer in plain text: optionally one short sentence first, then',
    `${POINTS_RULES.min} to ${POINTS_RULES.max} points, each on its own line starting with "- ",`,
    `each at most ${POINTS_RULES.pointMaxChars} characters, saying in general terms what the service includes,`,
    'in Indian English, without full stops at the end of the points.',
    'Do not mention prices, money or offers.',
    durationGiven
      ? 'Mention how long it takes only if it helps, using the time given.'
      : 'Do not say how long it takes.',
    'Make no claims or promises: nothing like guaranteed, lifetime, best, 100%, permanent,',
    'certified or verified, and no comparison with other garages.',
    'No exclamation marks, no emojis, and do not use the garage name.',
    'Answer with the text only, without quotes or a label.',
  ].join(' ')
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
  client: TextClient,
  format: DescriptionFormat = 'paragraph'
): Promise<DescriptionResult> {
  const durationGiven = Boolean(facts.durationMins)
  const points = format === 'points'
  const instructions = points ? pointsInstructions(durationGiven) : descriptionInstructions(durationGiven)
  const input = descriptionInput(facts)
  const clean = points ? cleanPoints : cleanDescription
  const check = points ? pointsProblem : descriptionProblem

  let problem: string | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await client.complete({
      instructions,
      input: problem
        ? `${input}\n\nYour last answer could not be used. ${problem} Write it again.`
        : input,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    const description = clean(raw)
    problem = check(description, durationGiven)
    if (!problem) return { ok: true, description }
  }
  return { ok: false, problem: problem ?? 'It was empty.' }
}
