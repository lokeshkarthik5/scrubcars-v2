import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { leadsService } from '../leads/leads.service.js'
import type {
  DismissRecommendationInput,
  FromRecommendationInput,
} from '../leads/leads.validation.js'
import { coverageService } from './coverage.service.js'
import type { CreateZoneInput, UpdateZoneInput } from './coverage.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function overview(c: AdminContext) {
  return c.json({ success: true, data: await coverageService.overview() })
}

export async function createZone(c: AdminContext, input: CreateZoneInput) {
  return c.json(
    { success: true, data: await coverageService.createZone(input) },
    201
  )
}

export async function updateZone(
  c: AdminContext,
  id: string,
  input: UpdateZoneInput
) {
  return c.json({
    success: true,
    data: await coverageService.updateZone(id, input),
  })
}

export async function removeZone(c: AdminContext, id: string) {
  return c.json({ success: true, data: await coverageService.removeZone(id) })
}

export async function recommendationDuplicates(c: AdminContext, id: string) {
  return c.json({
    success: true,
    data: await leadsService.recommendationDuplicates(id),
  })
}

export async function fromRecommendation(
  c: AdminContext,
  id: string,
  input: FromRecommendationInput
) {
  return c.json(
    {
      success: true,
      data: await leadsService.fromRecommendation(id, input),
    },
    201
  )
}

export async function restoreRecommendation(c: AdminContext, id: string, input: DismissRecommendationInput) {
  return c.json({ success: true, data: await leadsService.restoreRecommendation(id, input.actorName) })
}

export async function dismissRecommendation(
  c: AdminContext,
  id: string,
  input: DismissRecommendationInput
) {
  return c.json({
    success: true,
    data: await leadsService.dismissRecommendation(id, input.actorName),
  })
}
