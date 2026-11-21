import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { shineScoreService } from './shine-score.service.js'
import type { CreateScanInput, ListChecksQuery, ReviewCheckInput, SuggestionsQuery } from './shine-score.validation.js'

type ShineContext = Context<{ Variables: AuthVariables }>

/** The signed-in customer: the only user a scan is ever made or read for. */
const userIdOf = (c: ShineContext) => c.get('auth').sub

export async function getConfig(c: Context) {
  return c.json({ success: true, data: shineScoreService.config() })
}

export async function getStatus(c: ShineContext) {
  const data = await shineScoreService.status(userIdOf(c))
  return c.json({ success: true, data })
}

export async function createScan(c: ShineContext, input: CreateScanInput) {
  const data = await shineScoreService.createScan(userIdOf(c), input)
  return c.json({ success: true, data }, 201)
}

export async function getScan(c: ShineContext, scanId: string) {
  const data = await shineScoreService.getScan(userIdOf(c), scanId)
  return c.json({ success: true, data })
}

export async function getSuggestions(c: ShineContext, query: SuggestionsQuery) {
  const data = await shineScoreService.suggestions(query)
  return c.json({ success: true, data })
}

export async function getForBooking(c: ShineContext, bookingId: string) {
  const data = await shineScoreService.forBooking(userIdOf(c), bookingId)
  return c.json({ success: true, data })
}

export async function listChecks(c: ShineContext, query: ListChecksQuery) {
  const data = await shineScoreService.listChecks(query)
  return c.json({ success: true, data })
}

export async function reviewCheck(c: ShineContext, id: string, input: ReviewCheckInput) {
  const data = await shineScoreService.reviewCheck(id, input)
  return c.json({ success: true, data })
}
